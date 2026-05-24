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

import { getQuotes, streamQuotes } from "../api";
import { setStreamStatus } from "../lib/stream-status";
import type { Quote } from "../types";
import { qk, queryClient } from "./queryClient";

const POLL_MS = 2000;
// Buffer stream ticks and flush at most this often (mirrors the Watchlist's
// load-bearing constant from CLAUDE.md). Tune, don't remove.
const FLUSH_MS = 500;
// Coalesce a burst of (un)subscribes — e.g. several widgets mounting in the
// same tick — into one reconnect.
const RECONNECT_DEBOUNCE_MS = 60;

type QuoteMap = Record<string, Quote>;
type TickListener = (q: Quote) => void;

const refCounts = new Map<string, number>();
const tickListeners = new Map<string, Set<TickListener>>();
let currentKey = ""; // sorted, comma-joined union the live transport serves
let stopStream: (() => void) | null = null;
let pollId: number | undefined;
let flushId: number | undefined;
let reconnectId: number | undefined;
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

function teardownTransport() {
  stopStream?.();
  stopStream = null;
  clearPolling();
}

// `seed` is the subset of `symbols` whose cache should be primed now (the newly
// added symbols on a union change — existing ones already hold cached values).
function connect(symbols: string[], seed: string[]) {
  teardownTransport();
  if (symbols.length === 0) {
    clearFlusher();
    setStreamStatus("idle");
    return;
  }
  ensureFlusher();
  if (seed.length) {
    // Seed immediately so consumers aren't blank while the first tick lands
    // (can take several seconds on a new instrument / cold relay wake-up).
    getQuotes(seed)
      .then((d) => merge(d.quotes))
      .catch(() => {
        /* stream or poll will follow */
      });
  }
  setStreamStatus("streaming");
  stopStream = streamQuotes(
    symbols,
    (q) => {
      pending[q.symbol] = q;
      notifyTicks([q]);
    },
    () => startPolling(symbols),
  );
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
