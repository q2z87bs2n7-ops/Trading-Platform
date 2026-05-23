"""Company-info enrichment: Financial Modeling Prep -> company_profiles.

Plain ``requests`` (no SDK / C extensions, Python 3.14 safe). Write-through to
Postgres when ``DATABASE_URL`` is set; otherwise served live (uncached) so the
endpoint still works without a DB. Requires ``FMP_API_KEY`` — raises
``ProfileUnavailable`` when it is unset. Equities only for now.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone

import requests

from . import db
from .config import get_settings

_log = logging.getLogger(__name__)

_HEADERS = {
    "User-Agent": "Mozilla/5.0 (compatible; trading-platform/1.0)",
    "Accept": "application/json",
}
_TTL = 7 * 24 * 3600  # refresh weekly; fundamentals move slowly


class ProfileNotFound(LookupError):
    """No company data for the symbol."""


class ProfileUnavailable(RuntimeError):
    """No profile provider configured (``FMP_API_KEY`` unset)."""


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
        "fundamentals": {},  # FMP profile endpoint carries no fundamentals block
    }


def _fresh(updated_at) -> bool:
    if not isinstance(updated_at, datetime):
        return False
    if updated_at.tzinfo is None:
        updated_at = updated_at.replace(tzinfo=timezone.utc)
    return (datetime.now(timezone.utc) - updated_at).total_seconds() < _TTL


def get_company_profile(symbol: str) -> dict:
    """DB-cached company profile (write-through) from Financial Modeling Prep.
    Raises ``ProfileNotFound`` for unknown symbols and ``ProfileUnavailable``
    when ``FMP_API_KEY`` is unset.
    """
    if not get_settings().fmp_configured:
        raise ProfileUnavailable("FMP_API_KEY not configured")

    sym = symbol.strip().upper()
    use_db = db.db_enabled()

    if use_db:
        try:
            cached = db.fetch_profile(sym)
            if cached and _fresh(cached.get("updated_at")):
                return cached
        except db.DbUnavailable as exc:
            _log.warning("profile cache read failed: %s", exc)
            use_db = False

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
