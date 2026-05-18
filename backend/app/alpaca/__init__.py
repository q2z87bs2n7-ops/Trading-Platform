"""Alpaca SDK wrappers (paper-trading only).

Split into focused modules; this package re-exports every public name so
callers keep using ``from . import alpaca`` / ``alpaca.get_*`` unchanged.
"""

from .account import (
    get_account,
    get_activities,
    get_calendar,
    get_clock,
    get_portfolio_history,
    get_position,
    get_positions,
)
from .client import (
    data_client,
    timeframe_from_str,
    trading_client,
)
from .market_data import get_bars, get_latest_quotes
from .trading import get_asset, get_orders

__all__ = [
    "data_client",
    "get_account",
    "get_activities",
    "get_asset",
    "get_bars",
    "get_calendar",
    "get_clock",
    "get_latest_quotes",
    "get_orders",
    "get_portfolio_history",
    "get_position",
    "get_positions",
    "timeframe_from_str",
    "trading_client",
]
