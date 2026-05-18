"""One shared Alpaca quote stream, fanned out to browser SSE clients.

Alpaca's market-data WebSocket allows only a small number of concurrent
connections per account, so the backend keeps exactly one upstream stream.
The subscribed symbol set is the live union of every connected client's
request; each client receives only the symbols it asked for. This only
works on a persistent host (uvicorn / Docker); Vercel's serverless
functions cannot hold the connection open, in which case the frontend
transparently falls back to polling ``/api/quotes``.
"""

from __future__ import annotations

import asyncio
import json
from contextlib import suppress
from typing import Any

from alpaca.data.enums import DataFeed
from alpaca.data.live import StockDataStream

from .config import get_settings


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
    """Lazily starts the upstream Alpaca stream and keeps the subscribed
    symbol set as the live union of every connected client's request.
    Each client's queue receives only the symbols it subscribed to."""

    def __init__(self) -> None:
        self._clients: dict[asyncio.Queue[str], set[str]] = {}
        self._counts: dict[str, int] = {}
        self._latest: dict[str, dict] = {}
        self._stream: StockDataStream | None = None
        self._task: asyncio.Task | None = None
        self._lock = asyncio.Lock()

    async def _ensure_started(self) -> None:
        async with self._lock:
            if self._task and not self._task.done():
                return
            s = get_settings()
            self._stream = StockDataStream(
                s.alpaca_api_key, s.alpaca_secret_key, feed=_feed()
            )
            # ``_run_forever`` is alpaca-py's coroutine entrypoint; the public
            # ``.run()`` wraps it in ``asyncio.run()``, which we cannot use
            # from inside the already-running server event loop. Symbols are
            # subscribed dynamically as clients connect.
            self._task = asyncio.create_task(self._stream._run_forever())

    async def subscribe(self, symbols: list[str]) -> asyncio.Queue[str]:
        await self._ensure_started()
        wanted = {s.strip().upper() for s in symbols if s and s.strip()}
        queue: asyncio.Queue[str] = asyncio.Queue(maxsize=100)
        async with self._lock:
            to_add = [sym for sym in wanted if self._counts.get(sym, 0) == 0]
            for sym in wanted:
                self._counts[sym] = self._counts.get(sym, 0) + 1
            self._clients[queue] = wanted
            # Prime with the last-known quote for this client's symbols so it
            # renders immediately instead of waiting for the next tick.
            for sym in wanted:
                quote = self._latest.get(sym)
                if quote is not None:
                    with suppress(asyncio.QueueFull):
                        queue.put_nowait(json.dumps(quote))
            if to_add and self._stream is not None:
                self._stream.subscribe_quotes(self._on_quote, *to_add)
        return queue

    def unsubscribe(self, queue: asyncio.Queue[str]) -> None:
        # Synchronous and await-free: called from the SSE generator's
        # ``finally`` on the server loop, so it cannot interleave with
        # ``subscribe``'s locked section (the loop only switches at awaits).
        wanted = self._clients.pop(queue, None)
        if not wanted:
            return
        to_remove: list[str] = []
        for sym in wanted:
            n = self._counts.get(sym, 0) - 1
            if n <= 0:
                self._counts.pop(sym, None)
                to_remove.append(sym)
            else:
                self._counts[sym] = n
        if to_remove and self._stream is not None:
            self._stream.unsubscribe_quotes(*to_remove)

    async def _on_quote(self, q: Any) -> None:
        quote = _normalize(q)
        sym = quote["symbol"]
        self._latest[sym] = quote
        payload = json.dumps(quote)
        for queue, wanted in list(self._clients.items()):
            if sym in wanted:
                with suppress(asyncio.QueueFull):
                    queue.put_nowait(payload)


hub = QuoteHub()
