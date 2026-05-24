/**
 * Shared bar-stream manager. Mirrors `quoteStream.ts` for the TV datafeed's
 * real-time bars: one ref-counted SSE connection (`kinds=bar`) for the union of
 * all chart subscriptions, fanning each tick to every listener registered for
 * that symbol. Without this, every TV chart opened its own `streamBars`
 * EventSource, so multiple chart widgets multiplied bar connections on the
 * single process-local relay. Each subscriber keeps its own out-of-order /
 * stale-bar filtering (see `tv-datafeed.ts`).
 */

import { streamBars, type BarTick } from "../api";

type Listener = (b: BarTick) => void;

const RECONNECT_DEBOUNCE_MS = 60;

const listeners = new Map<string, Set<Listener>>();
let currentKey = ""; // sorted, comma-joined union the connection serves
let stop: (() => void) | null = null;
let reconnectId: number | undefined;

function unionSymbols(): string[] {
  return Array.from(listeners.keys()).sort();
}

function connect(symbols: string[]) {
  stop?.();
  stop = null;
  if (symbols.length === 0) return;
  stop = streamBars(
    symbols,
    (b) => {
      const set = listeners.get(b.symbol);
      if (set) set.forEach((cb) => cb(b));
    },
    () => {
      // Upstream closed; matches the previous per-chart behaviour — TV keeps
      // its last-known bar until the next getBars refresh.
    },
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

// Register a per-symbol bar listener; returns an unsubscribe. The live
// connection rebuilds (debounced) only when the symbol union actually changes.
export function subscribeBar(symbol: string, cb: Listener): () => void {
  let set = listeners.get(symbol);
  if (!set) {
    set = new Set();
    listeners.set(symbol, set);
  }
  set.add(cb);
  scheduleReconnect();
  return () => {
    const s = listeners.get(symbol);
    if (!s) return;
    s.delete(cb);
    if (s.size === 0) listeners.delete(symbol);
    scheduleReconnect();
  };
}
