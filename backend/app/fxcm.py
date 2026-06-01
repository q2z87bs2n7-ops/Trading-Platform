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
import json
import logging
import os
import random
import time
from typing import Any, Optional

import httpx
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from .fxcm_auth import ENDPOINTS_TIMEOUT, get_access_token

_log = logging.getLogger(__name__)

# Co-located by default (single-container / local dev). When the bridge runs as
# its own Render service, set FXCM_BRIDGE_URL to its private-network address
# (e.g. http://fxcm-bridge:3001).
BRIDGE_URL = os.getenv("FXCM_BRIDGE_URL", "http://127.0.0.1:3001")
# Split timeout: connect fast so a wedged JVM can't tie up the single uvicorn
# worker that also serves the Alpaca SSE relay; allow a more generous read for
# heavier calls (history bars).
TIMEOUT = httpx.Timeout(connect=2.0, read=10.0, write=10.0, pool=2.0)

# One pooled, keep-alive client for every bridge call. Re-creating an
# AsyncClient per request opened a fresh localhost TCP connection each time —
# at the SSE hub's poll cadence that churned several conns/sec on the shared
# relay worker. Reuse one connection instead. Lazily created so it binds to the
# running uvicorn loop.
_bridge_client: Optional[httpx.AsyncClient] = None


def _bridge() -> httpx.AsyncClient:
    global _bridge_client
    if _bridge_client is None:
        _bridge_client = httpx.AsyncClient(
            base_url=BRIDGE_URL,
            timeout=TIMEOUT,
            limits=httpx.Limits(max_keepalive_connections=8, max_connections=16),
        )
    return _bridge_client

# FXCM Endpoints-suite gateway (demo). Live env would be
# endpoints.fxcorporate.com (no -demo).
_ENDPOINTS_BASE = "https://endpoints-demo.fxcorporate.com"

router = APIRouter(prefix="/api/fxcm", tags=["fxcm"])


# ── helpers ───────────────────────────────────────────────────────────────────

def _bridge_error_detail(resp: httpx.Response) -> str:
    """Unwrap the bridge's error body into a clean message for HTTPException.detail.

    The bridge returns failures as ``{"error": "<FXCM reason>"}`` (e.g. an order
    rejected for insufficient margin / market closed). Without unwrapping, the
    relay forwarded the raw JSON string as ``detail`` and the frontend toast
    showed the whole ``{"error":"..."}`` blob, so it was never clear *why* an
    order failed. Pull the inner message out; fall back to the raw text."""
    try:
        body = resp.json()
        if isinstance(body, dict):
            msg = body.get("error") or body.get("detail") or body.get("message")
            if msg:
                return str(msg)
    except Exception:
        pass
    return resp.text


async def _get(path: str, params: dict = None) -> Any:
    try:
        r = await _bridge().get(path, params=params)
        r.raise_for_status()
        return r.json()
    except (httpx.ConnectError, httpx.TimeoutException):
        raise HTTPException(503, "FXCM bridge not running")
    except httpx.HTTPStatusError as e:
        raise HTTPException(e.response.status_code, _bridge_error_detail(e.response))


async def _post(path: str, body: dict) -> Any:
    try:
        r = await _bridge().post(path, json=body)
        r.raise_for_status()
        return r.json()
    except (httpx.ConnectError, httpx.TimeoutException):
        raise HTTPException(503, "FXCM bridge not running")
    except httpx.HTTPStatusError as e:
        raise HTTPException(e.response.status_code, _bridge_error_detail(e.response))


async def _delete(path: str) -> Any:
    try:
        r = await _bridge().delete(path)
        r.raise_for_status()
        return r.json()
    except (httpx.ConnectError, httpx.TimeoutException):
        raise HTTPException(503, "FXCM bridge not running")
    except httpx.HTTPStatusError as e:
        raise HTTPException(e.response.status_code, _bridge_error_detail(e.response))


