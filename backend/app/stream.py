"""One shared, supervised Alpaca stream, fanned out to SSE clients.

Alpaca's market-data WebSocket allows only a single concurrent
connection per account, so the backend keeps exactly one upstream
stream, owned by one supervisor task. The supervisor subscribes the
union of every connected client's symbols *before* starting the stream
(the reliable alpaca-py path), rebuilds when that set changes, and
isolates every failure with exponential backoff so a streaming error
can never crash or restart the web process. Each client receives only
the (kind, symbol) pairs it asked for. Requires a persistent host; on
serverless the frontend falls back to polling ``/api/quotes``.

Clients pick the event kinds they want: ``quote`` (live bid/ask) or
``bar`` (real-time 1-minute OHLCV). Both kinds share the same upstream
``StockDataStream`` -- a separate hub per kind would trip Alpaca's
single-connection limit. Events carry a ``kind`` discriminator; the
default endpoint behaviour stays quote-only so existing ``useLiveQuotes``
clients are unaffected.
"""

from __future__ import annotations

import asyncio
import json
import logging
import time
from contextlib import suppress
from typing import Any, Literal

from alpaca.data.live import CryptoDataStream, StockDataStream

from .alpaca.client import _feed
from .alpaca.market_data import normalize_quote
from .config import get_settings

log = logging.getLogger("quotehub")

Kind = Literal["quote", "bar"]
_KINDS: tuple[Kind, ...] = ("quote", "bar")

_MAX_BACKOFF = 30.0
# Clean-teardown budget: stop_ws() tells _consume to close the socket and
# _run_forever to return; _consume only polls the stop queue every recv
# timeout (~5s), so wait a little longer before forcing a cancel.
_STOP_TIMEOUT = 8.0
# Give Alpaca a moment to release its single per-account market-data socket
# before opening the next one, else the rebuild hits "connection limit
# exceeded" and the stream never recovers.
_RECONNECT_SETTLE = 1.0


