"""Market screener reads: top gainers/losers and most-active symbols.

Wraps Alpaca's ``ScreenerClient``. Snapshots are server-computed by
Alpaca (no per-symbol calls fanned out from us), so these are cheap and
work fine on the serverless path -- no relay needed like ``/api/stream``.
"""

from functools import lru_cache

from alpaca.data.enums import MarketType, MostActivesBy
from alpaca.data.historical.screener import ScreenerClient
from alpaca.data.requests import MarketMoversRequest, MostActivesRequest

from ..config import get_settings


@lru_cache
def _screener_client() -> ScreenerClient:
    s = get_settings()
    return ScreenerClient(s.alpaca_api_key, s.alpaca_secret_key)


def get_movers(top: int) -> dict:
    req = MarketMoversRequest(top=top, market_type=MarketType.STOCKS)
    res = _screener_client().get_market_movers(req)
    return {
        "gainers": [
            {
                "symbol": m.symbol,
                "price": m.price,
                "change": m.change,
                "percent_change": m.percent_change,
            }
            for m in res.gainers
        ],
        "losers": [
            {
                "symbol": m.symbol,
                "price": m.price,
                "change": m.change,
                "percent_change": m.percent_change,
            }
            for m in res.losers
        ],
        "last_updated": int(res.last_updated.timestamp()),
    }


def get_most_actives(top: int, by: str) -> dict:
    rank = MostActivesBy.TRADES if by.lower() == "trades" else MostActivesBy.VOLUME
    req = MostActivesRequest(top=top, by=rank)
    res = _screener_client().get_most_actives(req)
    return {
        "most_actives": [
            {
                "symbol": a.symbol,
                "volume": a.volume,
                "trade_count": a.trade_count,
            }
            for a in res.most_actives
        ],
        "by": rank.value,
        "last_updated": int(res.last_updated.timestamp()),
    }
