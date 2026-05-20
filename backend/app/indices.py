"""Market index snapshots via yfinance (Yahoo Finance).

Fetches indices in parallel via ThreadPoolExecutor so the route returns
in ~400 ms (one network RTT) instead of ~5 s serial.
No Alpaca credentials required — public Yahoo Finance data.
Results are cached in-process for 2 minutes to avoid hammering Yahoo.
"""

from __future__ import annotations

import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Any

import yfinance as yf

# (yf_symbol, display_name, region)
INDEX_CATALOG: list[tuple[str, str, str]] = [
    ("^GSPC",     "S&P 500",       "US"),
    ("^IXIC",     "NASDAQ",        "US"),
    ("^DJI",      "Dow Jones",     "US"),
    ("^RUT",      "Russell 2000",  "US"),
    ("^VIX",      "VIX",           "US"),
    ("^FTSE",     "FTSE 100",      "Europe"),
    ("^GDAXI",    "DAX",           "Europe"),
    ("^FCHI",     "CAC 40",        "Europe"),
    ("^STOXX50E", "Euro Stoxx 50", "Europe"),
    ("^N225",     "Nikkei 225",    "Asia"),
    ("^HSI",      "Hang Seng",     "Asia"),
    ("000001.SS", "Shanghai",      "Asia"),
    ("^AXJO",     "ASX 200",       "Asia"),
]

_CACHE: list[dict] = []
_CACHE_TS: float = 0.0
_CACHE_TTL = 120  # seconds


def _safe_float(v: Any) -> float | None:
    try:
        f = float(v)
        return None if (f != f) else f  # nan → None
    except (TypeError, ValueError):
        return None


def _fetch_one(entry: tuple[str, str, str]) -> dict | None:
    symbol, name, region = entry
    try:
        fi = yf.Ticker(symbol).fast_info
        price = _safe_float(fi.last_price)
        prev = _safe_float(fi.previous_close)
        if price is None or prev is None or prev == 0:
            return None
        change = price - prev
        change_pct = change / prev
        return {
            "name": name,
            "symbol": symbol,
            "region": region,
            "price": round(price, 2),
            "prev_close": round(prev, 2),
            "change": round(change, 2),
            "change_pct": round(change_pct, 6),
        }
    except Exception:
        return None


def get_indices() -> list[dict]:
    global _CACHE, _CACHE_TS
    now = time.time()
    if _CACHE and (now - _CACHE_TS) < _CACHE_TTL:
        return _CACHE

    with ThreadPoolExecutor(max_workers=len(INDEX_CATALOG)) as pool:
        futures = {pool.submit(_fetch_one, e): e for e in INDEX_CATALOG}
        by_symbol: dict[str, dict] = {}
        for fut in as_completed(futures):
            result = fut.result()
            if result:
                by_symbol[result["symbol"]] = result

    ordered = [by_symbol[s] for s, _, _ in INDEX_CATALOG if s in by_symbol]
    _CACHE = ordered
    _CACHE_TS = now
    return ordered
