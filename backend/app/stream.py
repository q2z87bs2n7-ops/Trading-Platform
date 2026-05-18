"""One shared Alpaca quote stream, fanned out to browser SSE clients.

Alpaca's market-data WebSocket allows only a small number of concurrent
connections per account, so the backend keeps exactly one upstream stream
and relays normalized quotes to every connected browser via Server-Sent
Events. This only works on a persistent host (uvicorn / Docker); Vercel's
serverless functions cannot hold the connection open, in which case the
frontend transparently falls back to polling ``/api/quotes``.
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
    """Lazily starts the upstream Alpaca stream on the first subscriber and
    broadcasts every quote to all connected SSE clients."""

    def __init__(self) -> None:
        self._clients: set[asyncio.Queue[str]] = set()
        self._latest: dict[str, dict] = {}
        self._stream: StockDataStream | None = None
        self._task: asyncio.Task | None = None
        self._lock = asyncio.Lock()

    async def _ensure_started(self) -> None:
        async with self._lock:
            if self._task and not self._task.done():
                return
            s = get_settings()
            stream = StockDataStream(s.alpaca_api_key, s.alpaca_secret_key, feed=_feed())
            stream.subscribe_quotes(self._on_quote, *s.symbols)
            self._stream = stream
            # ``_run_forever`` is alpaca-py's coroutine entrypoint; the public
            # ``.run()`` wraps it in ``asyncio.run()``, which we cannot use
            # from inside the already-running server event loop.
            self._task = asyncio.create_task(stream._run_forever())

    async def _on_quote(self, q: Any) -> None:
        quote = _normalize(q)
        self._latest[quote["symbol"]] = quote
        payload = json.dumps(quote)
        for queue in list(self._clients):
            with suppress(asyncio.QueueFull):
                queue.put_nowait(payload)

    async def subscribe(self) -> asyncio.Queue[str]:
        await self._ensure_started()
        queue: asyncio.Queue[str] = asyncio.Queue(maxsize=100)
        # Prime the new client with the last-known quote per symbol so it
        # renders immediately instead of waiting for the next tick.
        for quote in self._latest.values():
            with suppress(asyncio.QueueFull):
                queue.put_nowait(json.dumps(quote))
        self._clients.add(queue)
        return queue

    def unsubscribe(self, queue: asyncio.Queue[str]) -> None:
        self._clients.discard(queue)


hub = QuoteHub()
