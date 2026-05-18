from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from . import alpaca
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

    The frontend polls this on an interval. A plain REST endpoint (rather
    than a WebSocket) keeps the backend deployable to serverless platforms
    like Vercel, which do not support long-lived socket connections.
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
