import { useSyncExternalStore } from "react";

export type Theme = "light" | "dark";

function readInitialTheme(): Theme {
  if (typeof window === "undefined") return "light";
  const saved = localStorage.getItem("theme");
  if (saved === "light" || saved === "dark") return saved;
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

// Shared module-level store so every useTheme() consumer (header toggle,
// mobile drawer, TVPlatform, PriceChart) reflects the same theme. Without
// this, each hook instance held its own useState and a toggle in the header
// never reached the charts — they only re-skin on remount.
let currentTheme: Theme = readInitialTheme();
const listeners = new Set<() => void>();

function setThemeGlobal(next: Theme) {
  if (next === currentTheme) return;
  currentTheme = next;
  document.documentElement.dataset.theme = next;
  localStorage.setItem("theme", next);
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function useTheme() {
  const theme = useSyncExternalStore(
    subscribe,
    () => currentTheme,
    () => currentTheme,
  );

  return {
    theme,
    toggle: () => setThemeGlobal(currentTheme === "dark" ? "light" : "dark"),
    setTheme: (t: Theme) => setThemeGlobal(t),
  };
}
