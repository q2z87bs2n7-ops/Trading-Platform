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

from alpaca.data.enums import DataFeed
from alpaca.data.live import StockDataStream

from .config import get_settings

log = logging.getLogger("quotehub")

_MAX_BACKOFF = 30.0


def _feed() -> DataFeed:
    return DataFeed.SIP if get_settings().alpaca_data_feed.lower() == "sip" else DataFeed.IEX


def _normalize(q: Any) -> dict:
    bid = float(q.bid_price or 0)
    ask = float(q.ask_price or 0)
    mid = round((bid + ask) / 2, 4) if bid and ask else (ask or bid)
    return {
        "symbol": q.symbol,
        "bid": bid,
        "ask": ask,
        "mid": mid,
        "time": int(q.timestamp.timestamp()),
    }


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
        the reliable alpaca-py path), run it until the symbol set changes or
        it fails. Returns True on a clean symbol-change rebuild, False on
        failure (caller backs off)."""
        s = get_settings()
        stream = StockDataStream(s.alpaca_api_key, s.alpaca_secret_key, feed=_feed())
        stream.subscribe_quotes(self._on_quote, *symbols)
        self._changed.clear()
        run_task = asyncio.create_task(stream._run_forever())
        change_task = asyncio.create_task(self._changed.wait())
        clean = False
        try:
            done, _ = await asyncio.wait(
                {run_task, change_task}, return_when=asyncio.FIRST_COMPLETED
            )
            if change_task in done and run_task not in done:
                clean = True  # symbols changed -> rebuild, not a failure
            else:
                exc = run_task.exception() if not run_task.cancelled() else None
                if exc is not None:
                    log.error("alpaca stream stopped: %r", exc)
        except asyncio.CancelledError:
            raise
        except BaseException:
            log.exception("stream run failed")
        finally:
            for t in (run_task, change_task):
                if not t.done():
                    t.cancel()
                    with suppress(BaseException):
                        await t
            with suppress(BaseException):
                stream.stop()
        return clean

    async def _on_quote(self, q: Any) -> None:
        try:
            quote = _normalize(q)
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
