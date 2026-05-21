/**
 * Lightweight pub/sub for quote-stream status. useLiveQuotes flips the
 * state when it falls back to polling (or recovers); TopBar subscribes
 * to surface the "Polling · stream disconnected" chip. Module-level so
 * any consumer can subscribe without prop-drilling — same pattern as
 * tv-widget-handle.
 */

export type StreamStatus = "idle" | "streaming" | "polling";

type Listener = (s: StreamStatus) => void;

let status: StreamStatus = "idle";
const listeners = new Set<Listener>();

export function setStreamStatus(next: StreamStatus): void {
  if (next === status) return;
  status = next;
  listeners.forEach((l) => l(next));
}

export function getStreamStatus(): StreamStatus {
  return status;
}

export function subscribeStreamStatus(l: Listener): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}
