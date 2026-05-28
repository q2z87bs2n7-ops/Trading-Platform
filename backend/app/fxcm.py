"""
Thin proxy layer between FastAPI and the local FXCM FCLite bridge.
The bridge (fxcm-bridge/java/) runs as a sidecar on port 3001 and owns
the persistent FCLite session.  We just forward calls and return clean
JSON to the frontend.  Returns 503 when the bridge is not running.

The watchlist routes are special — they don't go through the FCLite
bridge at all. They proxy to FXCM's Endpoints suite (the same REST API
app.fxcm.com uses) with a JWT minted by fxcm_auth.py. See the
"Watchlist (Endpoints-suite, JWT-backed)" block at the bottom.
"""

import asyncio
import logging
import time
from typing import Any, Optional

import httpx
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from .fxcm_auth import get_access_token

_log = logging.getLogger(__name__)

BRIDGE_URL = "http://127.0.0.1:3001"
TIMEOUT    = 25.0

# FXCM Endpoints-suite gateway (demo). Live env would be
# endpoints.fxcorporate.com (no -demo).
_ENDPOINTS_BASE = "https://endpoints-demo.fxcorporate.com"

router = APIRouter(prefix="/api/fxcm", tags=["fxcm"])


# ── helpers ───────────────────────────────────────────────────────────────────

async def _get(path: str, params: dict = None) -> Any:
    try:
        async with httpx.AsyncClient() as client:
            r = await client.get(f"{BRIDGE_URL}{path}", params=params, timeout=TIMEOUT)
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


async def _patch(path: str, body: dict) -> Any:
    try:
        async with httpx.AsyncClient() as client:
            r = await client.patch(f"{BRIDGE_URL}{path}", json=body, timeout=TIMEOUT)
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


class ChangeOrderRequest(BaseModel):
    # Any subset; missing fields = 0 = bridge leaves that field unchanged.
    rate: float = 0
    stop: float = 0
    limit: float = 0


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
    rows = await _get("/positions")
    # AllocationDonut keys off `market_value`; the bridge exposes used_margin,
    # which is the right per-position $ figure for a CFD book.
    if isinstance(rows, list):
        for p in rows:
            if isinstance(p, dict):
                p.setdefault("market_value", p.get("used_margin", 0))
    return rows


@router.get("/orders")
async def orders():
    return await _get("/orders")


@router.get("/summary")
async def summary():
    return await _get("/summary")


@router.get("/closed_trades")
async def closed_trades():
    return await _get("/closed_trades")


@router.get("/display-names")
async def display_names():
    """Return {name: display_name} for FXCM instruments where the display
    name differs from the FCLite name (e.g. stock CFDs). Forex pairs where
    the two are identical are excluded — callers fall back to the raw name."""
    from . import db
    try:
        return db.get_fxcm_display_names()
    except db.DbUnavailable:
        return {}


@router.get("/underlying-units")
async def underlying_units():
    """Return {name: underlying_unit} for FXCM instruments (e.g. 'oz' for XAU/USD)."""
    from . import db
    try:
        return db.get_fxcm_underlying_units()
    except db.DbUnavailable:
        return {}


@router.get("/search-instruments")
async def search_instruments_db(q: str = "", limit: int = 50):
    """Search fxcm_instruments table by name, display_name, or alternatives."""
    from . import db
    if not q.strip():
        return []
    try:
        return db.search_fxcm_instruments(q.strip(), limit)
    except db.DbUnavailable:
        return []


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
    # `from` is a Python reserved word — alias the query param so the
    # frontend's `?from=...&to=...` actually binds (otherwise FastAPI
    # silently leaves these as None and the bridge falls back to its
    # own 7-day window regardless of what the chart asked for).
    from_: str | None = Query(None, alias="from"),
    to: str | None = Query(None),
):
    params = {"instrument": instrument, "timeframe": timeframe}
    if from_:
        params["from"] = from_
    if to:
        params["to"] = to
    return await _get("/history", params=params)


@router.post("/order")
async def place_order(req: OrderRequest):
    return await _post("/order", req.dict())


