"""Server-side watchlist persistence via Alpaca's Watchlists API.

A single named watchlist ("primary") is the source of truth for stocks;
a second ("primary-crypto") serves the crypto mode. Both are auto-created
and seeded on first access. No extra infra (Charter: Alpaca is the source
of truth; server-side watchlist persistence without a new datastore).
"""

from alpaca.trading.requests import CreateWatchlistRequest

from ..config import get_settings
from .client import normalize_crypto_symbol, trading_client

_NAME = "primary"
_NAME_CRYPTO = "primary-crypto"
_CRYPTO_DEFAULTS = ["BTC/USD", "ETH/USD", "SOL/USD"]


def _symbols(wl, asset_class: str = "") -> list[str]:
    """Return watchlist symbols, normalizing crypto pairs to use slashes."""
    symbols = [a.symbol for a in (wl.assets or [])]
    if asset_class == "crypto":
        symbols = [normalize_crypto_symbol(s, asset_class="crypto") for s in symbols]
    return symbols


def _get_or_create(name: str, defaults: list[str] | None = None):
    tc = trading_client()
    for wl in tc.get_watchlists():
        if wl.name == name:
            return tc.get_watchlist_by_id(str(wl.id))
    seed = defaults if defaults is not None else get_settings().symbols
    return tc.create_watchlist(CreateWatchlistRequest(name=name, symbols=seed))


def _wl_name(asset_class: str) -> str:
    return _NAME_CRYPTO if asset_class == "crypto" else _NAME


def _wl_defaults(asset_class: str) -> list[str] | None:
    return _CRYPTO_DEFAULTS if asset_class == "crypto" else None


def get_watchlist(asset_class: str = "") -> dict:
    return {"symbols": _symbols(_get_or_create(_wl_name(asset_class), _wl_defaults(asset_class)), asset_class)}


def add_to_watchlist(symbol: str, asset_class: str = "") -> dict:
    sym = symbol.strip().upper()
    wl = _get_or_create(_wl_name(asset_class), _wl_defaults(asset_class))
    # Check in normalized form
    wl_symbols = _symbols(wl, asset_class)
    normalized_sym = normalize_crypto_symbol(sym, asset_class) if asset_class == "crypto" else sym
    if normalized_sym and normalized_sym not in wl_symbols:
        wl = trading_client().add_asset_to_watchlist_by_id(
            watchlist_id=str(wl.id), symbol=normalized_sym
        )
    return {"symbols": _symbols(wl, asset_class)}


def remove_from_watchlist(symbol: str, asset_class: str = "") -> dict:
    sym = symbol.strip().upper()
    wl = _get_or_create(_wl_name(asset_class), _wl_defaults(asset_class))
    # Check in normalized form
    wl_symbols = _symbols(wl, asset_class)
    normalized_sym = normalize_crypto_symbol(sym, asset_class) if asset_class == "crypto" else sym
    if normalized_sym in wl_symbols:
        # Try removing with the symbol as-is first (Alpaca may accept normalized form)
        wl = trading_client().remove_asset_from_watchlist_by_id(
            watchlist_id=str(wl.id), symbol=normalized_sym
        )
    return {"symbols": _symbols(wl, asset_class)}