async def _patch(path: str, body: dict) -> Any:
    try:
        r = await _bridge().patch(path, json=body)
        r.raise_for_status()
        return r.json()
    except (httpx.ConnectError, httpx.TimeoutException):
        raise HTTPException(503, "FXCM bridge not running")
    except httpx.HTTPStatusError as e:
        raise HTTPException(e.response.status_code, _bridge_error_detail(e.response))


# ── Live price stream (SSE) ─────────────────────────────────────────────────────
# A QuoteHub-style fan-out for the FXCM price feed, scoped to Scalp mode + the
# alert engine. One shared upstream — a tight localhost poll of the bridge's
# in-memory /prices/live (push-maintained, no snapshot round-trip) — feeds
# per-client bounded queues (drop-oldest). New clients get a replay of the last
# known prices so they paint immediately. The upstream task only runs while at
# least one client is connected; it never crashes the process (all failures are
# caught and retried with a short backoff). Render-only: Vercel can't hold SSE
# open, so the frontend hits this via STREAM_BASE. Bridge offline → the loop
# backs off and clients simply receive no ticks (their polling fallback covers).

_STREAM_POLL_SEC = 0.2          # localhost map read; ~5fps tile cadence (smooth for dealing tiles, half the bridge round-trips of 10fps)
_STREAM_BACKOFF_MAX_SEC = 5.0
_STREAM_KEEPALIVE_SEC = 15.0    # SSE comment so idle proxies don't cull the conn


class FxcmPriceHub:
    def __init__(self) -> None:
        self._clients: set[asyncio.Queue] = set()
        self._latest: dict[str, dict] = {}     # instrument -> last emitted row
        self._task: Optional[asyncio.Task] = None

    async def subscribe(self) -> asyncio.Queue:
        q: asyncio.Queue = asyncio.Queue(maxsize=100)
        self._clients.add(q)
        if self._latest:
            try:
                q.put_nowait(list(self._latest.values()))
            except asyncio.QueueFull:
                pass
        self._ensure_task()
        return q

    def unsubscribe(self, q: asyncio.Queue) -> None:
        self._clients.discard(q)

    def _ensure_task(self) -> None:
        if self._task is None or self._task.done():
            self._task = asyncio.create_task(self._run())

    async def _run(self) -> None:
        backoff = _STREAM_POLL_SEC
        while self._clients:
            try:
                rows = await _get("/prices/live")
                backoff = _STREAM_POLL_SEC
                changed = self._diff(rows)
                if changed:
                    self._broadcast(changed)
                await asyncio.sleep(_STREAM_POLL_SEC)
            except HTTPException:
                # Bridge offline / 503 — back off; clients ride their poll fallback.
                await asyncio.sleep(backoff)
                backoff = min(backoff * 2, _STREAM_BACKOFF_MAX_SEC)
            except Exception:
                _log.exception("fxcm price hub upstream error")
                await asyncio.sleep(backoff)
                backoff = min(backoff * 2, _STREAM_BACKOFF_MAX_SEC)
        self._task = None

    def _diff(self, rows: Any) -> list[dict]:
        if not isinstance(rows, list):
            return []
        changed: list[dict] = []
        for row in rows:
            if not isinstance(row, dict):
                continue
            inst = row.get("instrument")
            if not inst and row.get("offer_id"):
                # Not-fully-resolved offer — patch the symbol from the cached map.
                try:
                    inst = _offer_map_by_id.get(int(row["offer_id"]))
                except (TypeError, ValueError):
                    inst = None
                if inst:
                    row = {**row, "instrument": inst}
            if not inst:
                continue
            prev = self._latest.get(inst)
            if prev is None or prev.get("bid") != row.get("bid") or prev.get("ask") != row.get("ask"):
                self._latest[inst] = row
                changed.append(row)
        return changed

    def _broadcast(self, rows: list[dict]) -> None:
        dead: list[asyncio.Queue] = []
        for q in self._clients:
            try:
                q.put_nowait(rows)
            except asyncio.QueueFull:
                # Drop-oldest: a slow client never stalls the upstream.
                try:
                    q.get_nowait()
                    q.put_nowait(rows)
                except Exception:
                    dead.append(q)
        for q in dead:
            self._clients.discard(q)