@router.delete("/order/{order_id}")
async def cancel_order(order_id: str):
    return await _delete(f"/order/{order_id}")


@router.patch("/order/{order_id}")
async def modify_order(order_id: str, req: ChangeOrderRequest):
    return await _patch(f"/order/{order_id}", req.dict())


@router.post("/close")
async def close_position(req: CloseRequest):
    return await _post("/close", req.dict())


async def subscribe_watchlist_at_boot() -> None:
    """Push the user's watchlist offer IDs to the bridge at FastAPI startup.

    Runs as a background task so it doesn't block the server from accepting
    requests. Polls the bridge health until ready (up to 30 s), then resolves
    the watchlist from the Endpoints suite and pushes the offer IDs via
    POST /subscribe. Best-effort — any failure is logged and ignored; the
    frontend's 3-second watchlist poll catches up within one cycle anyway.
    """
    for _ in range(15):
        try:
            await _get("/health")
            break
        except HTTPException:
            await asyncio.sleep(2)
    else:
        _log.warning("fxcm boot subscribe: bridge not ready after 30 s, skipping")
        return

    try:
        wl_id = await _resolve_watchlist_id()
        wl = await _endpoints_request("GET", f"/watchlist/id/{wl_id}")
        offer_ids = wl.get("offerIds") or []
        if not offer_ids:
            return
        global _last_subscribed_offer_ids
        current_ids = frozenset(int(oid) for oid in offer_ids)
        _last_subscribed_offer_ids = current_ids
        await _post("/subscribe", {"offer_ids": [str(i) for i in current_ids]})
        _log.info("fxcm boot subscribe: pushed %d watchlist offer IDs to bridge", len(current_ids))
    except Exception as exc:
        _log.warning("fxcm boot subscribe failed: %s", exc)


# ── Watchlist (Endpoints-suite, JWT-backed) ───────────────────────────────────
# The /api/fxcm/watchlist surface used to return a hardcoded subset of 8
# major pairs from the Java bridge. It now proxies to FXCM's real
# Endpoints-suite watchlist API (the same one app.fxcm.com uses), so the
# user's symbols persist server-side across browsers/devices.
#
# FXCM supports many watchlists per user. We pin to one, picked via
# find-or-create on first request and cached in memory. If the user
# deletes the watchlist on FXCM's side, the next request silently
# resolves a new one.

class WatchlistAddRequest(BaseModel):
    instrument: str  # symbol form, e.g. "EUR/USD", "XAU/USD", "US30"


# Module-level cache. Single-user app — no per-user scoping needed.
_watchlist_id: Optional[str] = None
_watchlist_id_lock = asyncio.Lock()
_last_subscribed_offer_ids: frozenset[int] = frozenset()

# offerId ↔ symbol map cached from the FCLite bridge's /instruments
# endpoint. Refreshed on cache miss + every hour.
_offer_map_by_id:     dict[int, str] = {}
_offer_map_by_symbol: dict[str, int] = {}
_offer_map_loaded_at: float = 0
_OFFER_MAP_TTL_SEC = 3600


async def _endpoints_request(method: str, path: str, **kwargs) -> Any:
    """HTTP call to the Endpoints-suite gateway with a fresh bearer."""
    token = await get_access_token()
    headers = kwargs.pop("headers", {}) or {}
    headers.setdefault("Authorization", f"Bearer {token}")
    headers.setdefault("Origin", "https://app.fxcm.com")
    try:
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            r = await client.request(
                method, f"{_ENDPOINTS_BASE}{path}", headers=headers, **kwargs,
            )
        r.raise_for_status()
        # Some routes (DELETE, PUT /sort) may return an empty body.
        if not r.content:
            return None
        return r.json()
    except httpx.ConnectError as e:
        raise HTTPException(503, f"FXCM endpoints unreachable: {e}")
    except httpx.HTTPStatusError as e:
        raise HTTPException(e.response.status_code, e.response.text)


