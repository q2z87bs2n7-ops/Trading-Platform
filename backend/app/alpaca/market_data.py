"""Market-data reads: historical bars and latest quotes."""

from alpaca.common.enums import Sort
from alpaca.data.requests import StockBarsRequest, StockLatestQuoteRequest

from .client import _feed, data_client, timeframe_from_str


def get_bars(symbol: str, timeframe: str, limit: int) -> list[dict]:
    # Sort.DESC so Alpaca returns the most recent `limit` bars. Without it the
    # default ASC sort + no `start` makes Alpaca read forward from the start of
    # the current day, yielding only today's data (one candle on 1Day).
    req = StockBarsRequest(
        symbol_or_symbols=symbol.upper(),
        timeframe=timeframe_from_str(timeframe),
        limit=limit,
        feed=_feed(),
        sort=Sort.DESC,
    )
    bars = data_client().get_stock_bars(req)
    out: list[dict] = []
    for bar in bars.data.get(symbol.upper(), []):
        out.append(
            {
                "time": int(bar.timestamp.timestamp()),
                "open": bar.open,
                "high": bar.high,
                "low": bar.low,
                "close": bar.close,
                "volume": bar.volume,
            }
        )
    out.reverse()
    return out


def get_latest_quotes(symbols: list[str]) -> list[dict]:
    if not symbols:
        return []
    req = StockLatestQuoteRequest(symbol_or_symbols=symbols, feed=_feed())
    quotes = data_client().get_stock_latest_quote(req)
    out: list[dict] = []
    for sym, q in quotes.items():
        bid = float(q.bid_price or 0)
        ask = float(q.ask_price or 0)
        mid = round((bid + ask) / 2, 4) if bid and ask else (ask or bid)
        out.append(
            {
                "symbol": sym,
                "bid": bid,
                "ask": ask,
                "mid": mid,
                "time": int(q.timestamp.timestamp()),
            }
        )
    return out
