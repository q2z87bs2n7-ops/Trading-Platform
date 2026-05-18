"""Server-side watchlist persistence via Alpaca's Watchlists API.

A single named watchlist ("primary") is the source of truth; it is
auto-created and seeded from the configured default symbols the first
time it is accessed. No extra infra (Charter: Alpaca is the source of
truth; server-side watchlist persistence without a new datastore).
"""

from alpaca.trading.requests import CreateWatchlistRequest

from ..config import get_settings
from .client import trading_client

_NAME = "primary"


def _symbols(wl) -> list[str]:
    return [a.symbol for a in (wl.assets or [])]


def _get_or_create():
    tc = trading_client()
    for wl in tc.get_watchlists():
        if wl.name == _NAME:
            # ``get_watchlists`` returns summaries; the by-id record carries
            # the populated ``assets`` list.
            return tc.get_watchlist_by_id(str(wl.id))
    return tc.create_watchlist(
        CreateWatchlistRequest(name=_NAME, symbols=get_settings().symbols)
    )


def get_watchlist() -> dict:
    return {"symbols": _symbols(_get_or_create())}


def add_to_watchlist(symbol: str) -> dict:
    sym = symbol.strip().upper()
    wl = _get_or_create()
    if sym and sym not in _symbols(wl):
        wl = trading_client().add_asset_to_watchlist_by_id(
            watchlist_id=str(wl.id), symbol=sym
        )
    return {"symbols": _symbols(wl)}


def remove_from_watchlist(symbol: str) -> dict:
    sym = symbol.strip().upper()
    wl = _get_or_create()
    if sym in _symbols(wl):
        wl = trading_client().remove_asset_from_watchlist_by_id(
            watchlist_id=str(wl.id), symbol=sym
        )
    return {"symbols": _symbols(wl)}