_price_hub = FxcmPriceHub()


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


class StopLimitRequest(BaseModel):
    # Attach/update SL (stop) and/or TP (limit) on an open position. 0 = skip leg.
    trade_id: str
    stop: float = 0
    limit: float = 0


class ChangeOrderRequest(BaseModel):
    # Any subset; missing fields = 0 = bridge leaves that field unchanged.
    rate: float = 0
    stop: float = 0
    limit: float = 0


# ── Routes ─────────────────────────────────────────────────────────────────────

@router.get("/health")
async def health():
    return await _get("/health")


@router.get("/diag")
async def diag():
    """Temporary streaming diagnostics — proxies the bridge's /diag (per-offer
    subscription status + push-tick stats + push-cache vs fresh-snapshot bid/ask).
    Lets us read the truth from the public relay since the bridge is private."""
    return await _get("/diag")


@router.get("/account")
async def account():
    return await _get("/account")


@router.get("/prices")
async def prices(instrument: str = None):
    params = {"instrument": instrument} if instrument else None
    return await _get("/prices", params=params)


@router.get("/stream")
async def price_stream():
    """SSE feed of live FXCM prices (Scalp mode + alert engine).

    Each ``data:`` frame is a JSON array of changed instrument rows (same shape
    as /prices). The frontend merges them into its price map. Receive-only —
    the subscribed (status-T) set is driven by the watchlist/view subscription
    logic, not by this connection. Falls back to polling on the client when the
    stream can't be held open (e.g. pointed at the serverless API base).
    """
    q = await _price_hub.subscribe()

    async def gen():
        try:
            yield ": connected\n\n"
            while True:
                try:
                    rows = await asyncio.wait_for(q.get(), timeout=_STREAM_KEEPALIVE_SEC)
                    yield f"data: {json.dumps(rows)}\n\n"
                except asyncio.TimeoutError:
                    yield ": ping\n\n"
        finally:
            _price_hub.unsubscribe(q)

    return StreamingResponse(
        gen(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",  # disable proxy buffering so frames flush
        },
    )


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
    """Search FXCM instruments (assets WHERE source='fxcm') by name, display name, or alternatives."""
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


@router.post("/stop-limit")
async def set_stop_limit(req: StopLimitRequest):
    """Attach/update SL+TP on an open position (Scalp Risk bracket)."""
    return await _post("/stop-limit", req.dict())


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
        global _watchlist_offer_ids
        _watchlist_offer_ids = frozenset(int(oid) for oid in offer_ids)
        _reconcile_subscriptions(cleanup=False)
        _log.info(
            "fxcm boot subscribe: pushed %d watchlist offer IDs to bridge",
            len(_watchlist_offer_ids),
        )
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


class ViewRequest(BaseModel):
    # Symbols the frontend is currently displaying (charts, ticket, quotes).
    instruments: list[str] = []


# Module-level cache. Single-user app — no per-user scoping needed.
_watchlist_id: Optional[str] = None
_watchlist_id_lock = asyncio.Lock()

