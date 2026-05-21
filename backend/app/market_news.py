"""Yahoo Finance top-stories RSS → market news feed.

Uses stdlib xml.etree + requests (transitive via alpaca-py).
Results cached in-process for 5 minutes.
"""

from __future__ import annotations

import logging
import time
import xml.etree.ElementTree as ET
from datetime import datetime
from email.utils import parsedate_to_datetime

import requests

_log = logging.getLogger(__name__)

_HEADERS = {
    "User-Agent": "Mozilla/5.0 (compatible; market-news-widget/1.0)",
    "Accept": "application/rss+xml, application/xml, text/xml",
}
_RSS_URL = "https://finance.yahoo.com/rss/topstories"
_CACHE: list[dict] = []
_CACHE_TS: float = 0.0
_CACHE_TTL = 300  # 5 minutes


def _to_ts(pub_date: str) -> int:
    if not pub_date:
        return int(time.time())
    # RFC 2822 (standard RSS pubDate: "Mon, 19 May 2025 18:30:00 +0000")
    try:
        return int(parsedate_to_datetime(pub_date).timestamp())
    except Exception:
        pass
    # ISO 8601 (Yahoo sometimes uses "2025-05-19T18:30:00Z")
    try:
        return int(datetime.fromisoformat(pub_date.replace("Z", "+00:00")).timestamp())
    except Exception:
        pass
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
        _CACHE = sorted(result, key=lambda x: x["pub_time"], reverse=True)
        _CACHE_TS = now
    except Exception as exc:
        # Serve stale cache on error rather than crashing. Log so a cold
        # cache + persistent upstream failure (empty response with no
        # explanation) doesn't disappear silently.
        _log.warning("market news fetch failed: %s", exc)

    return _CACHE[:limit]