async def _refresh_offer_map() -> None:
    """Pull the full instrument list from the FCLite bridge and rebuild
    the offerId ↔ symbol maps. Used to translate watchlist offerIds into
    the symbols the frontend speaks, and vice versa for add."""
    global _offer_map_loaded_at
    rows = await _get("/instruments")
    if not isinstance(rows, list):
        return
    by_id: dict[int, str] = {}
    by_sym: dict[str, int] = {}
    for row in rows:
        if not isinstance(row, dict):
            continue
        # Bridge returns raw FCLite PascalCase {Name, OfferId, Status}.
        name = row.get("Name") or row.get("instrument")
        offer = row.get("OfferId") or row.get("offer_id")
        if not name or offer is None:
            continue
        try:
            offer_int = int(offer)
        except (TypeError, ValueError):
            continue
        by_id[offer_int] = name
        by_sym[name] = offer_int
    _offer_map_by_id.clear()
    _offer_map_by_id.update(by_id)
    _offer_map_by_symbol.clear()
    _offer_map_by_symbol.update(by_sym)
    _offer_map_loaded_at = time.time()


async def _offer_map() -> tuple[dict[int, str], dict[str, int]]:
    if not _offer_map_by_id or time.time() - _offer_map_loaded_at > _OFFER_MAP_TTL_SEC:
        await _refresh_offer_map()
    return _offer_map_by_id, _offer_map_by_symbol


async def _resolve_watchlist_id() -> str:
    """Find-or-create the user's single pinned watchlist.

    Caches the ID in memory after first resolution. On 404 from later
    routes (i.e. user deleted it on FXCM's side), callers should call
    ``_reset_watchlist_id()`` to force a fresh resolve.
    """
    global _watchlist_id
    if _watchlist_id:
        return _watchlist_id

    async with _watchlist_id_lock:
        if _watchlist_id:
            return _watchlist_id

        # List all → pick the first if any exist.
        existing = await _endpoints_request("GET", "/watchlist")
        if isinstance(existing, list) and existing:
            wl_id = existing[0].get("id")
            if wl_id:
                _watchlist_id = wl_id
                return wl_id

        # None exist — create one with a sensible default.
        body = {
            "name":      "Trading Platform",
            "offerIds":  [],
            "shared":    False,
            "sortOrder": int(time.time() * 1000),
        }
        created = await _endpoints_request("POST", "/", json=body)
        if not isinstance(created, dict) or "id" not in created:
            raise HTTPException(502, "FXCM watchlist create returned unexpected shape")
        _watchlist_id = created["id"]
        return _watchlist_id


def _reset_watchlist_id() -> None:
    global _watchlist_id
    _watchlist_id = None


@router.get("/watchlist")
async def watchlist():
    """Return the user's pinned FXCM watchlist enriched with live FCLite
    offers (bid/ask/display_name) — same shape as the old hardcoded
    DEFAULT_WATCHLIST endpoint, so callers don't change.
    """
    wl_id = await _resolve_watchlist_id()
    try:
        wl = await _endpoints_request("GET", f"/watchlist/id/{wl_id}")
    except HTTPException as e:
        if e.status_code == 404:
            _reset_watchlist_id()
            wl_id = await _resolve_watchlist_id()
            wl = await _endpoints_request("GET", f"/watchlist/id/{wl_id}")
        else:
            raise
    offer_ids = wl.get("offerIds") or []
    if not offer_ids:
        return []

    id_to_sym, _ = await _offer_map()
    symbols = [id_to_sym.get(int(oid)) for oid in offer_ids]
    symbols = [s for s in symbols if s]
    if not symbols:
        return []

    # Keep bridge subscription state in sync: subscribe new IDs, unsubscribe removed ones.
    # _last_subscribed_offer_ids is the snapshot of what Python last told the bridge;
    # the bridge guards unsubscribe against open positions/orders on its own.
    global _last_subscribed_offer_ids
    current_ids = frozenset(int(oid) for oid in offer_ids)
    new_ids = current_ids - _last_subscribed_offer_ids
    removed_ids = _last_subscribed_offer_ids - current_ids
    if new_ids:
        asyncio.create_task(_post("/subscribe", {"offer_ids": [str(i) for i in new_ids]}))
    if removed_ids:
        asyncio.create_task(_post("/unsubscribe", {"offer_ids": [str(i) for i in removed_ids]}))
    _last_subscribed_offer_ids = current_ids

    # Enrich with live bid/ask from the FCLite offers list.
    # Some instruments (indices, commodities) return instrument=null from the
    # bridge because instrumentsMgr.getInstrumentByOfferId() only resolves
    # fully-subscribed instruments. Patch those rows using the offer_id →
    # symbol map we already have so they still appear in the watchlist.
    offers = await _get("/prices")
    if not isinstance(offers, list):
        return []
    enriched = []
    for row in offers:
        if not isinstance(row, dict):
            continue
        if not row.get("instrument"):
            sym = id_to_sym.get(int(row["offer_id"])) if row.get("offer_id") else None
            if sym:
                row = {**row, "instrument": sym}
        enriched.append(row)
    by_inst = {row.get("instrument"): row for row in enriched if isinstance(row, dict)}
    rows = [by_inst.get(s) for s in symbols]
    return [r for r in rows if r]


