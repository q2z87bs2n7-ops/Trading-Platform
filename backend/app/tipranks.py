"""Tipranks research API client.

Per-request research data (consensus, smart-score, sentiment, hedge-fund
flow, insider activity) live-proxied with an in-process cache. Not part
of the asset catalogue — never persisted to Postgres. Auth is via
query-string params (despite the ``X-`` prefix on the names), so both
``X-APIKey`` and ``X-APIToken`` go on every request.

Each endpoint has its own TTL chosen against the underlying update
cadence (trending: 15min, smart-score / overview: hourly — analyst
ratings tick irregularly). Each widget keeps its own price source per
the design call — don't unify ``averagePriceTarget`` (trending) with
``priceTarget`` (smartScore / overview).
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

_TRENDING_TTL = 900       # 15min — list moves with new analyst coverage, not intraday
_OVERVIEW_TTL = 3600      # 1h — consensus + PT shifts when analysts update (irregular)
_SMART_SCORE_TTL = 3600   # 1h — composite recomputed daily upstream; 1h keeps it responsive

_trending: list[dict] = []
_trending_ts: float = 0.0
_overview: dict[str, dict] = {}              # symbol -> normalized overview
_overview_ts: dict[str, float] = {}
_smart_score: dict[str, dict] = {}           # symbol -> normalized smart-score
_smart_score_ts: dict[str, float] = {}


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


# ── trending ────────────────────────────────────────────────────────────────

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
        # Enrichment from stocks/overview (per-symbol PT range + analyst count).
        # ``average_price_target`` stays from trending — overview fields are
        # additive context, not a price replacement.
        "low_price_target": None,
        "high_price_target": None,
        "total_analysts": None,
    }


def get_trending_stocks() -> list[dict]:
    """Top trending stocks by analyst coverage (whole-market, equities).
    Enriched with PT range + analyst count from ``stocks/overview`` (batched)."""
    global _trending, _trending_ts
    if not configured():
        return []
    now = time.time()
    if _trending and (now - _trending_ts) < _TRENDING_TTL:
        return _trending
    try:
        raw = _get("/api/stocks/trendingStocks")
        rows = raw if isinstance(raw, list) else []
        normed = [_norm_trending(r) for r in rows if r.get("ticker")]
        # Batch-fetch overview for the trending tickers and merge.
        tickers = [r["ticker"] for r in normed]
        if tickers:
            try:
                ov = _fetch_overview_batch(tickers)
                by_ticker = {o["ticker"]: o for o in ov}
                for row in normed:
                    o = by_ticker.get(row["ticker"])
                    if o:
                        row["low_price_target"] = o.get("low_price_target")
                        row["high_price_target"] = o.get("high_price_target")
                        row["total_analysts"] = o.get("total_analysts")
            except Exception as exc:
                _log.warning("tipranks overview enrichment failed: %s", exc)
        _trending = normed
        _trending_ts = now
    except Exception as exc:
        _log.warning("tipranks trending fetch failed: %s", exc)
    return _trending


# ── overview (analyst consensus + PT range) ─────────────────────────────────

def _norm_overview(r: dict) -> dict:
    return {
        "ticker": (r.get("ticker") or "").upper(),
        "company_name": r.get("companyName"),
        "consensus": r.get("consensus"),
        "price_target": _f(r.get("priceTarget")),
        "low_price_target": _f(r.get("lowPriceTarget")),
        "high_price_target": _f(r.get("highPriceTarget")),
        "price_target_upside": _f(r.get("priceTargetUpside")),
        "buy": r.get("buy"),
        "hold": r.get("hold"),
        "sell": r.get("sell"),
        "total_analysts": r.get("totalAnalysts"),
        "market_name": r.get("marketName"),
    }


def _fetch_overview_batch(symbols: list[str]) -> list[dict]:
    """Comma-batched overview call. Caller is responsible for TTL semantics;
    used by ``get_trending_stocks`` to enrich its result in one round-trip."""
    if not symbols:
        return []
    csv = ",".join(s.upper() for s in symbols)
    raw = _get(f"/api/stocks/overview/{csv}")
    return [_norm_overview(r) for r in (raw if isinstance(raw, list) else [])]


# ── smart score ─────────────────────────────────────────────────────────────

def _norm_smart_score(r: dict) -> dict:
    """Tipranks composite signal (1–10) + the six input components plus a
    Tipranks-sourced price target. ``fundamentals_*`` fields are part of the
    composite breakdown and surfaced for AI tool calls; the SmartScore widget
    hides them in the UI since the Fundamentals widget owns those metrics."""
    return {
        "ticker": (r.get("ticker") or "").upper(),
        "smart_score": r.get("smartScore"),
        "price_target": _f(r.get("priceTarget")),
        "hedge_fund_trend_value": _f(r.get("hedgeFundTrendValue")),
        "blogger_bullish_sentiment": _f(r.get("bloggerBullishSentiment")),
        "blogger_sector_avg": _f(r.get("bloggerSectorAvg")),
        "insiders_last_3_months_sum": _f(r.get("insidersLast3MonthsSum")),
        "news_sentiments_bullish_percent": _f(r.get("newsSentimentsBullishPercent")),
        "news_sentiments_bearish_percent": _f(r.get("newsSentimentsBearishPercent")),
        "investor_holding_change_last_7_days": _f(r.get("investorHoldingChangeLast7Days")),
        "investor_holding_change_last_30_days": _f(r.get("investorHoldingChangeLast30Days")),
        # Hidden in the widget UI (duplicates Fundamentals) but kept in the
        # payload so AI bots can answer "is X's ROE strong" via get_smart_score.
        "fundamentals_return_on_equity": _f(r.get("fundamentalsReturnOnEquity")),
        "fundamentals_asset_growth": _f(r.get("fundamentalsAssetGrowth")),
    }


def get_smart_score(symbol: str) -> dict | None:
    """SmartScore for one symbol; None when unconfigured or upstream fails."""
    if not configured():
        return None
    sym = symbol.upper()
    now = time.time()
    cached = _smart_score.get(sym)
    if cached is not None and (now - _smart_score_ts.get(sym, 0.0)) < _SMART_SCORE_TTL:
        return cached
    try:
        raw = _get(f"/api/smartScore/{sym}")
        arr = raw if isinstance(raw, list) else []
        if not arr:
            return cached  # may be None
        row = _norm_smart_score(arr[0])
        _smart_score[sym] = row
        _smart_score_ts[sym] = now
        return row
    except Exception as exc:
        _log.warning("tipranks smart-score fetch failed for %s: %s", sym, exc)
        return cached
