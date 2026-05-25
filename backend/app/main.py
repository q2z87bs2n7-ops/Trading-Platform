import asyncio
import os
import time
from pathlib import Path

from alpaca.common.exceptions import APIError
from fastapi import Depends, FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse

from . import alpaca
from . import calendar_fmp
from . import db
from . import indices as market_indices
from . import market_news
from . import stream as quote_stream
from .ai import router as ai_router
from .config import get_settings
from .schemas import (
    AssetOut,
    CancelledOrders,
    OrderOut,
    PnlHistoryOut,
    PositionOut,
    PositionsOut,
    ReplaceOrderRequest,
    SubmitOrderRequest,
    WatchlistSymbol,
)

def _read_version() -> str:
    """VERSION lives at the repo root. Resolve it across layouts — the local
    tree and Vercel keep ``backend/app/main.py`` three levels under the file;
    the Render image flattens to ``/app/app`` with VERSION copied to ``/app``.
    Fall back to an env var / sentinel so a missing file never crashes startup
    (the relay must boot even if the version can't be read)."""
    here = Path(__file__).resolve()
    for candidate in (
        here.parent.parent.parent / "VERSION",  # repo root (local dev, Vercel)
        here.parent.parent / "VERSION",          # /app in the container image
    ):
        try:
            return candidate.read_text(encoding="utf-8").strip()
        except OSError:
            continue
    return os.environ.get("APP_VERSION", "0.0.0")


_version = _read_version()
app = FastAPI(title="Trading Platform API", version=_version)

app.add_middleware(
    CORSMiddleware,
    allow_origins=get_settings().origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(ai_router.router)


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


@app.get("/api/status")
def status() -> dict:
    """Lightweight client poll: app version + maintenance switch. Fails open —
    a DB blip must never strand everyone on the maintenance page."""
    maintenance, message = False, ""
    if db.db_enabled():
        try:
            maintenance, message = db.get_maintenance()
        except db.DbUnavailable:
            pass
    return {"version": _version, "maintenance": maintenance, "message": message}


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
    "/api/positions/{symbol:path}",
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


@app.get(
    "/api/pnl-history",
    dependencies=[Depends(require_configured)],
    response_model=PnlHistoryOut,
)
def pnl_history(
    asset_class: str = Query("stocks"),
    period: str = Query("ALL"),
) -> dict:
    return alpaca.get_pnl_history(asset_class, period)


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


@app.get("/api/assets/{symbol:path}", dependencies=[Depends(require_configured)])
def asset(symbol: str) -> dict:
    # Static identity/enrichment from the catalogue (clean enum values, sector,
    # logo). Fall back to Alpaca for symbols not yet seeded or when the DB is
    # unconfigured. Live price/bars/quotes are never sourced here.
    if db.db_enabled():
        try:
            row = db.get_asset(symbol)
            if row is not None:
                return row
        except db.DbUnavailable:
            pass
    return alpaca.get_asset(symbol)


@app.get("/api/asset-profile/{symbol:path}", dependencies=[Depends(require_configured)])
def asset_profile(symbol: str) -> dict:
    # Full catalogue enrichment for one symbol (FMP for stocks, CoinGecko for
    # crypto) — every column, with NULL keys dropped so a stock row never carries
    # empty crypto fields and vice versa. Powers the Workspace Profile widget.
    # Sibling path (not `/api/assets/{symbol}/profile`) to dodge the greedy
    # `:path` capture, mirroring `/api/asset-symbols`. Falls back to Alpaca base
    # identity when the DB is unconfigured or the symbol isn't seeded.
    if db.db_enabled():
        try:
            row = db.get_asset_profile(symbol)
            if row is not None:
                return row
        except db.DbUnavailable:
            pass
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


@app.get("/api/calendar/earnings")
def earnings_calendar(include: str = Query("")) -> dict:
    """Curated whole-market earnings calendar (FMP). No Alpaca keys required.
    `include` is a comma-separated symbol list (the user's positions / orders /
    watchlist) that is always kept regardless of market cap."""
    syms = {s.strip().upper() for s in include.split(",") if s.strip()}
    return {"earnings": calendar_fmp.get_earnings_calendar(syms), "as_of": int(time.time())}


@app.get("/api/calendar/earnings/{symbol}")
def symbol_earnings(symbol: str) -> dict:
    """Recent + upcoming earnings for one ticker (FMP). No Alpaca keys required."""
    return {"symbol": symbol.upper(), "earnings": calendar_fmp.get_symbol_earnings(symbol)}


@app.get("/api/calendar/economic")
def economic_calendar() -> dict:
    """US high/medium-impact macro calendar (FMP). No Alpaca keys required."""
    return {"economic": calendar_fmp.get_economic_calendar(), "as_of": int(time.time())}


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
    asset_class: str = Query("", description="us_equity or crypto"),
    limit: int = Query(25, ge=1, le=100),
) -> list[dict]:
    # Prefer the catalogue (indexed, ranked, enriched). Fall back to Alpaca's
    # full-list substring scan when the DB is unconfigured/unreachable.
    if db.db_enabled():
        try:
            return db.search_assets(search, asset_class, limit)
        except db.DbUnavailable:
            pass
    return alpaca.search_assets(search, limit, asset_class)