class QuoteHub:
    """Single supervised upstream stream; per-client fan-out by (kind, symbol)."""

    def __init__(self) -> None:
        # Per-client subscription: (symbols, kinds).
        self._clients: dict[asyncio.Queue[str], tuple[set[str], set[Kind]]] = {}
        # Refcounts keyed by (kind, symbol) -- determines what we subscribe
        # to upstream and when to drop a subscription.
        self._counts: dict[tuple[Kind, str], int] = {}
        # Most recent event per (kind, symbol) for replay on new subscribers.
        self._latest: dict[tuple[Kind, str], dict] = {}
        self._supervisor: asyncio.Task | None = None
        self._changed = asyncio.Event()

    # --- client registration ------------------------------------------------

    async def subscribe(
        self, symbols: list[str], kinds: set[Kind] | None = None
    ) -> asyncio.Queue[str]:
        wanted = {s.strip().upper() for s in symbols if s and s.strip()}
        ks: set[Kind] = {k for k in (kinds or set()) if k in _KINDS} or {"quote"}
        queue: asyncio.Queue[str] = asyncio.Queue(maxsize=100)
        for k in ks:
            for sym in wanted:
                self._counts[(k, sym)] = self._counts.get((k, sym), 0) + 1
        self._clients[queue] = (wanted, ks)
        # Replay last known quote per sym so the order ticket doesn't wait
        # for the next tick. We skip bar replays: getBars already seeds TV's
        # historical cache, and a stale bar from a previous session triggers
        # TV's time-order violation when replayed after today's bars are cached.
        for sym in wanted:
            if "quote" in ks:
                ev = self._latest.get(("quote", sym))
                if ev is not None:
                    with suppress(asyncio.QueueFull):
                        queue.put_nowait(json.dumps(ev))
        if self._supervisor is None or self._supervisor.done():
            self._supervisor = asyncio.create_task(self._supervise())
        self._changed.set()
        return queue

    def unsubscribe(self, queue: asyncio.Queue[str]) -> None:
        client = self._clients.pop(queue, None)
        if not client:
            return
        wanted, ks = client
        for k in ks:
            for sym in wanted:
                n = self._counts.get((k, sym), 0) - 1
                if n <= 0:
                    self._counts.pop((k, sym), None)
                else:
                    self._counts[(k, sym)] = n
        self._changed.set()

    # --- upstream supervision ----------------------------------------------

    def _desired(self) -> tuple[set[str], set[str]]:
        q_syms = {s for (k, s) in self._counts if k == "quote"}
        b_syms = {s for (k, s) in self._counts if k == "bar"}
        return q_syms, b_syms

    async def _supervise(self) -> None:
        """Owns the single upstream stream for the process lifetime. Every
        failure is caught and retried with backoff; nothing here is allowed
        to propagate and take down the worker."""
        backoff = 1.0
        while True:
            try:
                q_syms, b_syms = self._desired()
                if not q_syms and not b_syms:
                    self._changed.clear()
                    await self._changed.wait()
                    continue
                ok = await self._run_once(q_syms, b_syms)
                backoff = 1.0 if ok else min(backoff * 2, _MAX_BACKOFF)
                if not ok:
                    log.warning("upstream stream ended; retrying in %.0fs", backoff)
                    await asyncio.sleep(backoff)
            except asyncio.CancelledError:
                raise
            except BaseException:  # never let the supervisor die
                log.exception("supervisor iteration failed")
                await asyncio.sleep(min(backoff, _MAX_BACKOFF))

    def _make_stream(self) -> StockDataStream:
        s = get_settings()
        return StockDataStream(s.alpaca_api_key, s.alpaca_secret_key, feed=_feed())

    async def _run_once(self, q_syms: set[str], b_syms: set[str]) -> bool:
        """Build a fresh stream subscribed to the requested ``q_syms`` /
        ``b_syms`` (before running -- the reliable alpaca-py path) and run
        it until the *desired* sets actually change or it fails. A new
        client wanting symbols we already stream wakes ``_changed`` but
        must NOT rebuild -- needless upstream reconnects trip Alpaca's
        single-connection limit. Returns True on a real set change
        (rebuild), False on failure (caller backs off)."""
        stream = self._make_stream()
        if q_syms:
            stream.subscribe_quotes(self._on_quote, *q_syms)
        if b_syms:
            stream.subscribe_bars(self._on_bar, *b_syms)
        self._changed.clear()
        run_task = asyncio.create_task(stream._run_forever())
        clean = False
        try:
            while True:
                change_task = asyncio.create_task(self._changed.wait())
                done, _ = await asyncio.wait(
                    {run_task, change_task}, return_when=asyncio.FIRST_COMPLETED
                )
                if not change_task.done():
                    change_task.cancel()
                    with suppress(BaseException):
                        await change_task
                if run_task in done:
                    exc = run_task.exception() if not run_task.cancelled() else None
                    if exc is not None:
                        log.error("alpaca stream stopped: %r", exc)
                    break
                # ``_changed`` fired: rebuild only on a real set change.
                self._changed.clear()
                if self._desired() != (q_syms, b_syms):
                    clean = True
                    break
        except asyncio.CancelledError:
            raise
        except BaseException:
            log.exception("stream run failed")
        finally:
            await self._shutdown(stream, run_task)
        return clean

    async def _shutdown(self, stream, run_task: asyncio.Task) -> None:
        """Tear the upstream down cleanly: ``stop_ws`` signals ``_consume``
        to close the socket and ``_run_forever`` to return, so Alpaca frees
        the per-account connection slot. Only force-cancel if it overruns,
        then ensure the socket is closed and let Alpaca settle before the
        next build."""
        with suppress(BaseException):
            await stream.stop_ws()
        if not run_task.done():
            with suppress(BaseException):
                await asyncio.wait({run_task}, timeout=_STOP_TIMEOUT)
        if not run_task.done():
            run_task.cancel()
        with suppress(BaseException):
            await run_task
        with suppress(BaseException):
            await stream.close()
        await asyncio.sleep(_RECONNECT_SETTLE)

    # --- upstream event handlers -------------------------------------------

    def _broadcast(self, kind: Kind, symbol: str, payload: dict) -> None:
        self._latest[(kind, symbol)] = payload
        wire = json.dumps(payload)
        for queue, (wanted, ks) in list(self._clients.items()):
            if kind in ks and symbol in wanted:
                with suppress(asyncio.QueueFull):
                    queue.put_nowait(wire)

    async def _on_quote(self, q: Any) -> None:
        try:
            quote = normalize_quote(q.symbol, q)
        except Exception:
            log.exception("failed to normalize quote")
            return
        quote["kind"] = "quote"
        self._broadcast("quote", quote["symbol"], quote)

    async def _on_bar(self, b: Any) -> None:
        try:
            bar = {
                "kind": "bar",
                "symbol": b.symbol,
                "time": int(b.timestamp.timestamp()),
                "open": float(b.open),
                "high": float(b.high),
                "low": float(b.low),
                "close": float(b.close),
                "volume": float(b.volume),
            }
        except Exception:
            log.exception("failed to normalize bar")
            return
        # Alpaca replays the last completed bar on each stream reconnect.
        # Drop it if it's more than 5 minutes old — only live bars belong
        # in the TV cache; getBars covers history.
        if time.time() - bar["time"] > 300:
            log.debug("dropping stale bar %s t=%s", bar["symbol"], bar["time"])
            return
        self._broadcast("bar", bar["symbol"], bar)


class CryptoQuoteHub(QuoteHub):
    """Like QuoteHub but runs CryptoDataStream (no feed param; crypto data is free)."""

    def _make_stream(self) -> CryptoDataStream:
        s = get_settings()
        return CryptoDataStream(s.alpaca_api_key, s.alpaca_secret_key)


hub = QuoteHub()
crypto_hub = CryptoQuoteHub()
