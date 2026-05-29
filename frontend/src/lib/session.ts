// Session-freshness primitives shared by App (splash gating) and the
// service-worker reset. The "resume where you were on reload" behaviour only
// holds while the session is fresh; after SESSION_TTL_MS of inactivity a load
// re-shows the splash. `last_active_at` is refreshed on interaction / focus.

export const LAST_ACTIVE_KEY = "last_active_at";
export const SESSION_TTL_MS = 10 * 60 * 1000; // 10 minutes

export function markActive(): void {
  try {
    localStorage.setItem(LAST_ACTIVE_KEY, String(Date.now()));
  } catch {
    /* private mode / quota — non-fatal */
  }
}

// True only if the last recorded activity is within the freshness window. An
// absent timestamp counts as stale (we're pre-clients — no grandfathering).
export function isSessionFresh(): boolean {
  const last = Number(localStorage.getItem(LAST_ACTIVE_KEY) || 0);
  return last > 0 && Date.now() - last <= SESSION_TTL_MS;
}

// Force the splash on the next load — used after a service-worker reset so a
// hard PWA refresh lands on the entry screen rather than silently resuming.
export function expireSession(): void {
  try {
    localStorage.removeItem(LAST_ACTIVE_KEY);
  } catch {
    /* non-fatal */
  }
}
