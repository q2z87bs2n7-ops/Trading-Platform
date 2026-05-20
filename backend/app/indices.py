"""Market index snapshots via Yahoo Finance chart API (direct HTTP).

Uses `requests` (already a transitive dep via alpaca-py) — no C-extension
dependencies, works on Python 3.14 / Vercel serverless.
Results cached in-process for 2 minutes to avoid hammering Yahoo.
"""

from __future__ import annotations

import time
from concurrent.futures import ThreadPoolExecutor, as_completed

import requests

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

_HEADERS = {
    "User-Agent": "Mozilla/5.0 (compatible; market-data-widget/1.0)",
    "Accept": "application/json",
}
_CACHE: list[dict] = []
_CACHE_TS: float = 0.0
_CACHE_TTL = 120  # seconds


def _fetch_one(entry: tuple[str, str, str]) -> dict | None:
    symbol, name, region = entry
    try:
        url = f"https://query2.finance.yahoo.com/v8/finance/chart/{symbol}"
        r = requests.get(
            url,
            params={"interval": "1d", "range": "5d", "includePrePost": "true"},
            headers=_HEADERS,
            timeout=10,
        )
        r.raise_for_status()
        meta = r.json()["chart"]["result"][0]["meta"]
        price = float(meta["regularMarketPrice"])
        prev = float(
            meta.get("previousClose")
            or meta.get("chartPreviousClose")
            or 0
        )
        if not prev:
            return None
        change = price - prev
        change_pct = change / prev

        market_state = meta.get("marketState", "REGULAR")
        ext_price: float | None = None
        ext_change_pct: float | None = None
        session = "regular"
        if market_state in ("PRE", "PREPRE") and meta.get("preMarketPrice"):
            session = "pre"
            ext_price = round(float(meta["preMarketPrice"]), 2)
            ext_change_pct = round(float(meta.get("preMarketChangePercent", 0)), 6)
        elif market_state in ("POST", "POSTPOST") and meta.get("postMarketPrice"):
            session = "post"
            ext_price = round(float(meta["postMarketPrice"]), 2)
            ext_change_pct = round(float(meta.get("postMarketChangePercent", 0)), 6)

        return {
            "name": name,
            "symbol": symbol,
            "region": region,
            "price": round(price, 2),
            "prev_close": round(prev, 2),
            "change": round(change, 2),
            "change_pct": round(change_pct, 6),
            "session": session,
            "ext_price": ext_price,
            "ext_change_pct": ext_change_pct,
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
