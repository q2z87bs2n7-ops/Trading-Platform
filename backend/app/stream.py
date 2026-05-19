"""One shared, supervised Alpaca quote stream, fanned out to SSE clients.

Alpaca's market-data WebSocket allows only a single concurrent
connection per account, so the backend keeps exactly one upstream
stream, owned by one supervisor task. The supervisor subscribes the
union of every connected client's symbols *before* starting the stream
(the reliable alpaca-py path), rebuilds when that set changes, and
isolates every failure with exponential backoff so a streaming error
can never crash or restart the web process. Each client receives only
the symbols it asked for. Requires a persistent host; on serverless the
frontend falls back to polling ``/api/quotes``.
"""

from __future__ import annotations

import asyncio
import json
import logging
from contextlib import suppress
from typing import Any

from alpaca.data.live import StockDataStream

from .alpaca.client import _feed
from .alpaca.market_data import normalize_quote
from .config import get_settings

log = logging.getLogger("quotehub")

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
    """Single supervised upstream stream; per-client fan-out by symbol."""

    def __init__(self) -> None:
        self._clients: dict[asyncio.Queue[str], set[str]] = {}
        self._counts: dict[str, int] = {}
        self._latest: dict[str, dict] = {}
        self._supervisor: asyncio.Task | None = None
        self._changed = asyncio.Event()

    # --- client registration ------------------------------------------------

    async def subscribe(self, symbols: list[str]) -> asyncio.Queue[str]:
        wanted = {s.strip().upper() for s in symbols if s and s.strip()}
        queue: asyncio.Queue[str] = asyncio.Queue(maxsize=100)
        for sym in wanted:
            self._counts[sym] = self._counts.get(sym, 0) + 1
        self._clients[queue] = wanted
        for sym in wanted:
            q = self._latest.get(sym)
            if q is not None:
                with suppress(asyncio.QueueFull):
                    queue.put_nowait(json.dumps(q))
        if self._supervisor is None or self._supervisor.done():
            self._supervisor = asyncio.create_task(self._supervise())
        self._changed.set()
        return queue

    def unsubscribe(self, queue: asyncio.Queue[str]) -> None:
        wanted = self._clients.pop(queue, None)
        if not wanted:
            return
        for sym in wanted:
            n = self._counts.get(sym, 0) - 1
            if n <= 0:
                self._counts.pop(sym, None)
            else:
                self._counts[sym] = n
        self._changed.set()

    # --- upstream supervision ----------------------------------------------

    def _desired(self) -> set[str]:
        return set(self._counts)

    async def _supervise(self) -> None:
        """Owns the single upstream stream for the process lifetime. Every
        failure is caught and retried with backoff; nothing here is allowed
        to propagate and take down the worker."""
        backoff = 1.0
        while True:
            try:
                symbols = self._desired()
                if not symbols:
                    self._changed.clear()
                    await self._changed.wait()
                    continue
                ok = await self._run_once(symbols)
                backoff = 1.0 if ok else min(backoff * 2, _MAX_BACKOFF)
                if not ok:
                    log.warning("upstream stream ended; retrying in %.0fs", backoff)
                    await asyncio.sleep(backoff)
            except asyncio.CancelledError:
                raise
            except BaseException:  # never let the supervisor die
                log.exception("supervisor iteration failed")
                await asyncio.sleep(min(backoff, _MAX_BACKOFF))

    async def _run_once(self, symbols: set[str]) -> bool:
        """Build a fresh stream subscribed to ``symbols`` (before running --
        the reliable alpaca-py path) and run it until the *desired* symbol
        set actually changes or it fails. A new client wanting symbols we
        already stream wakes ``_changed`` but must NOT rebuild -- needless
        upstream reconnects trip Alpaca's single-connection limit. Returns
        True on a real symbol-set change (rebuild), False on failure
        (caller backs off)."""
        s = get_settings()
        stream = StockDataStream(s.alpaca_api_key, s.alpaca_secret_key, feed=_feed())
        stream.subscribe_quotes(self._on_quote, *symbols)
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
                if self._desired() != symbols:
                    clean = True
                    break
        except asyncio.CancelledError:
            raise
        except BaseException:
            log.exception("stream run failed")
        finally:
            await self._shutdown(stream, run_task)
        return clean

    async def _shutdown(self, stream: StockDataStream, run_task: asyncio.Task) -> None:
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

    async def _on_quote(self, q: Any) -> None:
        try:
            quote = normalize_quote(q.symbol, q)
        except Exception:
            log.exception("failed to normalize quote")
            return
        sym = quote["symbol"]
        self._latest[sym] = quote
        payload = json.dumps(quote)
        for queue, wanted in list(self._clients.items()):
            if sym in wanted:
                with suppress(asyncio.QueueFull):
                    queue.put_nowait(payload)


hub = QuoteHub()
