"""Yahoo Finance top-stories RSS → market news feed.

Uses stdlib xml.etree + requests (transitive via alpaca-py).
Results cached in-process for 5 minutes.
"""

from __future__ import annotations

import time
import xml.etree.ElementTree as ET
from email.utils import parsedate_to_datetime

import requests

_HEADERS = {
    "User-Agent": "Mozilla/5.0 (compatible; market-news-widget/1.0)",
    "Accept": "application/rss+xml, application/xml, text/xml",
}
_RSS_URL = "https://finance.yahoo.com/rss/topstories"
_CACHE: list[dict] = []
_CACHE_TS: float = 0.0
_CACHE_TTL = 300  # 5 minutes


def _to_ts(pub_date: str) -> int:
    try:
        return int(parsedate_to_datetime(pub_date).timestamp())
    except Exception:
        return int(time.time())


def get_market_news(limit: int = 20) -> list[dict]:
    global _CACHE, _CACHE_TS
    now = time.time()
    if _CACHE and (now - _CACHE_TS) < _CACHE_TTL:
        return _CACHE[:limit]

    try:
        r = requests.get(_RSS_URL, headers=_HEADERS, timeout=10)
        r.raise_for_status()
        root = ET.fromstring(r.content)
        result = []
        for item in root.findall(".//item"):
            source_el = item.find("source")
            result.append({
                "title":    (item.findtext("title") or "").strip(),
                "link":     (item.findtext("link") or "").strip(),
                "summary":  (item.findtext("description") or "").strip(),
                "source":   (source_el.text if source_el is not None else "Yahoo Finance").strip(),
                "pub_time": _to_ts(item.findtext("pubDate") or ""),
            })
        _CACHE = result
        _CACHE_TS = now
    except Exception:
        pass  # serve stale cache on error rather than crashing

    return _CACHE[:limit]
