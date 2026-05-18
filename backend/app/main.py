import asyncio

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

from . import alpaca
from . import stream as quote_stream
from .config import get_settings

app = FastAPI(title="Trading Platform API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=get_settings().origins,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health() -> dict:
    return {"ok": True, "configured": get_settings().configured}


@app.get("/api/config")
def config() -> dict:
    s = get_settings()
    return {"symbols": s.symbols, "feed": s.alpaca_data_feed, "paper": s.alpaca_paper}


@app.get("/api/account")
def account() -> dict:
    if not get_settings().configured:
        raise HTTPException(503, "Alpaca API keys not configured. See backend/.env.example")
    try:
        return alpaca.get_account()
    except Exception as exc:  # noqa: BLE001 - surface Alpaca errors to the client
        raise HTTPException(502, f"Alpaca error: {exc}") from exc


def _require_configured() -> None:
    if not get_settings().configured:
        raise HTTPException(503, "Alpaca API keys not configured. See backend/.env.example")


@app.get("/api/positions")
def positions() -> dict:
    _require_configured()
    try:
        return {"positions": alpaca.get_positions()}
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(502, f"Alpaca error: {exc}") from exc


@app.get("/api/positions/{symbol}")
def position(symbol: str) -> dict:
    _require_configured()
    try:
        return alpaca.get_position(symbol)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(502, f"Alpaca error: {exc}") from exc


@app.get("/api/portfolio/history")
def portfolio_history(
    period: str = Query("1M"),
    timeframe: str = Query("1D"),
) -> dict:
    _require_configured()
    try:
        return alpaca.get_portfolio_history(period, timeframe)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(502, f"Alpaca error: {exc}") from exc


@app.get("/api/orders")
def orders(
    status: str = Query("all"),
    limit: int = Query(50, ge=1, le=500),
) -> dict:
    _require_configured()
    try:
        return {"orders": alpaca.get_orders(status, limit)}
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(502, f"Alpaca error: {exc}") from exc


@app.get("/api/activities")
def activities(
    type: str = Query(""),
    limit: int = Query(50, ge=1, le=100),
) -> dict:
    _require_configured()
    try:
        return {"activities": alpaca.get_activities(type or None, limit)}
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(502, f"Alpaca error: {exc}") from exc


@app.get("/api/clock")
def clock() -> dict:
    _require_configured()
    try:
        return alpaca.get_clock()
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(502, f"Alpaca error: {exc}") from exc


@app.get("/api/calendar")
def calendar(
    start: str = Query(""),
    end: str = Query(""),
) -> dict:
    _require_configured()
    try:
        return {"calendar": alpaca.get_calendar(start or None, end or None)}
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(502, f"Alpaca error: {exc}") from exc


@app.get("/api/assets/{symbol}")
def asset(symbol: str) -> dict:
    _require_configured()
    try:
        return alpaca.get_asset(symbol)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(502, f"Alpaca error: {exc}") from exc


@app.get("/api/bars")
def bars(
    symbol: str = Query(..., min_length=1),
    timeframe: str = Query("1Day"),
    limit: int = Query(120, ge=1, le=1000),
) -> dict:
    if not get_settings().configured:
        raise HTTPException(503, "Alpaca API keys not configured. See backend/.env.example")
    try:
        return {"symbol": symbol.upper(), "bars": alpaca.get_bars(symbol, timeframe, limit)}
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(502, f"Alpaca error: {exc}") from exc


@app.get("/api/quotes")
def quotes(symbols: str = Query("")) -> dict:
    """Latest quotes for the given comma-separated symbols.

    This is the polling fallback used when the SSE stream (``/api/stream``)
    is unavailable -- e.g. on serverless platforms like Vercel, which cannot
    hold the long-lived connection that real-time streaming requires.
    """
    if not get_settings().configured:
        raise HTTPException(503, "Alpaca API keys not configured. See backend/.env.example")
    syms = [s.strip().upper() for s in symbols.split(",") if s.strip()]
    if not syms:
        syms = get_settings().symbols
    try:
        return {"quotes": alpaca.get_latest_quotes(syms)}
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(502, f"Alpaca error: {exc}") from exc


@app.get("/api/stream")
async def stream(request: Request) -> StreamingResponse:
    """Real-time quote stream (Server-Sent Events).

    Backed by a single shared Alpaca WebSocket; requires a persistent host.
    On serverless this connection is dropped and the frontend falls back to
    polling ``/api/quotes`` automatically.
    """
    if not get_settings().configured:
        raise HTTPException(503, "Alpaca API keys not configured. See backend/.env.example")
    queue = await quote_stream.hub.subscribe()

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
