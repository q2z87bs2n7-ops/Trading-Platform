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

// Fallback poll cadence (degraded mode only — never runs while the SSE stream
// is healthy). Gentler than the old 1 s: on a relay restart/blip every open
// client drops to this poll at once, so a tighter cadence stampedes the relay
// exactly as it's recovering. 2.5 s is plenty for a fallback tile refresh.
const POLL_MS = 2500;
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
    for (const r of rows) {
      if (!r.instrument) continue;
      // Timestamp guard: never let an older tick overwrite a newer one. At app
      // open the fresh /prices poll and the SSE's replay-of-last-cached frame
      // race, and the SSE replay can carry an *older* quote — without this guard
      // it clobbers the fresh poll value (and the first SSE frame also kills the
      // poll), freezing tiles on a stale price until the market moves. `ts` is
      // the bridge's offer time; missing ts always merges (can't compare).
      const cur = next[r.instrument];
      const curTs = typeof cur?.ts === "number" ? cur.ts : undefined;
      const newTs = typeof r.ts === "number" ? r.ts : undefined;
      if (cur && curTs !== undefined && newTs !== undefined && newTs < curTs) continue;
      next[r.instrument] = r;
    }
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
  // Seed from the /prices snapshot immediately, and keep polling until the SSE
  // delivers its first frame (openStream clears it then). The SSE source reads
  // the bridge's push cache, which is empty for a freshly-subscribed instrument
  // until FXCM pushes its first tick — whereas /prices pulls FCLite's current
  // snapshot, so tiles paint live bid/ask right away instead of sitting on the
  // stale last-close fallback through the warm-up.
  startPolling();
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
