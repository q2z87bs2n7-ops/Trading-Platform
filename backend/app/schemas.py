"""Typed request/response contracts for the write path.

These models are the explicit data contract for Stage 2 endpoints and the
source of truth that ``frontend/src/types.ts`` mirrors. Existing read
endpoints intentionally keep their dict shape (no churn).
"""

from typing import Literal

from pydantic import BaseModel, Field, model_validator

OrderTypeStr = Literal["market", "limit", "stop", "stop_limit", "trailing_stop"]
SideStr = Literal["buy", "sell"]
TIFStr = Literal["day", "gtc", "opg", "cls", "ioc", "fok"]
OrderClassStr = Literal["simple", "bracket", "oco", "oto"]


class SubmitOrderRequest(BaseModel):
    symbol: str = Field(min_length=1)
    side: SideStr
    type: OrderTypeStr = "market"
    time_in_force: TIFStr = "day"
    qty: float | None = Field(default=None, gt=0)
    notional: float | None = Field(default=None, gt=0)
    limit_price: float | None = Field(default=None, gt=0)
    stop_price: float | None = Field(default=None, gt=0)
    trail_price: float | None = Field(default=None, gt=0)
    trail_percent: float | None = Field(default=None, gt=0)
    extended_hours: bool = False
    client_order_id: str | None = None
    order_class: OrderClassStr | None = None
    # Bracket / OTO / OCO legs.
    take_profit_limit_price: float | None = Field(default=None, gt=0)
    stop_loss_stop_price: float | None = Field(default=None, gt=0)
    stop_loss_limit_price: float | None = Field(default=None, gt=0)

    @model_validator(mode="after")
    def _check(self) -> "SubmitOrderRequest":
        if (self.qty is None) == (self.notional is None):
            raise ValueError("exactly one of qty or notional is required")
        if self.type in ("limit", "stop_limit") and self.limit_price is None:
            raise ValueError(f"{self.type} order requires limit_price")
        if self.type in ("stop", "stop_limit") and self.stop_price is None:
            raise ValueError(f"{self.type} order requires stop_price")
        if self.type == "trailing_stop" and not (self.trail_price or self.trail_percent):
            raise ValueError("trailing_stop requires trail_price or trail_percent")
        if self.order_class in ("bracket", "oto") and self.notional is not None:
            raise ValueError("bracket/oto orders require qty, not notional")
        return self


class ReplaceOrderRequest(BaseModel):
    qty: float | None = Field(default=None, gt=0)
    limit_price: float | None = Field(default=None, gt=0)
    stop_price: float | None = Field(default=None, gt=0)
    trail: float | None = Field(default=None, gt=0)
    time_in_force: TIFStr | None = None

    @model_validator(mode="after")
    def _any(self) -> "ReplaceOrderRequest":
        if not self.model_dump(exclude_none=True):
            raise ValueError("at least one field is required to replace an order")
        return self


class OrderOut(BaseModel):
    id: str
    symbol: str
    asset_class: str | None = None
    side: str
    type: str
    order_class: str | None = None
    qty: float | None = None
    filled_qty: float = 0
    filled_avg_price: float | None = None
    limit_price: float | None = None
    stop_price: float | None = None
    time_in_force: str | None = None
    status: str
    submitted_at: int | None = None


class PositionOut(BaseModel):
    symbol: str
    asset_class: str
    qty: float
    side: str
    avg_entry_price: float
    current_price: float
    market_value: float
    cost_basis: float
    unrealized_pl: float
    unrealized_plpc: float
    unrealized_intraday_pl: float
    unrealized_intraday_plpc: float
    change_today: float


class AssetOut(BaseModel):
    symbol: str
    name: str
    exchange: str
    asset_class: str
    status: str
    tradable: bool
    marginable: bool = False
    shortable: bool = False
    fractionable: bool = False
    # Catalogue enrichment (present when served from the DB; null from Alpaca).
    sector: str | None = None
    logo_url: str | None = None
    market_cap: int | None = None


class PositionsOut(BaseModel):
    positions: list[PositionOut]


class PnlHistoryOut(BaseModel):
    # Daily cumulative net P/L curve for one asset-class silo, reconstructed
    # from fills (FIFO) + historical daily closes. `t` is unix seconds.
    # `asset_class` echoes the resolved silo ("stocks" | "crypto").
    t: list[int]
    pnl: list[float]
    asset_class: str


class CancelledOrders(BaseModel):
    cancelled: list[str]


class WatchlistSymbol(BaseModel):
    symbol: str = Field(min_length=1)
