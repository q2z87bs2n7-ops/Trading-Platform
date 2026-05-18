"""Order/asset reads plus the paper-trading write path.

Writes are gated in ``main.py`` by the (currently no-op) write-auth seam;
this module just maps our typed requests onto the alpaca-py SDK.
"""

from alpaca.trading.enums import OrderClass, OrderSide, QueryOrderStatus, TimeInForce
from alpaca.trading.requests import (
    GetAssetsRequest,
    GetOrdersRequest,
    LimitOrderRequest,
    MarketOrderRequest,
    ReplaceOrderRequest as SdkReplaceOrderRequest,
    StopLimitOrderRequest,
    StopLossRequest,
    StopOrderRequest,
    TakeProfitRequest,
    TrailingStopOrderRequest,
)

from ..schemas import ReplaceOrderRequest, SubmitOrderRequest
from .client import trading_client

_TIF = {
    "day": TimeInForce.DAY,
    "gtc": TimeInForce.GTC,
    "opg": TimeInForce.OPG,
    "cls": TimeInForce.CLS,
    "ioc": TimeInForce.IOC,
    "fok": TimeInForce.FOK,
}
_CLASS = {
    "simple": OrderClass.SIMPLE,
    "bracket": OrderClass.BRACKET,
    "oco": OrderClass.OCO,
    "oto": OrderClass.OTO,
}


def _order_dict(o) -> dict:
    return {
        "id": str(o.id),
        "symbol": o.symbol,
        "side": str(o.side),
        "type": str(o.order_type or o.type),
        "order_class": str(o.order_class) if o.order_class else None,
        "qty": float(o.qty) if o.qty is not None else None,
        "filled_qty": float(o.filled_qty or 0),
        "filled_avg_price": (
            float(o.filled_avg_price) if o.filled_avg_price is not None else None
        ),
        "limit_price": float(o.limit_price) if o.limit_price is not None else None,
        "stop_price": float(o.stop_price) if o.stop_price is not None else None,
        "time_in_force": str(o.time_in_force) if o.time_in_force else None,
        "status": str(o.status),
        "submitted_at": int(o.submitted_at.timestamp()) if o.submitted_at else None,
    }


def get_orders(status: str, limit: int) -> list[dict]:
    status_map = {
        "open": QueryOrderStatus.OPEN,
        "closed": QueryOrderStatus.CLOSED,
        "all": QueryOrderStatus.ALL,
    }
    req = GetOrdersRequest(
        status=status_map.get(status.lower(), QueryOrderStatus.ALL), limit=limit
    )
    return [_order_dict(o) for o in trading_client().get_orders(filter=req)]


def _build_order_request(r: SubmitOrderRequest):
    common = dict(
        symbol=r.symbol.upper(),
        side=OrderSide.BUY if r.side == "buy" else OrderSide.SELL,
        time_in_force=_TIF[r.time_in_force],
        extended_hours=r.extended_hours,
        client_order_id=r.client_order_id,
        order_class=_CLASS[r.order_class] if r.order_class else None,
    )
    if r.qty is not None:
        common["qty"] = r.qty
    else:
        common["notional"] = r.notional
    if r.order_class in ("bracket", "oto") and r.take_profit_limit_price:
        common["take_profit"] = TakeProfitRequest(
            limit_price=r.take_profit_limit_price
        )
    if r.order_class in ("bracket", "oco", "oto") and (
        r.stop_loss_stop_price or r.stop_loss_limit_price
    ):
        common["stop_loss"] = StopLossRequest(
            stop_price=r.stop_loss_stop_price,
            limit_price=r.stop_loss_limit_price,
        )

    if r.type == "market":
        return MarketOrderRequest(**common)
    if r.type == "limit":
        return LimitOrderRequest(limit_price=r.limit_price, **common)
    if r.type == "stop":
        return StopOrderRequest(stop_price=r.stop_price, **common)
    if r.type == "stop_limit":
        return StopLimitOrderRequest(
            limit_price=r.limit_price, stop_price=r.stop_price, **common
        )
    return TrailingStopOrderRequest(
        trail_price=r.trail_price, trail_percent=r.trail_percent, **common
    )


def submit_order(r: SubmitOrderRequest) -> dict:
    return _order_dict(trading_client().submit_order(order_data=_build_order_request(r)))


def replace_order(order_id: str, r: ReplaceOrderRequest) -> dict:
    req = SdkReplaceOrderRequest(
        qty=int(r.qty) if r.qty is not None else None,
        limit_price=r.limit_price,
        stop_price=r.stop_price,
        trail=r.trail,
        time_in_force=_TIF[r.time_in_force] if r.time_in_force else None,
    )
    return _order_dict(trading_client().replace_order_by_id(order_id, req))


def cancel_order(order_id: str) -> dict:
    trading_client().cancel_order_by_id(order_id)
    return {"cancelled": [order_id]}


def cancel_all_orders() -> dict:
    resp = trading_client().cancel_orders()
    return {"cancelled": [str(r.id) for r in resp]}


def close_position(symbol: str) -> dict:
    o = trading_client().close_position(symbol.upper())
    return _order_dict(o)


def close_all_positions() -> dict:
    resp = trading_client().close_all_positions(cancel_orders=True)
    return {"closed": [str(getattr(r, "symbol", "")) for r in resp]}


def get_asset(symbol: str) -> dict:
    return _asset_dict(trading_client().get_asset(symbol.upper()))


def _asset_dict(a) -> dict:
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


def search_assets(query: str, limit: int) -> list[dict]:
    """Substring match over tradable US equities, capped at ``limit``."""
    q = query.strip().upper()
    assets = trading_client().get_all_assets(GetAssetsRequest())
    out: list[dict] = []
    for a in assets:
        if not a.tradable:
            continue
        if q and q not in a.symbol.upper() and q not in (a.name or "").upper():
            continue
        out.append(_asset_dict(a))
        if len(out) >= limit:
            break
    return out
