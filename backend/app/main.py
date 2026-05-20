import asyncio
import time
from pathlib import Path

from alpaca.common.exceptions import APIError
from fastapi import Depends, FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse

from . import alpaca
from . import indices as market_indices
from . import market_news
from . import stream as quote_stream
from .config import get_settings
from .schemas import (
    AssetOut,
    CancelledOrders,
    OrderOut,
    PositionOut,
    PositionsOut,
    ReplaceOrderRequest,
    SubmitOrderRequest,
    WatchlistSymbol,
)

_version = Path(__file__).parent.parent.parent.joinpath("VERSION").read_text().strip()
app = FastAPI(title="Trading Platform API", version=_version)

app.add_middleware(
    CORSMiddleware,
    allow_origins=get_settings().origins,
    allow_methods=["*"],
    allow_headers=["*"],
)


# --- Error boundary --------------------------------------------------------
# Every data route just calls into ``alpaca`` and returns. Failures bubble
# up here as a clean ``{"detail": ...}`` (the shape the frontend parses) so
# one bad symbol or an Alpaca outage degrades a single tile, never the
# process. Alpaca's own HTTP status is passed through (a bad symbol is a
# 404, not a 502); only connection-level / non-Alpaca failures collapse to
# 502. ``HTTPException`` / ``RequestValidationError`` keep their dedicated
# FastAPI handlers (most-specific wins), so the 503 keys-not-configured and
# 422 validation contracts are unaffected.


@app.exception_handler(APIError)
async def _alpaca_api_error(_: Request, exc: APIError) -> JSONResponse:
    status = getattr(exc, "status_code", None) or 502
    return JSONResponse(status_code=status, content={"detail": f"Alpaca error: {exc}"})


@app.exception_handler(Exception)
async def _unexpected_error(_: Request, exc: Exception) -> JSONResponse:
    return JSONResponse(status_code=502, content={"detail": f"Upstream error: {exc}"})


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


@app.get(
    "/api/positions",
    dependencies=[Depends(require_configured)],
    response_model=PositionsOut,
)
def positions() -> dict:
    return {"positions": alpaca.get_positions()}


@app.get(
    "/api/positions/{symbol}",
    dependencies=[Depends(require_configured)],
    response_model=PositionOut,
)
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


@app.get("/api/news", dependencies=[Depends(require_configured)])
def news(
    symbol: str = Query(..., min_length=1),
    limit: int = Query(10, ge=1, le=50),
) -> dict:
    return {"symbol": symbol.upper(), "news": alpaca.get_news(symbol, limit)}


@app.get("/api/market-news")
def market_news_feed(limit: int = Query(20, ge=1, le=50)) -> dict:
    """Yahoo Finance top-stories RSS. No Alpaca keys required."""
    return {"articles": market_news.get_market_news(limit)}


@app.get("/api/indices")
def indices_snapshot() -> dict:
    """Market index snapshots (Yahoo Finance). No Alpaca keys required."""
    return {"indices": market_indices.get_indices(), "as_of": int(time.time())}


@app.get("/api/movers", dependencies=[Depends(require_configured)])
def movers(top: int = Query(10, ge=1, le=50)) -> dict:
    return alpaca.get_movers(top)


@app.get("/api/most-active", dependencies=[Depends(require_configured)])
def most_active(
    top: int = Query(10, ge=1, le=50),
    by: str = Query("volume", pattern="^(volume|trades)$"),
) -> dict:
    return alpaca.get_most_actives(top, by)


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


@app.get("/api/snapshots", dependencies=[Depends(require_configured)])
def snapshots(symbols: str = Query("")) -> dict:
    """One-call snapshot per symbol: prev close + day OHLC + last price.

    Replaces the watchlist's N parallel ``/api/bars?timeframe=1Day`` mount
    burst with a single round-trip."""
    syms = [s.strip().upper() for s in symbols.split(",") if s.strip()]
    if not syms:
        syms = get_settings().symbols
    return {"snapshots": alpaca.get_snapshots(syms)}


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


# --- Watchlist (server-side, persisted on the Alpaca paper account). The
# mutating routes carry the write-auth seam like the trade routes. ----------


@app.get("/api/watchlist", dependencies=[Depends(require_configured)])
def watchlist() -> dict:
    return alpaca.get_watchlist()


@app.post("/api/watchlist", dependencies=_WRITE_DEPS)
def watchlist_add(req: WatchlistSymbol) -> dict:
    return alpaca.add_to_watchlist(req.symbol)


@app.delete("/api/watchlist/{symbol}", dependencies=_WRITE_DEPS)
def watchlist_remove(symbol: str) -> dict:
    return alpaca.remove_from_watchlist(symbol)


@app.get("/api/stream")
async def stream(
    request: Request,
    symbols: str = Query(""),
    kinds: str = Query("quote"),
) -> StreamingResponse:
    """Real-time stream (Server-Sent Events) for quotes and/or 1-minute bars.

    Backed by a single shared Alpaca WebSocket; requires a persistent host.
    On serverless this connection is dropped and the frontend falls back to
    polling ``/api/quotes`` automatically. ``symbols`` is the comma-separated
    set this client wants; empty falls back to the configured defaults.
    ``kinds`` is a comma-separated subset of ``quote,bar``; events arrive
    JSON-encoded with a ``kind`` discriminator. Default ``quote`` keeps the
    legacy ``useLiveQuotes`` contract unchanged.
    """
    require_configured()
    syms = [s.strip().upper() for s in symbols.split(",") if s.strip()]
    if not syms:
        syms = get_settings().symbols
    ks = {k.strip().lower() for k in kinds.split(",") if k.strip()}
    valid_ks = {k for k in ks if k in ("quote", "bar")}
    queue = await quote_stream.hub.subscribe(syms, valid_ks)  # type: ignore[arg-type]

    async def events():
        try:
            # Flush a first byte immediately so a slow upstream can't let an
            # intermediary cut the connection before the first quote/keepalive.
            yield ": connected\n\n"
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