# ── Subscription lifecycle (T/D) ────────────────────────────────────────────
# The bridge keeps an instrument status T (priced / in view) while subscribed
# and D otherwise; open positions/orders are always T (the bridge guards those
# on unsubscribe). The *desired* subscription set is driven by two sources:
#   _watchlist_offer_ids — the user's pinned watchlist (refreshed on watchlist GET)
#   _view_offer_ids       — instruments the frontend is currently displaying
#                           (POST /view), so charts / tickets / quotes get T.
# _subscribed_snapshot is what we've actually pushed to the bridge. Subscribing
# newly-needed IDs happens immediately; returning stale IDs to D ("cleanup") is
# sporadic to avoid subscribe/unsubscribe thrash as the user clicks around — the
# watchlist poll also reconciles fully each cycle.
_watchlist_offer_ids: frozenset[int] = frozenset()
_view_offer_ids: frozenset[int] = frozenset()
_subscribed_snapshot: frozenset[int] = frozenset()
_VIEW_CLEANUP_PROB = 0.15

# Last bridge boot id we reconciled against. The bridge restarts independently
# of the relay (separate Render services); when it does it loses every
# subscription except positions/orders, but our _subscribed_snapshot still
# claims we pushed the full set, so the next reconcile computes no new IDs and
# the watchlist instruments silently never get re-subscribed (→ stale tiles for
# everything except open positions). Detecting a boot_id change and clearing the
# snapshot forces a full re-push on the next reconcile.
_bridge_boot_id: Optional[int] = None


async def _check_bridge_restart() -> None:
    """Reset the subscription snapshot if the bridge reports a new boot id."""
    global _bridge_boot_id, _subscribed_snapshot
    try:
        health = await _get("/health")
    except HTTPException:
        return  # bridge down — nothing to reconcile against yet
    boot = health.get("boot_id") if isinstance(health, dict) else None
    if boot is None:
        return
    if _bridge_boot_id is None:
        _bridge_boot_id = boot
        return
    if boot != _bridge_boot_id:
        _log.info("fxcm bridge restart detected (boot_id %s→%s) — re-subscribing", _bridge_boot_id, boot)
        _bridge_boot_id = boot
        _subscribed_snapshot = frozenset()


def _reconcile_subscriptions(*, cleanup: bool) -> None:
    """Push the desired subscription set (watchlist ∪ active view) to the bridge.
    Subscribe newly-needed offer IDs always; unsubscribe stale ones only on a
    cleanup pass."""
    asyncio.create_task(_reconcile_subscriptions_async(cleanup=cleanup))


async def _reconcile_subscriptions_async(*, cleanup: bool) -> None:
    """Only mark IDs subscribed *after* the bridge confirms the POST. The old
    code optimistically added new_ids to _subscribed_snapshot before the
    fire-and-forget POST ran — so a single dropped /subscribe (bridge mid-
    restart / transient 503, common during redeploys) left the snapshot claiming
    those IDs were subscribed when they weren't, and the next reconcile computed
    no new IDs and never retried → instruments stuck unsubscribed (gray tiles)
    until an unrelated restart. Awaiting + only committing on success makes a
    failed push self-heal on the next ~3s poll."""
    global _subscribed_snapshot
    desired = _watchlist_offer_ids | _view_offer_ids
    new_ids = desired - _subscribed_snapshot
    if new_ids:
        try:
            await _post("/subscribe", {"offer_ids": [str(i) for i in new_ids]})
            _subscribed_snapshot = _subscribed_snapshot | new_ids
        except HTTPException:
            pass  # leave snapshot unchanged → retried next reconcile
    if cleanup:
        stale = _subscribed_snapshot - desired
        if stale:
            try:
                await _post("/unsubscribe", {"offer_ids": [str(i) for i in stale]})
                _subscribed_snapshot = _subscribed_snapshot - stale
            except HTTPException:
                pass

# offerId ↔ symbol map cached from the FCLite bridge's /instruments
# endpoint. Refreshed on cache miss + every hour.
_offer_map_by_id:     dict[int, str] = {}
_offer_map_by_symbol: dict[str, int] = {}
_offer_map_loaded_at: float = 0
_OFFER_MAP_TTL_SEC = 3600


