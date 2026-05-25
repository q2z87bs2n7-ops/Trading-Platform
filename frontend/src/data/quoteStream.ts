/**
 * Shared quote-stream manager. Consumers register their symbols here; the
 * manager keeps a single ref-counted SSE connection for the *union* of all
 * requested symbols. React consumers (`useLiveQuotes`) read ticks from the
 * React Query cache (`qk.quotes`); callback consumers (the TV datafeed's
 * `subscribeQuotes`) get per-symbol ticks via `subscribeQuoteTicks`. Without
 * this, each consumer opened its own EventSource — so a Workspace with several
 * widgets / charts watching the same symbol would multiply connections on the
 * single (process-local) Render relay and could exhaust the browser's
 * ~6-per-host socket budget. Keeps the load-bearing polling fallback and tick
 * buffering from the original hook.
 */

import { getQuotes, pingRelayHealth, streamQuotes } from "../api";
import { setStreamStatus } from "../lib/stream-status";
import type { Quote } from "../types";
import { qk, queryClient } from "./queryClient";

// Fallback is already degraded (stream is down); 60s keeps Vercel edge-request
// usage minimal during dev. Lower this toward more constant polling before any
// live/production use where a fresher degraded path matters.
const POLL_MS = 60000;
// Buffer stream ticks and flush at most this often (mirrors the Watchlist's
// load-bearing constant from CLAUDE.md). Tune, don't remove.
const FLUSH_MS = 500;
// Ping the Render relay every 9 minutes to prevent spindown-triggered fallback.
const KEEPALIVE_MS = 9 * 60 * 1000;
// Coalesce a burst of (un)subscribes — e.g. several widgets mounting in the
// same tick — into one reconnect.
const RECONNECT_DEBOUNCE_MS = 60;
// On an SSE drop we fall back to polling immediately, then try to restore the
// stream on an exponential backoff (3s → 6s → … capped at 60s). A single
// transient close (proxy connection recycling, relay restart, network blip) is
// then self-healing instead of a permanent downgrade to polling. Backoff (not a
// tight loop) avoids hammering a relay that's genuinely down — polling covers
// data meanwhile; the backoff resets once a reopened stream delivers a tick.
const STREAM_RETRY_BASE_MS = 3000;
const STREAM_RETRY_MAX_MS = 60000;

type QuoteMap = Record<string, Quote>;
type TickListener = (q: Quote) => void;

const refCounts = new Map<string, number>();
const tickListeners = new Map<string, Set<TickListener>>();
let currentKey = ""; // sorted, comma-joined union the live transport serves
let stopStream: (() => void) | null = null;
let pollId: number | undefined;
let flushId: number | undefined;
let reconnectId: number | undefined;
let keepaliveId: number | undefined;
let streamRetryId: number | undefined;
let streamBackoff = 0;
let pending: QuoteMap = {};

function unionSymbols(): string[] {
  return Array.from(refCounts.keys()).sort();
}

function merge(qs: Quote[]) {
  if (qs.length === 0) return;
  queryClient.setQueryData<QuoteMap>(qk.quotes, (prev) => {
    const next = { ...(prev ?? {}) };
    for (const q of qs) next[q.symbol] = q;
    return next;
  });
}

function notifyTicks(qs: Quote[]) {
  if (tickListeners.size === 0) return;
  for (const q of qs) {
    const set = tickListeners.get(q.symbol);
    if (set) set.forEach((cb) => cb(q));
  }
}

function ensureFlusher() {
  if (flushId !== undefined) return;
  flushId = window.setInterval(() => {
    const batch = Object.values(pending);
    if (batch.length === 0) return;
    pending = {};
    merge(batch);
  }, FLUSH_MS);
}

function clearFlusher() {
  if (flushId !== undefined) {
    window.clearInterval(flushId);
    flushId = undefined;
  }
  pending = {};
}

function startPolling(symbols: string[]) {
  if (pollId !== undefined) return;
  setStreamStatus("polling");
  const tick = () =>
    getQuotes(symbols)
      .then((d) => {
        merge(d.quotes);
        notifyTicks(d.quotes);
      })
      .catch(() => {
        /* transient — next tick retries */
      });
  tick();
  pollId = window.setInterval(tick, POLL_MS);
}

function clearPolling() {
  if (pollId !== undefined) {
    window.clearInterval(pollId);
    pollId = undefined;
  }
}

function startKeepalive() {
  if (keepaliveId !== undefined) return;
  keepaliveId = window.setInterval(pingRelayHealth, KEEPALIVE_MS);
}

