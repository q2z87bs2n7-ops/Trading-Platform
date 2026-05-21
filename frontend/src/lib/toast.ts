/**
 * Tiny module-level toast pub/sub. Used for non-intrusive feedback on
 * watchlist mutations + symbol-existence checks (and anywhere else we
 * need a "✓ saved" / "✕ not found" hint without a modal). Same pattern
 * as lib/stream-status — no React Context, no external deps.
 */

export type ToastKind = "success" | "error" | "info";

export interface Toast {
  id: number;
  message: string;
  kind: ToastKind;
}

type Listener = (toasts: Toast[]) => void;

let toasts: Toast[] = [];
const listeners = new Set<Listener>();
let counter = 0;

const DEFAULT_TTL_MS = 3500;

export function showToast(
  message: string,
  kind: ToastKind = "info",
  ttlMs = DEFAULT_TTL_MS,
): number {
  counter += 1;
  const t: Toast = { id: counter, message, kind };
  toasts = [...toasts, t];
  listeners.forEach((l) => l(toasts));
  if (ttlMs > 0) {
    setTimeout(() => dismissToast(t.id), ttlMs);
  }
  return t.id;
}

export function dismissToast(id: number): void {
  const next = toasts.filter((t) => t.id !== id);
  if (next.length === toasts.length) return;
  toasts = next;
  listeners.forEach((l) => l(toasts));
}

export function subscribeToasts(l: Listener): () => void {
  listeners.add(l);
  l(toasts);
  return () => {
    listeners.delete(l);
  };
}
