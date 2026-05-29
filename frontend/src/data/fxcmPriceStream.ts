/**
 * Shared FXCM price-stream manager. Consumers (Scalp mode, the alert engine)
 * register interest here; the manager keeps a single ref-counted SSE connection
 * to /api/fxcm/stream and writes merged ticks into the React Query cache
 * (`qk.fxcmLivePrices`). Mirrors data/quoteStream.ts (the Alpaca path): the
 * server streams the whole subscribed/status-T set (driven by the watchlist /
 * view logic, not this connection), so there's no per-symbol union to track —
 * just one feed shared by all consumers.
 *
 * The load-bearing polling fallback is preserved: on an SSE drop we fall back to
 * polling /prices immediately, then try to restore the stream on a backoff. A
 * transient close (relay restart, proxy recycle, bridge blip) self-heals instead
 * of permanently degrading to polling.
 */

import { getFxcmPrices, pingRelayHealth, streamFxcmPrices } from "../api";
import type { FxcmPrice } from "../types";
import { qk, queryClient } from "./queryClient";

// Fallback poll cadence — matches Scalp's prior 1 s /prices poll so the degraded
// path is no worse than before the stream existed.
const POLL_MS = 1000;
// Ping the Render relay every 9 minutes to prevent spindown-triggered fallback.
const KEEPALIVE_MS = 9 * 60 * 1000;
// On an SSE drop, restore the stream on an exponential backoff (3s → … → 60s).
const STREAM_RETRY_BASE_MS = 3000;
const STREAM_RETRY_MAX_MS = 60000;

type PriceMap = Record<string, FxcmPrice>;

let refCount = 0;
let stopStream: (() => void) | null = null;
let pollId: number | undefined;
let keepaliveId: number | undefined;
let streamRetryId: number | undefined;
let streamBackoff = 0;

function merge(rows: FxcmPrice[]) {
  if (rows.length === 0) return;
  queryClient.setQueryData<PriceMap>(qk.fxcmLivePrices, (prev) => {
    const next = { ...(prev ?? {}) };
    for (const r of rows) if (r.instrument) next[r.instrument] = r;
    return next;
  });
}

function startPolling() {
  if (pollId !== undefined) return;
  const tick = () =>
    getFxcmPrices()
      .then((rows) => merge(rows))
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
  if (keepaliveId === undefined) keepaliveId = window.setInterval(pingRelayHealth, KEEPALIVE_MS);
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

// Open (or re-open) the SSE transport. A frame arriving while we were polling
// means the stream recovered: stop polling and reset the backoff. On error, fall
// back to polling and schedule a backoff'd retry so a transient drop self-heals.
function openStream() {
  stopStream = streamFxcmPrices(
    (rows) => {
      if (pollId !== undefined) {
        clearPolling();
        streamBackoff = 0;
      }
      merge(rows);
    },
    () => {
      stopStream = null;
      startPolling();
      scheduleStreamRetry();
    },
  );
}

function scheduleStreamRetry() {
  if (streamRetryId !== undefined) return;
  const delay = Math.min(STREAM_RETRY_BASE_MS * 2 ** streamBackoff, STREAM_RETRY_MAX_MS);
  streamBackoff += 1;
  streamRetryId = window.setTimeout(() => {
    streamRetryId = undefined;
    if (refCount === 0) return; // everyone left while we were backing off
    openStream();
  }, delay);
}

function start() {
  startKeepalive();
  streamBackoff = 0;
  openStream();
}

function stop() {
  stopStream?.();
  stopStream = null;
  clearPolling();
  clearKeepalive();
  clearStreamRetry();
}

// Register interest in the live price feed; returns an unsubscribe. The shared
// transport opens on the first subscriber and tears down when the last leaves.
export function subscribeFxcmPrices(): () => void {
  refCount += 1;
  if (refCount === 1) start();
  return () => {
    refCount -= 1;
    if (refCount === 0) stop();
  };
}
