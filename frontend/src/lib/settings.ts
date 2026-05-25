/**
 * App-level user settings, persisted to localStorage. Same module-level
 * pub/sub pattern as lib/toast and lib/stream-status — keeps the surface
 * tiny and avoids a Context provider for what is, today, a single toggle.
 */

const KEY = "app_settings_v1";

export interface AppSettings {
  /** Auto-generate the per-window AI market/crypto summary on Discover. */
  marketSummaryAiEnabled: boolean;
  /** Ask anything: route unrecognised phrases through /api/ai/ask. */
  askAiEnabled: boolean;
  /** ChartBot side panel in Chart mode. */
  chartbotEnabled: boolean;
}

const DEFAULTS: AppSettings = {
  marketSummaryAiEnabled: true,
  askAiEnabled: true,
  chartbotEnabled: true,
};

function load(): AppSettings {
  if (typeof window === "undefined") return { ...DEFAULTS };
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw);
    return { ...DEFAULTS, ...parsed };
  } catch {
    return { ...DEFAULTS };
  }
}

let current: AppSettings = load();

type Listener = (s: AppSettings) => void;
const listeners = new Set<Listener>();

export function getSettings(): AppSettings {
  return current;
}

export function updateSettings(patch: Partial<AppSettings>): void {
  current = { ...current, ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    // localStorage can throw under quota / private-browsing; the in-memory
    // value is still updated so the rest of this session reflects the
    // change.
  }
  listeners.forEach((l) => l(current));
}

export function subscribeSettings(l: Listener): () => void {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}
