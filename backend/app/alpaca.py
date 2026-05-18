"""Thin wrappers around the Alpaca SDK clients.

Only paper-trading and market-data reads are used here. No order placement
is exposed in v1 (live quotes & charts only).
"""

from functools import lru_cache

from alpaca.data.enums import DataFeed
from alpaca.data.historical import StockHistoricalDataClient
from alpaca.data.requests import StockBarsRequest, StockLatestQuoteRequest
from alpaca.data.timeframe import TimeFrame, TimeFrameUnit
from alpaca.trading.client import TradingClient

from .config import get_settings

# Map a friendly string to an Alpaca TimeFrame.
_TIMEFRAMES: dict[str, TimeFrame] = {
    "1Min": TimeFrame(1, TimeFrameUnit.Minute),
    "5Min": TimeFrame(5, TimeFrameUnit.Minute),
    "15Min": TimeFrame(15, TimeFrameUnit.Minute),
    "1Hour": TimeFrame(1, TimeFrameUnit.Hour),
    "1Day": TimeFrame(1, TimeFrameUnit.Day),
}


def timeframe_from_str(value: str) -> TimeFrame:
    return _TIMEFRAMES.get(value, _TIMEFRAMES["1Day"])


def _feed() -> DataFeed:
    return DataFeed.SIP if get_settings().alpaca_data_feed.lower() == "sip" else DataFeed.IEX


@lru_cache
def trading_client() -> TradingClient:
    s = get_settings()
    return TradingClient(s.alpaca_api_key, s.alpaca_secret_key, paper=s.alpaca_paper)


@lru_cache
def data_client() -> StockHistoricalDataClient:
    s = get_settings()
    return StockHistoricalDataClient(s.alpaca_api_key, s.alpaca_secret_key)


def get_account() -> dict:
    a = trading_client().get_account()
    return {
        "account_number": a.account_number,
        "status": str(a.status),
        "currency": a.currency,
        "cash": float(a.cash),
        "equity": float(a.equity),
        "buying_power": float(a.buying_power),
        "portfolio_value": float(a.portfolio_value),
        "long_market_value": float(a.long_market_value),
        "pattern_day_trader": a.pattern_day_trader,
    }


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
