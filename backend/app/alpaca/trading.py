"""Order and asset reads. Stage 2 adds the write path (submit/cancel/
replace/close) here, behind the no-op write-auth seam in ``main.py``.
"""

from alpaca.trading.enums import QueryOrderStatus
from alpaca.trading.requests import GetOrdersRequest

from .client import trading_client


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
