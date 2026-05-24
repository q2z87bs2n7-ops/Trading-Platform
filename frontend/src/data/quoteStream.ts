/**
 * Shared quote-stream manager. Every `useLiveQuotes` consumer registers its
 * symbols here; the manager keeps a single ref-counted SSE connection for the
 * *union* of all requested symbols and fans ticks into the React Query cache
 * (`qk.quotes`). Without this, each consumer opened its own EventSource — so a
 * Workspace with several widgets watching the same symbol would multiply
 * connections on the single (process-local) Render relay and could exhaust the
 * browser's ~6-per-host socket budget. Keeps the load-bearing polling fallback
 * and tick buffering from the original hook.
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

const refCounts = new Map<string, number>();
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
      .then((d) => merge(d.quotes))
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

function connect(symbols: string[]) {
  teardownTransport();
  if (symbols.length === 0) {
    clearFlusher();
    setStreamStatus("idle");
    return;
  }
  ensureFlusher();
  // Seed immediately so consumers aren't blank while the first tick lands
  // (can take several seconds on a new instrument / cold relay wake-up).
  getQuotes(symbols)
    .then((d) => merge(d.quotes))
    .catch(() => {
      /* stream or poll will follow */
    });
  setStreamStatus("streaming");
  stopStream = streamQuotes(
    symbols,
    (q) => {
      pending[q.symbol] = q;
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
    currentKey = key;
    connect(symbols);
  }, RECONNECT_DEBOUNCE_MS);
}

// Register interest in `symbols`; returns an unsubscribe that releases them.
// The live transport rebuilds (debounced) only when the union actually changes.
export function subscribeQuotes(symbols: string[]): () => void {
  const unique = Array.from(new Set(symbols));
  for (const s of unique) refCounts.set(s, (refCounts.get(s) ?? 0) + 1);
  scheduleReconnect();
  return () => {
    for (const s of unique) {
      const n = (refCounts.get(s) ?? 0) - 1;
      if (n <= 0) refCounts.delete(s);
      else refCounts.set(s, n);
    }
    scheduleReconnect();
  };
}
