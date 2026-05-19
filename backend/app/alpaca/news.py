"""Historical news reads (Benzinga via Alpaca), filtered by ticker.

Read-only and stateless: the historical REST endpoint is queried on
demand per symbol -- no upstream WebSocket, no persistence. News volume
is low enough that the frontend just polls this like the other tiles.
"""

from functools import lru_cache

from alpaca.common.enums import Sort
from alpaca.data.historical.news import NewsClient
from alpaca.data.requests import NewsRequest

from ..config import get_settings


@lru_cache
def _news_client() -> NewsClient:
    s = get_settings()
    return NewsClient(s.alpaca_api_key, s.alpaca_secret_key)


def get_news(symbol: str, limit: int) -> list[dict]:
    # No explicit window: Sort.DESC + limit yields the most recent N
    # regardless of date, so thinly-covered tickers still return results.
    req = NewsRequest(
        symbols=symbol.upper(),
        limit=limit,
        sort=Sort.DESC,
        exclude_contentless=True,
    )
    news = _news_client().get_news(req)
    out: list[dict] = []
    for n in news.data.get("news", []):
        out.append(
            {
                "id": n.id,
                "headline": n.headline,
                "summary": n.summary,
                "author": n.author,
                "source": n.source,
                "url": n.url,
                "symbols": n.symbols,
                "time": int(n.created_at.timestamp()),
            }
        )
    return out
