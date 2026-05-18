"""Market-data reads: historical bars and latest quotes."""

from alpaca.data.requests import StockBarsRequest, StockLatestQuoteRequest

from .client import _feed, data_client, timeframe_from_str


def get_bars(symbol: str, timeframe: str, limit: int) -> list[dict]:
    req = StockBarsRequest(
        symbol_or_symbols=symbol.upper(),
        timeframe=timeframe_from_str(timeframe),
        limit=limit,
        feed=_feed(),
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
