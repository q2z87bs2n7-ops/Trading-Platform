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
from alpaca.trading.enums import QueryOrderStatus
from alpaca.trading.requests import (
    GetCalendarRequest,
    GetOrdersRequest,
    GetPortfolioHistoryRequest,
)

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


def get_orders(status: str, limit: int) -> list[dict]:
    status_map = {
        "open": QueryOrderStatus.OPEN,
        "closed": QueryOrderStatus.CLOSED,
        "all": QueryOrderStatus.ALL,
    }
    req = GetOrdersRequest(
        status=status_map.get(status.lower(), QueryOrderStatus.ALL), limit=limit
    )
    out: list[dict] = []
    for o in trading_client().get_orders(filter=req):
        out.append(
            {
                "id": str(o.id),
                "symbol": o.symbol,
                "side": str(o.side),
                "type": str(o.order_type or o.type),
                "qty": float(o.qty) if o.qty is not None else None,
                "filled_qty": float(o.filled_qty or 0),
                "filled_avg_price": (
                    float(o.filled_avg_price)
                    if o.filled_avg_price is not None
                    else None
                ),
                "limit_price": (
                    float(o.limit_price) if o.limit_price is not None else None
                ),
                "status": str(o.status),
                "submitted_at": (
                    int(o.submitted_at.timestamp()) if o.submitted_at else None
                ),
            }
        )
    return out


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


def get_asset(symbol: str) -> dict:
    a = trading_client().get_asset(symbol.upper())
    return {
        "symbol": a.symbol,
        "name": a.name,
        "exchange": str(a.exchange),
        "asset_class": str(a.asset_class),
        "status": str(a.status),
        "tradable": a.tradable,
        "marginable": a.marginable,
        "shortable": a.shortable,
        "fractionable": a.fractionable,
    }


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
