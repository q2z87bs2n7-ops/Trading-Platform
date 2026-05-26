"""Tipranks research API client.

Per-request research data (consensus, hedge-fund flow, insider activity,
sentiment) live-proxied with an in-process cache. Not part of the asset
catalogue — never persisted to Postgres. Auth is via query-string params
(despite the ``X-`` prefix on the names), so both ``X-APIKey`` and
``X-APIToken`` go on every request.

POC scope: ``trending_stocks`` only. Other endpoints are mapped in
``docs/tipranks.md`` and follow the same shape when they're wired.
"""
from __future__ import annotations

import logging
import time

import requests

from .config import get_settings

_log = logging.getLogger(__name__)

_BASE = "https://api.tipranks.com"
_HEADERS = {
    "User-Agent": "Mozilla/5.0 (compatible; trading-platform/1.0)",
    "Accept": "application/json",
}
_TRENDING_TTL = 900  # 15min — list moves with new analyst coverage, not intraday

_trending: list[dict] = []
_trending_ts: float = 0.0


def configured() -> bool:
    s = get_settings()
    return bool(s.tipranks_api_key and s.tipranks_api_token)


def _auth_params() -> dict:
    s = get_settings()
    return {"X-APIKey": s.tipranks_api_key, "X-APIToken": s.tipranks_api_token}


def _get(path: str, params: dict | None = None) -> list | dict:
    """One GET against the Tipranks API."""
    r = requests.get(
        f"{_BASE}{path}",
        params={**(params or {}), **_auth_params()},
        headers=_HEADERS,
        timeout=15,
    )
    r.raise_for_status()
    return r.json()


def _f(v) -> float | None:
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def _norm_trending(r: dict) -> dict:
    return {
        "ticker": (r.get("ticker") or "").upper(),
        "company_name": r.get("companyName"),
        "sector": r.get("sector"),
        "popularity": r.get("popularity"),
        "sentiment": r.get("sentiment"),
        "buy": r.get("buy"),
        "hold": r.get("hold"),
        "sell": r.get("sell"),
        "consensus": r.get("consensus"),
        "average_price_target": _f(r.get("averagePriceTarget")),
        "market_cap": r.get("marketCap"),
        "market_name": r.get("marketName"),
        "last_rating_date": r.get("lastRatingDate"),
    }


def get_trending_stocks() -> list[dict]:
    """Top trending stocks by analyst coverage (whole-market, equities)."""
    global _trending, _trending_ts
    if not configured():
        return []
    now = time.time()
    if _trending and (now - _trending_ts) < _TRENDING_TTL:
        return _trending
    try:
        raw = _get("/api/stocks/trendingStocks")
        rows = raw if isinstance(raw, list) else []
        _trending = [_norm_trending(r) for r in rows if r.get("ticker")]
        _trending_ts = now
    except Exception as exc:
        _log.warning("tipranks trending fetch failed: %s", exc)
    return _trending
