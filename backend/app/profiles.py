"""Company-info enrichment: Yahoo Finance quoteSummary -> company_profiles.

Keyless Yahoo, same precedent as ``indices.py`` / ``market_news.py``: plain
``requests`` (no yfinance / C extensions, Python 3.14 safe) with an in-process
crumb+cookie cache. Write-through to Postgres when ``DATABASE_URL`` is set;
otherwise served live (uncached) so the endpoint still works without a DB.

Yahoo's quoteSummary now requires a crumb tied to a cookie, so we fetch one
lazily and refresh it on a 401/403 (the bot self-heals like the AI web-search
path). Equities only for now — Yahoo has no usable feed for Alpaca crypto pairs.
"""

from __future__ import annotations

import logging
import threading
from datetime import datetime, timezone

import requests

from . import db
from .config import get_settings

_log = logging.getLogger(__name__)

_HEADERS = {
    "User-Agent": "Mozilla/5.0 (compatible; trading-platform/1.0)",
    "Accept": "application/json",
}
_MODULES = "assetProfile,summaryDetail,price,defaultKeyStatistics,financialData"
_BASE = "https://query2.finance.yahoo.com/v10/finance/quoteSummary/"
_TTL = 7 * 24 * 3600  # refresh weekly; fundamentals move slowly

_lock = threading.Lock()
_session: requests.Session | None = None
_crumb: str | None = None


class ProfileNotFound(LookupError):
    """Yahoo returned no company data for the symbol."""


def _ensure_crumb() -> None:
    global _session, _crumb
    if _session is not None and _crumb:
        return
    s = requests.Session()
    s.headers.update(_HEADERS)
    # Seed cookies (the request itself may 404 — only the Set-Cookie matters).
    s.get("https://fc.yahoo.com", timeout=10)
    r = s.get("https://query2.finance.yahoo.com/v1/test/getcrumb", timeout=10)
    crumb = (r.text or "").strip()
    if not crumb or "<" in crumb:
        raise RuntimeError("could not obtain Yahoo crumb")
    _session, _crumb = s, crumb


def _reset_crumb() -> None:
    global _session, _crumb
    _session, _crumb = None, None


def _fetch_fmp(symbol: str) -> dict:
    url = "https://financialmodelingprep.com/stable/profile"
    params = {"symbol": symbol, "apikey": get_settings().fmp_api_key}
    r = requests.get(url, params=params, headers=_HEADERS, timeout=10)
    r.raise_for_status()
    result = r.json() or []
    if not result:
        raise ProfileNotFound(symbol)
    return result[0]


def _map_fmp(symbol: str, data: dict) -> dict:
    return {
        "symbol": symbol,
        "name": data.get("companyName"),
        "exchange": data.get("exchange"),
        "sector": data.get("sector"),
        "industry": data.get("industry"),
        "market_cap": int(data.get("marketCap")) if data.get("marketCap") else None,
        "description": data.get("description"),
        "website": data.get("website"),
        "employees": int(data["fullTimeEmployees"]) if data.get("fullTimeEmployees") else None,
        "logo_url": data.get("image"),
        "fundamentals": {},  # FMP doesn't provide the same fundamentals shape
    }


def _fetch_yahoo(symbol: str) -> dict:
    with _lock:
        _ensure_crumb()
        assert _session is not None
        params = {"modules": _MODULES, "crumb": _crumb}
        r = _session.get(_BASE + symbol, params=params, timeout=10)
        if r.status_code in (401, 403):
            _reset_crumb()
            _ensure_crumb()
            params["crumb"] = _crumb
            r = _session.get(_BASE + symbol, params=params, timeout=10)
        r.raise_for_status()
        result = (r.json().get("quoteSummary") or {}).get("result") or []
        if not result:
            raise ProfileNotFound(symbol)
        return result[0]


def _raw(d: dict, key: str):
    v = d.get(key)
    return v.get("raw") if isinstance(v, dict) else v


def _map(symbol: str, data: dict) -> dict:
    ap = data.get("assetProfile") or {}
    pr = data.get("price") or {}
    sd = data.get("summaryDetail") or {}
    ks = data.get("defaultKeyStatistics") or {}
    fd = data.get("financialData") or {}

    market_cap = _raw(pr, "marketCap") or _raw(sd, "marketCap")
    fundamentals = {
        "trailing_pe": _raw(sd, "trailingPE"),
        "forward_pe": _raw(sd, "forwardPE"),
        "beta": _raw(sd, "beta") or _raw(ks, "beta"),
        "dividend_yield": _raw(sd, "dividendYield"),
        "fifty_two_week_high": _raw(sd, "fiftyTwoWeekHigh"),
        "fifty_two_week_low": _raw(sd, "fiftyTwoWeekLow"),
        "profit_margin": _raw(ks, "profitMargins"),
        "total_revenue": _raw(fd, "totalRevenue"),
        "recommendation": fd.get("recommendationKey"),
    }
    fundamentals = {k: v for k, v in fundamentals.items() if v is not None}

    return {
        "symbol": symbol,
        "name": pr.get("longName") or pr.get("shortName"),
        "exchange": pr.get("exchangeName"),
        "sector": ap.get("sector"),
        "industry": ap.get("industry"),
        "market_cap": int(market_cap) if market_cap else None,
        "description": ap.get("longBusinessSummary"),
        "website": ap.get("website"),
        "employees": ap.get("fullTimeEmployees"),
        "logo_url": None,  # Yahoo doesn't supply one; reserved for a later source
        "fundamentals": fundamentals,
    }


def _fresh(updated_at) -> bool:
    if not isinstance(updated_at, datetime):
        return False
    if updated_at.tzinfo is None:
        updated_at = updated_at.replace(tzinfo=timezone.utc)
    return (datetime.now(timezone.utc) - updated_at).total_seconds() < _TTL


def get_company_profile(symbol: str) -> dict:
    """DB-cached company profile (write-through). Prefers Yahoo, falls back to
    FMP when available. Falls back to cached profile when live fetch fails.
    Raises ``ProfileNotFound`` for unknown symbols.
    """
    sym = symbol.strip().upper()
    use_db = db.db_enabled()
    fmp_configured = get_settings().fmp_configured

    if use_db:
        try:
            cached = db.fetch_profile(sym)
            if cached and _fresh(cached.get("updated_at")):
                return cached
        except db.DbUnavailable as exc:
            _log.warning("profile cache read failed: %s", exc)
            use_db = False

    try:
        profile = _map(sym, _fetch_yahoo(sym))
    except Exception as exc:
        if not fmp_configured:
            raise
        _log.warning("Yahoo fetch failed (%s), falling back to FMP", exc)
        profile = _map_fmp(sym, _fetch_fmp(sym))

    if use_db:
        try:
            db.upsert_profile(profile)
            stored = db.fetch_profile(sym)
            if stored:
                return stored
        except db.DbUnavailable as exc:
            _log.warning("profile cache write failed: %s", exc)

    return profile