# Sibling path, NOT `/api/assets/symbols` — the greedy `/api/assets/{symbol:path}`
# above is defined first and would capture "symbols".
@app.get("/api/asset-symbols")
def asset_symbols() -> dict:
    """Full catalogue symbol universe per asset class (search visibility rule:
    tradable + enriched). Powers the Ask-anything router's ticker validation.
    Empty lists when the DB is unconfigured/unreachable — staleness is harmless
    (a ticker not in the set just routes to the AI)."""
    if db.db_enabled():
        try:
            return {
                "us_equity": db.list_symbols("us_equity"),
                "crypto": db.list_symbols("crypto"),
            }
        except db.DbUnavailable:
            pass
    return {"us_equity": [], "crypto": []}


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
    "/api/positions/{symbol:path}", dependencies=_WRITE_DEPS, response_model=OrderOut
)
def close_position(symbol: str) -> dict:
    return alpaca.close_position(symbol)


@app.delete("/api/positions", dependencies=_WRITE_DEPS)
def close_all_positions() -> dict:
    return alpaca.close_all_positions()


# --- Watchlist (server-side, persisted on the Alpaca paper account). The
# mutating routes carry the write-auth seam like the trade routes. ----------


_CRYPTO_TICKERS = [
    "BTC/USD", "ETH/USD", "SOL/USD", "XRP/USD",
    "DOGE/USD", "AVAX/USD", "LINK/USD", "ADA/USD",
]


@app.get("/api/crypto/tickers", dependencies=[Depends(require_configured)])
def crypto_tickers() -> dict:
    """Live snapshots for major crypto pairs — the crypto equivalent of /api/indices."""
    return {"tickers": alpaca.get_snapshots(_CRYPTO_TICKERS)}


@app.get("/api/watchlist", dependencies=[Depends(require_configured)])
def watchlist(asset_class: str = Query("")) -> dict:
    return alpaca.get_watchlist(alpaca.coerce_silo(asset_class))


@app.post("/api/watchlist", dependencies=_WRITE_DEPS)
def watchlist_add(req: WatchlistSymbol, asset_class: str = Query("")) -> dict:
    return alpaca.add_to_watchlist(req.symbol, alpaca.coerce_silo(asset_class))


@app.delete("/api/watchlist/{symbol:path}", dependencies=_WRITE_DEPS)
def watchlist_remove(symbol: str, asset_class: str = Query("")) -> dict:
    return alpaca.remove_from_watchlist(symbol, alpaca.coerce_silo(asset_class))


