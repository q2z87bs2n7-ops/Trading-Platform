"""Shared Alpaca SDK clients and timeframe helpers.

One cached ``TradingClient`` / ``StockHistoricalDataClient`` per process
(Charter: single user, keys server-side, ``paper=True`` always).
"""

from functools import lru_cache

from alpaca.data.enums import DataFeed
from alpaca.data.historical import CryptoHistoricalDataClient, StockHistoricalDataClient
from alpaca.data.timeframe import TimeFrame, TimeFrameUnit
from alpaca.trading.client import TradingClient

from ..config import get_settings

# Map a friendly string to an Alpaca TimeFrame.
_TIMEFRAMES: dict[str, TimeFrame] = {
    "1Min": TimeFrame(1, TimeFrameUnit.Minute),
    "5Min": TimeFrame(5, TimeFrameUnit.Minute),
    "15Min": TimeFrame(15, TimeFrameUnit.Minute),
    "30Min": TimeFrame(30, TimeFrameUnit.Minute),
    "1Hour": TimeFrame(1, TimeFrameUnit.Hour),
    "4Hour": TimeFrame(4, TimeFrameUnit.Hour),
    "1Day": TimeFrame(1, TimeFrameUnit.Day),
    "1Week": TimeFrame(1, TimeFrameUnit.Week),
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


@lru_cache
def crypto_data_client() -> CryptoHistoricalDataClient:
    # Crypto historical data is free; no feed param required.
    return CryptoHistoricalDataClient()


def is_crypto(symbol: str) -> bool:
    return "/" in symbol
