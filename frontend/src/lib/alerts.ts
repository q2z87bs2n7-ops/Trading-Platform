/**
 * Client-side price alerts for the CFD silo. A tiny localStorage-backed store
 * (same pub/sub shape as lib/toast.ts) plus a `useAlerts` hook. Monitoring is
 * in-browser only — alerts fire while the app is open (see AlertEngine); there
 * is no server-side watcher or push delivery (out of scope).
 *
 * Persistence is localStorage today (single-user, alerts only matter while a
 * tab is open). It's intentionally isolated behind this module so it can move
 * to the DB later without touching the engine or UI.
 */

import { useSyncExternalStore } from "react";

export type AlertSource = "mid" | "bid" | "ask";
export type AlertDirection = "above" | "below"; // cross above / cross below
export type AlertStatus = "armed" | "triggered";

export interface PriceAlert {
  id: string;
  instrument: string;
  source: AlertSource;
  direction: AlertDirection;
  price: number;
  status: AlertStatus;
  createdAt: number;
  triggeredAt?: number;
}

const LS_KEY = "cfd_alerts_v1";

let alerts: PriceAlert[] = load();
const listeners = new Set<() => void>();

function load(): PriceAlert[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(LS_KEY);
    const parsed = raw ? (JSON.parse(raw) as PriceAlert[]) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function persist(next: PriceAlert[]): void {
  alerts = next;
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(alerts));
  } catch {
    /* private mode / quota — keep the in-memory copy */
  }
  listeners.forEach((l) => l());
}

function uid(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}

export function getAlerts(): PriceAlert[] {
  return alerts;
}

export function subscribeAlerts(l: () => void): () => void {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

export function addAlert(
  a: Pick<PriceAlert, "instrument" | "source" | "direction" | "price">,
): PriceAlert {
  const alert: PriceAlert = {
    id: uid(),
    status: "armed",
    createdAt: Date.now(),
    ...a,
  };
  persist([...alerts, alert]);
  return alert;
}

export function updateAlert(id: string, patch: Partial<PriceAlert>): void {
  persist(alerts.map((a) => (a.id === id ? { ...a, ...patch } : a)));
}

export function removeAlert(id: string): void {
  persist(alerts.filter((a) => a.id !== id));
}

export function setAlertStatus(id: string, status: AlertStatus): void {
  persist(
    alerts.map((a) =>
      a.id === id
        ? { ...a, status, triggeredAt: status === "triggered" ? Date.now() : undefined }
        : a,
    ),
  );
}

// Keep tabs in sync (single-user, but cheap correctness if two tabs are open).
if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key === LS_KEY) {
      alerts = load();
      listeners.forEach((l) => l());
    }
  });
}

export function useAlerts(): PriceAlert[] {
  return useSyncExternalStore(subscribeAlerts, getAlerts, getAlerts);
}
