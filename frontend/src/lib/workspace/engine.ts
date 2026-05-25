/**
 * Workspace layout-engine selector — a throwaway A/B switch between the
 * production Dockview canvas and the Golden Layout prototype. Same module-level
 * pub/sub pattern as lib/settings; persisted so the choice survives reload.
 * Remove this module (and WorkspaceGolden) once the engine decision is made.
 */
import { useSyncExternalStore } from "react";

const KEY = "workspace_engine_v1";

export type WsEngine = "dockview" | "golden";

function load(): WsEngine {
  if (typeof window === "undefined") return "dockview";
  try {
    return localStorage.getItem(KEY) === "golden" ? "golden" : "dockview";
  } catch {
    return "dockview";
  }
}

let current: WsEngine = load();
const listeners = new Set<() => void>();

export function getEngine(): WsEngine {
  return current;
}

export function setEngine(e: WsEngine): void {
  if (e === current) return;
  current = e;
  try {
    localStorage.setItem(KEY, e);
  } catch {
    /* non-fatal */
  }
  listeners.forEach((l) => l());
}

function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useEngine(): WsEngine {
  return useSyncExternalStore(subscribe, getEngine, () => "dockview");
}
