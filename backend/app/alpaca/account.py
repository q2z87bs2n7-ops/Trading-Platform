"""Account, positions, portfolio history, activities, clock, calendar reads."""

import requests as _req

from alpaca.trading.requests import GetCalendarRequest, GetPortfolioHistoryRequest

from ..config import get_settings
from .client import normalize_crypto_symbol, trading_client


def get_account() -> dict:
    a = trading_client().get_account()
    equity = float(a.equity)
    # First equity value from today's 1-minute intraday history = opening
    # equity. Fall back to current equity if the history fetch hiccups.
    equity_at_market_open = equity
    try:
        hist = get_portfolio_history("1D", "1Min")
        equities = hist.get("equity") or hist.get("equity_values")
        if equities and equities[0] is not None:
            equity_at_market_open = float(equities[0])
    except (KeyError, ValueError, TypeError, IndexError):
        pass
    return {
        "account_number": a.account_number,
        "status": str(a.status),
        "currency": a.currency,
        "cash": float(a.cash),
        "equity": equity,
        "buying_power": float(a.buying_power),
        "non_marginable_buying_power": float(a.non_marginable_buying_power),
        "portfolio_value": float(a.portfolio_value),
        "long_market_value": float(a.long_market_value),
        "short_market_value": float(a.short_market_value or 0),
        "initial_margin": float(a.initial_margin or 0),
        "maintenance_margin": float(a.maintenance_margin or 0),
        "daytrading_buying_power": float(a.daytrading_buying_power or 0),
        "regt_buying_power": float(a.regt_buying_power or 0),
        "pattern_day_trader": a.pattern_day_trader,
        "equity_at_market_open": equity_at_market_open,
    }


def _position_dict(p) -> dict:
    # Alpaca's positions endpoint strips the slash from crypto pairs
    # (BTCUSD instead of BTC/USD). Re-insert it so it matches watchlist
    # symbols and order symbols, which both use the slash format.
    symbol = normalize_crypto_symbol(p.symbol, str(p.asset_class))
    return {
        "symbol": symbol,
        "asset_class": str(p.asset_class),
        "qty": float(p.qty),
        "side": str(p.side),
        "avg_entry_price": float(p.avg_entry_price),
        "current_price": float(p.current_price or 0),
        "market_value": float(p.market_value or 0),
        "cost_basis": float(p.cost_basis or 0),
        "unrealized_pl": float(p.unrealized_pl or 0),
        "unrealized_plpc": float(p.unrealized_plpc or 0),
        "unrealized_intraday_pl": float(p.unrealized_intraday_pl or 0),
        "unrealized_intraday_plpc": float(p.unrealized_intraday_plpc or 0),
        "change_today": float(p.change_today or 0),
    }


def get_positions() -> list[dict]:
    return [_position_dict(p) for p in trading_client().get_all_positions()]


def get_position(symbol: str) -> dict:
    return _position_dict(trading_client().get_open_position(symbol.upper()))


def get_activities(activity_type: str | None, limit: int) -> list[dict]:
    # No SDK convenience method in alpaca-py 0.33.1; hit the raw REST path.
    params: dict = {"page_size": limit}
    if activity_type:
        params["activity_types"] = activity_type.upper()
    data = trading_client().get("/account/activities", data=params)
    return data if isinstance(data, list) else []


def get_clock() -> dict:
    c = trading_client().get_clock()
    return {
        "timestamp": int(c.timestamp.timestamp()),
        "is_open": c.is_open,
        "next_open": int(c.next_open.timestamp()),
        "next_close": int(c.next_close.timestamp()),
    }


def get_calendar(start: str | None, end: str | None) -> list[dict]:
    req = GetCalendarRequest(start=start, end=end) if (start or end) else None
    cal = trading_client().get_calendar(filters=req)
    return [
        {"date": str(d.date), "open": str(d.open), "close": str(d.close)}
        for d in cal
    ]


def get_corporate_actions(
    symbols: list[str] | None,
    ca_types: list[str] | None,
    since: str | None,
    limit: int,
) -> list[dict]:
    s = get_settings()
    params: dict = {"limit": min(limit, 50)}
    if symbols:
        params["symbols"] = ",".join(sym.upper() for sym in symbols)
    # API requires at least one type filter; default to all four when unspecified.
    params["ca_types"] = ",".join(ca_types) if ca_types else "dividend,merger,spinoff,split"
    if since:
        params["since"] = since
    headers = {
        "APCA-API-KEY-ID": s.alpaca_api_key,
        "APCA-API-SECRET-KEY": s.alpaca_secret_key,
    }
    resp = _req.get(
        "https://data.alpaca.markets/v1beta1/corporate-actions/announcements",
        params=params,
        headers=headers,
        timeout=10,
    )
    resp.raise_for_status()
    data = resp.json()
    items = data.get("announcements", data) if isinstance(data, dict) else data
    return items if isinstance(items, list) else []


def get_portfolio_history(period: str, timeframe: str) -> dict:
    # No SDK convenience method in alpaca-py 0.33.1; hit the raw REST path.
    req = GetPortfolioHistoryRequest(period=period, timeframe=timeframe)
    data = trading_client().get(
        "/account/portfolio/history", data=req.to_request_fields()
    )
    return data if isinstance(data, dict) else {}
