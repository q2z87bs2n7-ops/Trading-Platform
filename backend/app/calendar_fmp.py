"""Earnings & economic calendars over Financial Modeling Prep.

Live-proxied with an in-process cache (the ``indices.py`` / ``market_news.py``
pattern) — calendar data is small, time-windowed and rolls forward daily, so it
is never persisted to the DB. The DB is read only as a *market-cap lookup* to
curate the noisy whole-market earnings feed; that lookup degrades gracefully
(empty map) when Postgres is unreachable.
"""
from __future__ import annotations

import logging
import time
from datetime import date, timedelta

from . import db, fmp

_log = logging.getLogger(__name__)

_EARNINGS_WINDOW_DAYS = 14
_ECONOMIC_WINDOW_DAYS = 7
_FEED_TTL = 3600  # 1h — calendars move slowly intraday
_CAP_TTL = 21_600  # 6h — catalogue caps are near-static

# raw FMP feeds, cached by their default window
_earnings: list[dict] = []
_earnings_ts: float = 0.0
_economic: list[dict] = []
_economic_ts: float = 0.0
# market-cap map, cached separately (slower-moving, separate source)
_caps: dict[str, int] = {}
_caps_ts: float = 0.0


def _f(v) -> float | None:
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def _norm_earnings(r: dict) -> dict:
    return {
        "symbol": (r.get("symbol") or "").upper(),
        "date": r.get("date"),
        "eps_estimate": _f(r.get("epsEstimated")),
        "eps_actual": _f(r.get("epsActual")),
        "revenue_estimate": _f(r.get("revenueEstimated")),
        "revenue_actual": _f(r.get("revenueActual")),
    }


def _norm_economic(r: dict) -> dict:
    return {
        "date": r.get("date"),
        "country": r.get("country"),
        "event": r.get("event"),
        "currency": r.get("currency"),
        "impact": r.get("impact"),
        "previous": _f(r.get("previous")),
        "estimate": _f(r.get("estimate")),
        "actual": _f(r.get("actual")),
        "unit": r.get("unit"),
    }


def _cap_map() -> dict[str, int]:
    global _caps, _caps_ts
    now = time.time()
    if _caps and (now - _caps_ts) < _CAP_TTL:
        return _caps
    if not db.db_enabled():
        return _caps
    try:
        _caps = db.market_cap_map()
        _caps_ts = now
    except db.DbUnavailable as exc:
        _log.warning("cap map unavailable, earnings will fall back: %s", exc)
    return _caps


def get_earnings_calendar(include: set[str]) -> list[dict]:
    """Curated whole-market earnings: visible US-equity universe ranked by market
    cap, always unioned with the user's ``include`` symbols (positions / orders /
    watchlist). Falls back to ``include``-only when the cap map is unavailable.
    """
    global _earnings, _earnings_ts
    if not fmp.configured():
        return []
    now = time.time()
    if not _earnings or (now - _earnings_ts) >= _FEED_TTL:
        today = date.today()
        try:
            _earnings = fmp.fetch_earnings_calendar(
                today.isoformat(),
                (today + timedelta(days=_EARNINGS_WINDOW_DAYS)).isoformat(),
            )
            _earnings_ts = now
        except Exception as exc:
            _log.warning("earnings calendar fetch failed: %s", exc)

    caps = _cap_map()
    include = {s.upper() for s in include}
    rows: list[dict] = []
    for raw in _earnings:
        sym = (raw.get("symbol") or "").upper()
        if not sym or (sym not in caps and sym not in include):
            continue
        row = _norm_earnings(raw)
        row["market_cap"] = caps.get(sym)
        rows.append(row)
    # Biggest names first — the date column already shows the schedule per row,
    # so users see the highest-cap reports up top regardless of when they fall
    # within the window.
    rows.sort(key=lambda r: -(r["market_cap"] or 0))
    return rows[:60]


def get_symbol_earnings(symbol: str) -> list[dict]:
    """Recent + upcoming earnings for one ticker (newest first)."""
    if not fmp.configured():
        return []
    try:
        return [_norm_earnings(r) for r in fmp.fetch_symbol_earnings(symbol, 8)]
    except Exception as exc:
        _log.warning("symbol earnings fetch failed for %s: %s", symbol, exc)
        return []


def get_economic_calendar() -> list[dict]:
    """US high/medium-impact macro releases for the next week."""
    global _economic, _economic_ts
    if not fmp.configured():
        return []
    now = time.time()
    if not _economic or (now - _economic_ts) >= _FEED_TTL:
        today = date.today()
        try:
            _economic = fmp.fetch_economic_calendar(
                today.isoformat(),
                (today + timedelta(days=_ECONOMIC_WINDOW_DAYS)).isoformat(),
            )
            _economic_ts = now
        except Exception as exc:
            _log.warning("economic calendar fetch failed: %s", exc)

    rows = [
        _norm_economic(r)
        for r in _economic
        if r.get("country") == "US" and r.get("impact") in ("High", "Medium")
    ]
    rows.sort(key=lambda r: r["date"] or "")
    return rows
