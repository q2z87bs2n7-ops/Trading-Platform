import asyncio

from fastapi import Depends, FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse

from . import alpaca
from . import stream as quote_stream
from .config import get_settings
from .schemas import (
    AssetOut,
    CancelledOrders,
    OrderOut,
    ReplaceOrderRequest,
    SubmitOrderRequest,
)

app = FastAPI(title="Trading Platform API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=get_settings().origins,
    allow_methods=["*"],
    allow_headers=["*"],
)


# --- Single error boundary -------------------------------------------------
# Every data route below just calls into ``alpaca`` and returns. Alpaca/
# network failures bubble up here and become a clean 502 with the same
# ``{"detail": ...}`` shape the frontend already parses, so one bad symbol
# or an Alpaca outage degrades a single tile -- never the process.


@app.exception_handler(Exception)
async def _alpaca_error_boundary(_: Request, exc: Exception) -> JSONResponse:
    return JSONResponse(status_code=502, content={"detail": f"Alpaca error: {exc}"})


def require_configured() -> None:
    """503 (not 502) when paper keys are absent. Same detail string the
    frontend keys off; do not change without updating the client."""
    if not get_settings().configured:
        raise HTTPException(
            503, "Alpaca API keys not configured. See backend/.env.example"
        )


def require_write_auth() -> None:
    """Charter Hard Rule #3 — shared-token gate on every trade-mutating
    route. Consciously a NO-OP for the early dev stages (paper account,
    single dev). Enabling the gate later is a one-line change *inside this
    function* (check a header/token against settings); no route signature
    or wiring changes. Do not remove the dependency from the write routes.
    """
    return None


@app.get("/api/health")
def health() -> dict:
    return {"ok": True, "configured": get_settings().configured}


@app.get("/api/config")
def config() -> dict:
    s = get_settings()
    return {"symbols": s.symbols, "feed": s.alpaca_data_feed, "paper": s.alpaca_paper}


@app.get("/api/account", dependencies=[Depends(require_configured)])
def account() -> dict:
    return alpaca.get_account()


@app.get("/api/positions", dependencies=[Depends(require_configured)])
def positions() -> dict:
    return {"positions": alpaca.get_positions()}


@app.get("/api/positions/{symbol}", dependencies=[Depends(require_configured)])
def position(symbol: str) -> dict:
    return alpaca.get_position(symbol)


@app.get("/api/portfolio/history", dependencies=[Depends(require_configured)])
def portfolio_history(
    period: str = Query("1M"),
    timeframe: str = Query("1D"),
) -> dict:
    return alpaca.get_portfolio_history(period, timeframe)


@app.get("/api/orders", dependencies=[Depends(require_configured)])
def orders(
    status: str = Query("all"),
    limit: int = Query(50, ge=1, le=500),
) -> dict:
    return {"orders": alpaca.get_orders(status, limit)}


@app.get("/api/activities", dependencies=[Depends(require_configured)])
def activities(
    type: str = Query(""),
    limit: int = Query(50, ge=1, le=100),
) -> dict:
    return {"activities": alpaca.get_activities(type or None, limit)}


@app.get("/api/clock", dependencies=[Depends(require_configured)])
def clock() -> dict:
    return alpaca.get_clock()


@app.get("/api/calendar", dependencies=[Depends(require_configured)])
def calendar(
    start: str = Query(""),
    end: str = Query(""),
) -> dict:
    return {"calendar": alpaca.get_calendar(start or None, end or None)}


@app.get("/api/assets/{symbol}", dependencies=[Depends(require_configured)])
def asset(symbol: str) -> dict:
    return alpaca.get_asset(symbol)


@app.get("/api/bars", dependencies=[Depends(require_configured)])
def bars(
    symbol: str = Query(..., min_length=1),
    timeframe: str = Query("1Day"),
    limit: int = Query(120, ge=1, le=1000),
) -> dict:
    return {"symbol": symbol.upper(), "bars": alpaca.get_bars(symbol, timeframe, limit)}


@app.get("/api/quotes", dependencies=[Depends(require_configured)])
def quotes(symbols: str = Query("")) -> dict:
    """Latest quotes for the given comma-separated symbols.

    This is the polling fallback used when the SSE stream (``/api/stream``)
    is unavailable -- e.g. on serverless platforms like Vercel, which cannot
    hold the long-lived connection that real-time streaming requires.
    """
    syms = [s.strip().upper() for s in symbols.split(",") if s.strip()]
    if not syms:
        syms = get_settings().symbols
    return {"quotes": alpaca.get_latest_quotes(syms)}


@app.get(
    "/api/assets",
    dependencies=[Depends(require_configured)],
    response_model=list[AssetOut],
)
def assets_search(
    search: str = Query("", description="symbol/name substring"),
    limit: int = Query(25, ge=1, le=100),
) -> list[dict]:
    return alpaca.search_assets(search, limit)


# --- Write path (Stage 2). Every route below carries the no-op write-auth
# seam so the Charter shared-token gate drops in with no rewiring. -----------

_WRITE_DEPS = [Depends(require_configured), Depends(require_write_auth)]


@app.post("/api/orders", dependencies=_WRITE_DEPS, response_model=OrderOut)
def submit_order(req: SubmitOrderRequest) -> dict:
    return alpaca.submit_order(req)


@app.patch(
    "/api/orders/{order_id}", dependencies=_WRITE_DEPS, response_model=OrderOut
)
def replace_order(order_id: str, req: ReplaceOrderRequest) -> dict:
    return alpaca.replace_order(order_id, req)


@app.delete(
    "/api/orders/{order_id}",
    dependencies=_WRITE_DEPS,
    response_model=CancelledOrders,
)
def cancel_order(order_id: str) -> dict:
    return alpaca.cancel_order(order_id)


@app.delete(
    "/api/orders", dependencies=_WRITE_DEPS, response_model=CancelledOrders
)
def cancel_all_orders() -> dict:
    return alpaca.cancel_all_orders()


@app.delete(
    "/api/positions/{symbol}", dependencies=_WRITE_DEPS, response_model=OrderOut
)
def close_position(symbol: str) -> dict:
    return alpaca.close_position(symbol)


@app.delete("/api/positions", dependencies=_WRITE_DEPS)
def close_all_positions() -> dict:
    return alpaca.close_all_positions()


@app.get("/api/stream")
async def stream(
    request: Request, symbols: str = Query("")
) -> StreamingResponse:
    """Real-time quote stream (Server-Sent Events).

    Backed by a single shared Alpaca WebSocket; requires a persistent host.
    On serverless this connection is dropped and the frontend falls back to
    polling ``/api/quotes`` automatically. ``symbols`` is the comma-separated
    set this client wants; empty falls back to the configured defaults.
    """
    require_configured()
    syms = [s.strip().upper() for s in symbols.split(",") if s.strip()]
    if not syms:
        syms = get_settings().symbols
    queue = await quote_stream.hub.subscribe(syms)

    async def events():
        try:
            while True:
                if await request.is_disconnected():
                    break
                try:
                    payload = await asyncio.wait_for(queue.get(), timeout=15)
                    yield f"data: {payload}\n\n"
                except asyncio.TimeoutError:
                    # Comment line keeps proxies from closing an idle stream.
                    yield ": keepalive\n\n"
        finally:
            quote_stream.hub.unsubscribe(queue)

    return StreamingResponse(
        events(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
