"""Market-data reads: historical bars and latest quotes."""

from datetime import datetime, timedelta, timezone

from alpaca.common.enums import Sort
from alpaca.data.requests import StockBarsRequest, StockLatestQuoteRequest

from .client import _feed, data_client, timeframe_from_str


def get_bars(symbol: str, timeframe: str, limit: int) -> list[dict]:
    # Alpaca defaults `start` to the beginning of the current day, so without an
    # explicit window every timeframe only returns today's data (one candle on
    # 1Day). Open a wide window and pull the most recent `limit` bars via
    # Sort.DESC (efficient: Alpaca pages back from `end`, capped at `limit`).
    req = StockBarsRequest(
        symbol_or_symbols=symbol.upper(),
        timeframe=timeframe_from_str(timeframe),
        start=datetime.now(timezone.utc) - timedelta(days=2000),
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


def normalize_quote(symbol: str, q) -> dict:
    """Shared quote shape for both the poll path (here) and the SSE
    stream (``stream.py``). Single-sourced so the load-bearing
    stream/poll fallback can never drift on the mid formula."""
    bid = float(q.bid_price or 0)
    ask = float(q.ask_price or 0)
    mid = round((bid + ask) / 2, 4) if bid and ask else (ask or bid)
    return {
        "symbol": symbol,
        "bid": bid,
        "ask": ask,
        "mid": mid,
        "time": int(q.timestamp.timestamp()),
    }


def get_latest_quotes(symbols: list[str]) -> list[dict]:
    if not symbols:
        return []
    req = StockLatestQuoteRequest(symbol_or_symbols=symbols, feed=_feed())
    quotes = data_client().get_stock_latest_quote(req)
    return [normalize_quote(sym, q) for sym, q in quotes.items()]
