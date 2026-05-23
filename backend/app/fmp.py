"""Financial Modeling Prep — stock profile enrichment (stable endpoint).

Single-symbol only: ``profile-bulk`` and the constituent lists 402 below the
higher tiers. On the paid **Starter** plan the ceiling is 300/min (no 250/day
free cap), so a full-universe re-enrich is ~1.5–2.5 h, gated by per-symbol
latency rather than the rate limit. ``dcf``/``dcf_diff`` are not in the stable
profile response (separate endpoint) and stay null for now.
"""
from __future__ import annotations

import requests

from .config import get_settings

_BASE = "https://financialmodelingprep.com/stable"
_HEADERS = {
    "User-Agent": "Mozilla/5.0 (compatible; trading-platform/1.0)",
    "Accept": "application/json",
}
CALL_DELAY = 0.3  # courtesy spacing; Starter allows 300/min, so this isn't the ceiling


def configured() -> bool:
    return get_settings().fmp_configured


def fetch_profile(symbol: str) -> dict | None:
    """One company profile, or None if FMP has no record for the symbol.

    FMP uses a dash for class-share / exchange suffixes (``BRK.B`` -> ``BRK-B``)
    where Alpaca uses a dot, so the dotted form returns ``[]``. Translate for
    the query only; the caller still stores the row under the Alpaca symbol.
    """
    r = requests.get(
        f"{_BASE}/profile",
        params={"symbol": symbol.replace(".", "-"), "apikey": get_settings().fmp_api_key},
        headers=_HEADERS,
        timeout=15,
    )
    r.raise_for_status()
    arr = r.json() or []
    return arr[0] if arr else None


def _int(v):
    try:
        return int(v)
    except (TypeError, ValueError):
        return None


def map_stock_enrichment(symbol: str, d: dict) -> dict:
    return {
        "symbol":              symbol,
        "description":         d.get("description") or None,
        "website":             d.get("website") or None,
        "logo_url":            d.get("image") or None,
        "market_cap":          _int(d.get("marketCap")),
        "sector":              d.get("sector") or None,
        "industry":            d.get("industry") or None,
        "country":             d.get("country") or None,
        "city":                d.get("city") or None,
        "state":               d.get("state") or None,
        "ipo_date":            d.get("ipoDate") or None,
        "isin":                d.get("isin") or None,
        "cik":                 d.get("cik") or None,
        "is_etf":              d.get("isEtf"),
        "is_adr":              d.get("isAdr"),
        "is_fund":             d.get("isFund"),
        "is_actively_trading": d.get("isActivelyTrading"),
        "ceo":                 d.get("ceo") or None,
        "employees":           _int(d.get("fullTimeEmployees")),
        "phone":               d.get("phone") or None,
        "beta":                d.get("beta"),
        "enrichment_source":   "fmp",
    }
