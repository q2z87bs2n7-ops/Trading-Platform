"""Account, positions, portfolio history, activities, clock, calendar reads."""

from alpaca.trading.requests import GetCalendarRequest, GetPortfolioHistoryRequest

from .client import trading_client


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


def _position_dict(p) -> dict:
    return {
        "symbol": p.symbol,
        "qty": float(p.qty),
        "side": str(p.side),
        "avg_entry_price": float(p.avg_entry_price),
        "current_price": float(p.current_price or 0),
        "market_value": float(p.market_value or 0),
        "cost_basis": float(p.cost_basis or 0),
        "unrealized_pl": float(p.unrealized_pl or 0),
        "unrealized_plpc": float(p.unrealized_plpc or 0),
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


def get_portfolio_history(period: str, timeframe: str) -> dict:
    # No SDK convenience method in alpaca-py 0.33.1; hit the raw REST path.
    req = GetPortfolioHistoryRequest(period=period, timeframe=timeframe)
    data = trading_client().get(
        "/account/portfolio/history", data=req.to_request_fields()
    )
    return data if isinstance(data, dict) else {}
