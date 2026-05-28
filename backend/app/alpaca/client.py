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


# Forex pairs use the same BASE/QUOTE form as crypto (EUR/USD vs BTC/USD), so
# the slash alone is ambiguous. Forex pairs are <fiat>/<fiat> where fiat is an
# ISO 4217 code; crypto pairs have a non-ISO base or quote (BTC, ETH, USDC).
# Adding a fiat doesn't break the classifier — a new pair just routes through
# the crypto branch until the code is added here.
_FIAT_CURRENCIES = frozenset({
    "USD", "EUR", "GBP", "JPY", "CHF", "AUD", "CAD", "NZD",
    "SEK", "NOK", "DKK", "MXN", "ZAR", "HKD", "SGD", "TRY",
    "CNH", "PLN", "HUF", "CZK", "ILS",
})


def is_forex(symbol: str) -> bool:
    if not symbol or "/" not in symbol:
        return False
    base, _, quote = symbol.partition("/")
    return base in _FIAT_CURRENCIES and quote in _FIAT_CURRENCIES


def is_crypto(symbol: str) -> bool:
    return "/" in symbol and not is_forex(symbol)


# Quote currencies Alpaca appends without a slash on crypto symbols (its
# positions and activities endpoints strip the slash: BTCUSD, not BTC/USD).
# Longest first so ``USDT`` wins over ``USD``.
_CRYPTO_QUOTES = ("USDT", "USDC", "USD")


def coerce_silo(asset_class: str | None) -> str:
    """Canonical two-state silo selector for the per-silo API params
    (watchlist, pnl-history). Anything that isn't exactly ``"crypto"`` —
    including ``""``/``None``/unknown — resolves to ``"stocks"``, matching the
    long-standing ``== "crypto"`` checks in watchlist/pnl."""
    return "crypto" if (asset_class or "") == "crypto" else "stocks"


def normalize_crypto_symbol(symbol: str, asset_class: str | None = None) -> str:
    """Re-insert the slash Alpaca strips from crypto pairs (BTCUSD -> BTC/USD)
    so a symbol matches the slash form orders and watchlists use. Already-
    slashed symbols pass through unchanged. When ``asset_class`` is supplied and
    is not crypto the symbol is left as-is — guards the rare equity ticker that
    happens to end in a quote-currency suffix."""
    if "/" in symbol:
        return symbol
    if asset_class is not None and "crypto" not in asset_class.lower():
        return symbol
    for q in _CRYPTO_QUOTES:
        if symbol.endswith(q) and len(symbol) > len(q) and symbol[: -len(q)].isalpha():
            return f"{symbol[: -len(q)]}/{q}"
    return symbol
