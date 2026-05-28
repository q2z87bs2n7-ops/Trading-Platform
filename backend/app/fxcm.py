"""
Thin proxy layer between FastAPI and the local FXCM FCLite bridge.
The bridge (fxcm-bridge/java/) runs as a sidecar on port 3001 and owns
the persistent FCLite session.  We just forward calls and return clean
JSON to the frontend.  Returns 503 when the bridge is not running.
"""

import logging
from typing import Any

import httpx
from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel

log = logging.getLogger("fxcm")

BRIDGE_URL = "http://127.0.0.1:3001"
TIMEOUT    = 10.0

router = APIRouter(prefix="/api/fxcm", tags=["fxcm"])


# ── helpers ───────────────────────────────────────────────────────────────────

async def _get(path: str, params: dict = None, timeout: float = TIMEOUT) -> Any:
    try:
        async with httpx.AsyncClient() as client:
            r = await client.get(f"{BRIDGE_URL}{path}", params=params, timeout=timeout)
        r.raise_for_status()
        return r.json()
    except httpx.ConnectError:
        raise HTTPException(503, "FXCM bridge not running")
    except httpx.HTTPStatusError as e:
        raise HTTPException(e.response.status_code, e.response.text)


async def _post(path: str, body: dict) -> Any:
    try:
        async with httpx.AsyncClient() as client:
            r = await client.post(f"{BRIDGE_URL}{path}", json=body, timeout=TIMEOUT)
        r.raise_for_status()
        return r.json()
    except httpx.ConnectError:
        raise HTTPException(503, "FXCM bridge not running")
    except httpx.HTTPStatusError as e:
        raise HTTPException(e.response.status_code, e.response.text)


async def _delete(path: str) -> Any:
    try:
        async with httpx.AsyncClient() as client:
            r = await client.delete(f"{BRIDGE_URL}{path}", timeout=TIMEOUT)
        r.raise_for_status()
        return r.json()
    except httpx.ConnectError:
        raise HTTPException(503, "FXCM bridge not running")
    except httpx.HTTPStatusError as e:
        raise HTTPException(e.response.status_code, e.response.text)


# ── Pydantic models ────────────────────────────────────────────────────────────

class OrderRequest(BaseModel):
    instrument: str
    buy_sell: str           # "B" or "S"
    amount: int = 1000
    order_type: str = "OM"  # OM=market, SE=stop entry, LE=limit entry
    rate: float = 0
    stop: float = 0
    limit: float = 0


class CloseRequest(BaseModel):
    trade_id: str
    amount: int = 0


# ── Routes ─────────────────────────────────────────────────────────────────────

@router.get("/health")
async def health():
    return await _get("/health")


@router.get("/account")
async def account():
    return await _get("/account")


@router.get("/prices")
async def prices(instrument: str = None):
    params = {"instrument": instrument} if instrument else None
    return await _get("/prices", params=params)


@router.get("/positions")
async def positions():
    return await _get("/positions")


@router.get("/orders")
async def orders():
    return await _get("/orders")


@router.get("/summary")
async def summary():
    return await _get("/summary")


@router.get("/closed_trades")
async def closed_trades():
    return await _get("/closed_trades")


@router.get("/watchlist")
async def watchlist():
    return await _get("/watchlist")


@router.get("/instruments")
async def instruments(type: str = None, tradable: bool = False):
    params = {}
    if type:
        params["type"] = type
    if tradable:
        params["tradable"] = "true"
    return await _get("/instruments", params=params or None)


@router.get("/instruments/{name:path}")
async def instrument_detail(name: str):
    return await _get(f"/instruments/{name}")


@router.get("/history")
async def history(
    instrument: str = "EUR/USD",
    timeframe: str = "H1",
    date_from: str = None,
    date_to: str = None,
):
    params = {"instrument": instrument, "timeframe": timeframe}
    if date_from:
        params["from"] = date_from
    if date_to:
        params["to"] = date_to
    return await _get("/history", params=params)


@router.post("/order")
async def place_order(req: OrderRequest):
    return await _post("/order", req.dict())


@router.delete("/order/{order_id}")
async def cancel_order(order_id: str):
    return await _delete(f"/order/{order_id}")


@router.post("/close")
async def close_position(req: CloseRequest):
    return await _post("/close", req.dict())


@router.get("/subscribe")
async def subscribe(symbols: str, persist: bool = False):
    params: dict = {"symbols": symbols}
    if persist:
        params["persist"] = "true"
    return await _get("/subscribe", params=params, timeout=20.0)


@router.get("/unsubscribe")
async def unsubscribe(symbols: str, persist: bool = False):
    params: dict = {"symbols": symbols}
    if persist:
        params["persist"] = "true"
    return await _get("/unsubscribe", params=params, timeout=20.0)


@router.get("/subscribed")
async def subscribed():
    return await _get("/subscribed")