@app.post("/api/_dev/seed-assets", dependencies=[Depends(require_configured)])
def seed_assets(force: bool = Query(False), base: bool = Query(True)) -> dict:
    """Populate the assets table from Alpaca + CoinGecko. One-shot dev tool.
    Re-runs skip already-enriched crypto rows; pass ?force=true to re-enrich all.
    Pass ?base=false to skip the slow Alpaca base upsert and only enrich crypto.
    Vercel will timeout — call via the Render URL:
    curl -X POST https://<render-url>/api/_dev/seed-assets"""
    from .seed import run_seed
    return run_seed(force=force, base=base)


# --- Per-widget refresh routines (background; re-pull already-enriched rows) ---
# Each routine "completes a card": every DB value that widget shows is re-fetched.
# All return immediately and run in a daemon thread on Render. ?include_missing=
# true also onboards rows that card hasn't enriched yet (new instruments).

@app.post("/api/_dev/refresh-profile-stocks", dependencies=[Depends(require_configured)])
def refresh_profile_stocks(include_missing: bool = Query(False)) -> dict:
    """Refresh the **Profile** card's stock fields (FMP /profile) for enriched
    stocks; ?include_missing=true also onboards un-enriched ones. Render-only:
    curl -X POST 'https://<render-url>/api/_dev/refresh-profile-stocks'"""
    from .seed import refresh_profile_stocks as _r
    return _r(include_missing=include_missing)


@app.post("/api/_dev/refresh-profile-crypto", dependencies=[Depends(require_configured)])
def refresh_profile_crypto() -> dict:
    """Refresh the **Profile** card's crypto fields (CoinGecko) for crypto rows.
    Render-only:
    curl -X POST 'https://<render-url>/api/_dev/refresh-profile-crypto'"""
    from .seed import refresh_profile_crypto as _r
    return _r()


@app.post("/api/_dev/refresh-fundamentals", dependencies=[Depends(require_configured)])
def refresh_fundamentals(include_missing: bool = Query(False)) -> dict:
    """Refresh the **Fundamentals** card (FMP statements) for stocks that already
    carry fundamentals; ?include_missing=true also fills gaps. Render-only:
    curl -X POST 'https://<render-url>/api/_dev/refresh-fundamentals'"""
    from .seed import refresh_fundamentals as _r
    return _r(include_missing=include_missing)


@app.post("/api/_dev/refresh-all-stocks", dependencies=[Depends(require_configured)])
def refresh_all_stocks(include_missing: bool = Query(False)) -> dict:
    """Refresh ALL stock enrichment in one background flow — Profile (FMP
    /profile) + Fundamentals (FMP statements); superset of the per-card stock
    routines. ?include_missing=true also onboards new stocks. Render-only:
    curl -X POST 'https://<render-url>/api/_dev/refresh-all-stocks'"""
    from .seed import refresh_all_stocks as _r
    return _r(include_missing=include_missing)


@app.post("/api/_dev/refresh-all-crypto", dependencies=[Depends(require_configured)])
def refresh_all_crypto() -> dict:
    """Refresh ALL crypto enrichment (CoinGecko) in one background flow.
    Render-only:
    curl -X POST 'https://<render-url>/api/_dev/refresh-all-crypto'"""
    from .seed import refresh_all_crypto as _r
    return _r()


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
    # Route to the crypto hub only when every requested symbol is a crypto pair
    # (contains "/"); any equity present sends the whole batch to the stock hub.
    # Each hub holds its own Alpaca WebSocket, so callers must send homogeneous
    # batches — a mixed batch silently leaves the crypto symbols unsubscribed.
    # The frontend always streams one silo at a time, so batches are homogeneous.
    all_crypto = bool(syms) and all("/" in s for s in syms)
    hub = quote_stream.crypto_hub if all_crypto else quote_stream.hub
    queue = await hub.subscribe(syms, valid_ks)  # type: ignore[arg-type]

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
                    # Named event (not a comment) so HTTP/2 proxies see a real
                    # DATA frame and reset their stream idle timer. The browser
                    # ignores it — EventSource only fires onmessage for unnamed
                    # events; named 'keepalive' events have no registered listener.
                    yield "event: keepalive\ndata: {}\n\n"
        finally:
            hub.unsubscribe(queue)

    return StreamingResponse(
        events(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