function clearKeepalive() {
  if (keepaliveId !== undefined) {
    window.clearInterval(keepaliveId);
    keepaliveId = undefined;
  }
}

function clearStreamRetry() {
  if (streamRetryId !== undefined) {
    window.clearTimeout(streamRetryId);
    streamRetryId = undefined;
  }
}

function teardownTransport() {
  stopStream?.();
  stopStream = null;
  clearStreamRetry();
  clearPolling();
}

// `seed` is the subset of `symbols` whose cache should be primed now (the newly
// added symbols on a union change — existing ones already hold cached values).
function connect(symbols: string[], seed: string[]) {
  teardownTransport();
  if (symbols.length === 0) {
    clearFlusher();
    clearKeepalive();
    setStreamStatus("idle");
    return;
  }
  ensureFlusher();
  startKeepalive();
  if (seed.length) {
    // Seed immediately so consumers aren't blank while the first tick lands
    // (can take several seconds on a new instrument / cold relay wake-up).
    getQuotes(seed)
      .then((d) => merge(d.quotes))
      .catch(() => {
        /* stream or poll will follow */
      });
  }
  streamBackoff = 0;
  setStreamStatus("streaming");
  openStream(symbols);
}

// Open (or re-open) the SSE transport for `symbols`. A tick arriving while we
// were polling means the stream has recovered: stop polling, flip status back,
// reset the backoff. On error, fall back to polling and schedule a backoff'd
// retry so a transient drop self-heals.
function openStream(symbols: string[]) {
  stopStream = streamQuotes(
    symbols,
    (q) => {
      if (pollId !== undefined) {
        clearPolling();
        setStreamStatus("streaming");
        streamBackoff = 0;
      }
      pending[q.symbol] = q;
      notifyTicks([q]);
    },
    () => {
      stopStream = null;
      startPolling(symbols);
      scheduleStreamRetry(symbols);
    },
  );
}

function scheduleStreamRetry(symbols: string[]) {
  if (streamRetryId !== undefined) return;
  const delay = Math.min(
    STREAM_RETRY_BASE_MS * 2 ** streamBackoff,
    STREAM_RETRY_MAX_MS,
  );
  streamBackoff += 1;
  streamRetryId = window.setTimeout(() => {
    streamRetryId = undefined;
    // A union change tears down the transport (clearing this timer), so a fired
    // retry means the union is unchanged; guard anyway. Polling keeps running
    // until the reopened stream delivers its first tick.
    if (symbols.join(",") !== currentKey) return;
    openStream(symbols);
  }, delay);
}

function scheduleReconnect() {
  if (reconnectId !== undefined) return;
  reconnectId = window.setTimeout(() => {
    reconnectId = undefined;
    const symbols = unionSymbols();
    const key = symbols.join(",");
    if (key === currentKey) return; // union unchanged after the burst settled
    const prev = new Set(currentKey ? currentKey.split(",") : []);
    const seed = symbols.filter((s) => !prev.has(s));
    currentKey = key;
    connect(symbols, seed);
  }, RECONNECT_DEBOUNCE_MS);
}

function retain(symbols: string[]) {
  for (const s of symbols) refCounts.set(s, (refCounts.get(s) ?? 0) + 1);
}

function release(symbols: string[]) {
  for (const s of symbols) {
    const n = (refCounts.get(s) ?? 0) - 1;
    if (n <= 0) refCounts.delete(s);
    else refCounts.set(s, n);
  }
}

// Register interest in `symbols` (cache-only); returns an unsubscribe. The live
// transport rebuilds (debounced) only when the union actually changes.
export function subscribeQuotes(symbols: string[]): () => void {
  const unique = Array.from(new Set(symbols));
  retain(unique);
  scheduleReconnect();
  return () => {
    release(unique);
    scheduleReconnect();
  };
}

// Register interest plus a per-symbol tick callback (for non-React consumers
// such as the TV datafeed) so they ride the same shared connection.
export function subscribeQuoteTicks(
  symbols: string[],
  cb: TickListener,
): () => void {
  const unique = Array.from(new Set(symbols));
  retain(unique);
  for (const s of unique) {
    let set = tickListeners.get(s);
    if (!set) {
      set = new Set();
      tickListeners.set(s, set);
    }
    set.add(cb);
  }
  scheduleReconnect();
  return () => {
    release(unique);
    for (const s of unique) {
      const set = tickListeners.get(s);
      if (!set) continue;
      set.delete(cb);
      if (set.size === 0) tickListeners.delete(s);
    }
    scheduleReconnect();
  };
}
