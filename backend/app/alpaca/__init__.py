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
from .news import get_news
from .screener import get_most_actives, get_movers
from .watchlist import (
    add_to_watchlist,
    get_watchlist,
    remove_from_watchlist,
)
from .trading import (
    cancel_all_orders,
    cancel_order,
    close_all_positions,
    close_position,
    get_asset,
    get_orders,
    replace_order,
    search_assets,
    submit_order,
)

__all__ = [
    "add_to_watchlist",
    "cancel_all_orders",
    "cancel_order",
    "close_all_positions",
    "close_position",
    "data_client",
    "get_account",
    "get_activities",
    "get_asset",
    "get_bars",
    "get_calendar",
    "get_clock",
    "get_latest_quotes",
    "get_most_actives",
    "get_movers",
    "get_news",
    "get_orders",
    "get_portfolio_history",
    "get_position",
    "get_positions",
    "get_watchlist",
    "remove_from_watchlist",
    "replace_order",
    "search_assets",
    "submit_order",
    "timeframe_from_str",
    "trading_client",
]
