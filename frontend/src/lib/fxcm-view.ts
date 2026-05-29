import { useEffect } from "react";

import { setFxcmView } from "../api";

// Client-side registry of the CFD instruments currently on screen (charts,
// order ticket, live quotes). Components register what they display via
// useFxcmView; the union is debounce-POSTed to /api/fxcm/view, which subscribes
// new instruments (status T → live prices) and sporadically returns stale ones
// to D. Ref-counted so multiple widgets showing the same instrument coexist and
// the last one unmounting releases it. Mirrors the singleton pattern of
// data/quoteStream.ts.

const counts = new Map<string, number>();
let timer: ReturnType<typeof setTimeout> | undefined;
let lastSent = "";

function flush() {
  timer = undefined;
  const syms = [...counts.keys()].sort();
  const key = syms.join(",");
  // Skip a redundant POST if the set is unchanged since the last send.
  if (key === lastSent) return;
  lastSent = key;
  setFxcmView(syms).catch(() => {
    // Best-effort; allow a later change to retry by clearing the dedup key.
    lastSent = "";
  });
}

function schedule() {
  if (timer === undefined) timer = setTimeout(flush, 800);
}

export function addFxcmView(symbols: string[]): void {
  for (const s of symbols) if (s) counts.set(s, (counts.get(s) ?? 0) + 1);
  schedule();
}

export function removeFxcmView(symbols: string[]): void {
  for (const s of symbols) {
    if (!s) continue;
    const n = (counts.get(s) ?? 0) - 1;
    if (n <= 0) counts.delete(s);
    else counts.set(s, n);
  }
  schedule();
}

// Register the CFD instruments a component is displaying for the lifetime of
// the mount (or until they change). `enabled` lets callers gate on the CFD silo
// without conditionally calling the hook. Non-CFD callers should pass enabled
// = false (or simply not use this hook).
export function useFxcmView(
  symbols: string | readonly string[] | undefined,
  enabled = true,
): void {
  const list = (
    Array.isArray(symbols) ? symbols : symbols ? [symbols] : []
  ).filter(Boolean) as string[];
  const key = list.join(",");
  useEffect(() => {
    if (!enabled || !list.length) return;
    addFxcmView(list);
    return () => removeFxcmView(list);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled]);
}
