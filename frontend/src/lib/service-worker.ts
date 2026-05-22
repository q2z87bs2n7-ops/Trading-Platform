import { showToast } from "./toast";

// One-shot: unregister every service worker, drop every cache, then reload.
// Lets the user hard-reset the PWA when a stale build is stuck. Shared by the
// desktop SettingsMenu and the mobile nav drawer.
export async function disableServiceWorker(): Promise<void> {
  try {
    if ("serviceWorker" in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
    }
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
    showToast("Service worker disabled — reloading", "info", 1200);
    setTimeout(() => window.location.reload(), 600);
  } catch (e) {
    showToast(`Couldn't unregister: ${(e as Error).message}`, "error");
  }
}