async def _put_offer_ids(wl_id: str, new_offer_ids: list[int]) -> None:
    """Full-update the pinned watchlist with a new offerIds list.

    The Watchlist API spec doc lists `PATCH ?mode=ADD|REMOVE|REPLACE` for
    partial mutations, but the live FXCM demo backend rejects PATCH with
    "Request method 'PATCH' not supported" — app.fxcm.com itself uses
    full PUTs with the complete offerIds list (read-modify-write). We
    do the same.
    """
    # Pull current shape — we have to preserve name / shared / sortOrder
    # since PUT is a full-document replace per the WatchlistInput schema.
    current = await _endpoints_request("GET", f"/watchlist/id/{wl_id}")
    if not isinstance(current, dict):
        raise HTTPException(502, "FXCM watchlist GET returned unexpected shape")
    body = {
        "name":      current.get("name") or "Trading Platform",
        "offerIds":  new_offer_ids,
        "shared":    bool(current.get("shared", False)),
        "sortOrder": int(current.get("sortOrder") or time.time() * 1000),
    }
    await _endpoints_request("PUT", f"/watchlist/id/{wl_id}", json=body)


@router.post("/watchlist")
async def watchlist_add(req: WatchlistAddRequest):
    """Add an instrument to the user's watchlist by symbol."""
    _, sym_to_id = await _offer_map()
    offer_id = sym_to_id.get(req.instrument)
    if offer_id is None:
        # Map may be stale if a new instrument was just added by FXCM.
        await _refresh_offer_map()
        offer_id = _offer_map_by_symbol.get(req.instrument)
    if offer_id is None:
        raise HTTPException(404, f"Unknown FXCM instrument: {req.instrument}")

    wl_id = await _resolve_watchlist_id()
    current = await _endpoints_request("GET", f"/watchlist/id/{wl_id}")
    existing = [int(o) for o in (current.get("offerIds") or [])]
    if offer_id not in existing:
        existing.append(offer_id)
        await _put_offer_ids(wl_id, existing)
    # Return the updated enriched view so the client doesn't need a
    # second round-trip.
    return await watchlist()


@router.delete("/watchlist/{instrument:path}")
async def watchlist_remove(instrument: str):
    """Remove an instrument from the user's watchlist by symbol."""
    _, sym_to_id = await _offer_map()
    offer_id = sym_to_id.get(instrument)
    if offer_id is None:
        raise HTTPException(404, f"Unknown FXCM instrument: {instrument}")

    wl_id = await _resolve_watchlist_id()
    current = await _endpoints_request("GET", f"/watchlist/id/{wl_id}")
    existing = [int(o) for o in (current.get("offerIds") or [])]
    new_ids = [o for o in existing if o != offer_id]
    if new_ids != existing:
        await _put_offer_ids(wl_id, new_ids)
    return await watchlist()