# Pooled keep-alive client for the remote Endpoints-suite gateway — reuses the
# TLS connection across the 3s watchlist poll instead of a fresh handshake each
# call. Lazily created so it binds to the running uvicorn loop. Uses the shared
# ENDPOINTS_TIMEOUT (from fxcm_auth) — NOT the bridge's TIMEOUT, whose 2s connect
# is for localhost only and would time out a normal remote TLS handshake.
_endpoints_client: Optional[httpx.AsyncClient] = None


def _endpoints() -> httpx.AsyncClient:
    global _endpoints_client
    if _endpoints_client is None:
        _endpoints_client = httpx.AsyncClient(
            base_url=_ENDPOINTS_BASE,
            timeout=ENDPOINTS_TIMEOUT,
            limits=httpx.Limits(max_keepalive_connections=4, max_connections=8),
        )
    return _endpoints_client


async def _endpoints_request(method: str, path: str, **kwargs) -> Any:
    """HTTP call to the Endpoints-suite gateway with a fresh bearer."""
    token = await get_access_token()
    headers = kwargs.pop("headers", {}) or {}
    headers.setdefault("Authorization", f"Bearer {token}")
    headers.setdefault("Origin", "https://app.fxcm.com")
    try:
        r = await _endpoints().request(method, path, headers=headers, **kwargs)
        r.raise_for_status()
        # Some routes (DELETE, PUT /sort) may return an empty body.
        if not r.content:
            return None
        return r.json()
    except (httpx.ConnectError, httpx.TimeoutException) as e:
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

    # Keep bridge subscription state in sync. The watchlist poll (≈3 s) is also
    # the reconcile heartbeat: it refreshes the watchlist half of the desired
    # set and runs a full cleanup (subscribe new, unsubscribe stale) against
    # watchlist ∪ active view. The bridge guards unsubscribe against open
    # positions/orders on its own.
    global _watchlist_offer_ids
    _watchlist_offer_ids = frozenset(int(oid) for oid in offer_ids)
    # Clear the snapshot first if the bridge restarted, so the reconcile below
    # re-pushes every watchlist subscription (not just newly-added ones).
    await _check_bridge_restart()
    _reconcile_subscriptions(cleanup=True)

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
    # Return every pinned instrument in watchlist order. Instruments that aren't
    # actively pricing yet — subscription still warming up after a bridge
    # restart, or the market is closed — still belong in the list, so emit a
    # minimal {offer_id, instrument} row instead of dropping them (the FXCM app
    # greys such rows rather than hiding them). Live bid/ask fills in on the next
    # poll once the bridge prices them.
    out = []
    for oid in offer_ids:
        sym = id_to_sym.get(int(oid))
        if not sym:
            continue
        out.append(by_inst.get(sym) or {"offer_id": int(oid), "instrument": sym})
    return out


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


@router.post("/view")
async def set_view(req: ViewRequest):
    """Report the CFD instruments the frontend is currently displaying.

    New instruments are subscribed immediately (status T → live prices, so a
    just-opened chart / order ticket gets bid/ask + precision/lot metadata).
    Instruments that drop out of the view return to D on a sporadic cleanup
    pass here (and on every watchlist poll); the bridge keeps open
    positions/orders subscribed regardless. Idempotent and best-effort.
    """
    global _view_offer_ids
    _, sym_to_id = await _offer_map()
    ids: set[int] = set()
    missing = False
    for sym in req.instruments:
        oid = sym_to_id.get(sym)
        if oid is None:
            missing = True
        else:
            ids.add(oid)
    # A symbol the map hasn't seen (e.g. just surfaced by FXCM) — refresh once.
    if missing:
        await _refresh_offer_map()
        for sym in req.instruments:
            oid = _offer_map_by_symbol.get(sym)
            if oid is not None:
                ids.add(oid)
    _view_offer_ids = frozenset(ids)
    _reconcile_subscriptions(cleanup=random.random() < _VIEW_CLEANUP_PROB)
    return {"view": len(_view_offer_ids), "subscribed": len(_subscribed_snapshot)}


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
