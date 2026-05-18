import asyncio

from fastapi import FastAPI, HTTPException, Query, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from . import alpaca
from .config import get_settings

app = FastAPI(title="Trading Platform API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# How often the quotes WebSocket pushes an update, in seconds.
QUOTE_POLL_INTERVAL = 2.0


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


@app.websocket("/ws/quotes")
async def quotes_ws(websocket: WebSocket) -> None:
    """Push latest quotes for the requested symbols on a fixed interval.

    Polling the REST latest-quote endpoint (rather than Alpaca's streaming
    socket) keeps v1 simple and avoids the free-tier single-stream limit.
    Swap to alpaca.data.live.StockDataStream later for true tick streaming.
    """
    await websocket.accept()
    raw = websocket.query_params.get("symbols", "")
    symbols = [s.strip().upper() for s in raw.split(",") if s.strip()]
    if not symbols:
        symbols = get_settings().symbols

    if not get_settings().configured:
        await websocket.send_json({"error": "Alpaca API keys not configured"})
        await websocket.close()
        return

    try:
        while True:
            try:
                quotes = await asyncio.to_thread(alpaca.get_latest_quotes, symbols)
                await websocket.send_json({"quotes": quotes})
            except Exception as exc:  # noqa: BLE001
                await websocket.send_json({"error": f"Alpaca error: {exc}"})
            await asyncio.sleep(QUOTE_POLL_INTERVAL)
    except WebSocketDisconnect:
        return
