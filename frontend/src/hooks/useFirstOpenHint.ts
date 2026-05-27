import { useEffect, useState } from "react";

// First-touch UX hint: shows on the first N opens of a surface, then never
// again. Also dismissible at any time. Counter and dismiss state live in
// localStorage keyed by `ftux_<key>`.
export function useFirstOpenHint(key: string, maxShows = 3) {
  const storageKey = `ftux_${key}`;
  const [show, setShow] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw === "done") return;
      const n = Number(raw) || 0;
      if (n >= maxShows) return;
      localStorage.setItem(storageKey, String(n + 1));
      setShow(true);
    } catch {
      /* private mode / quota — non-fatal, just don't show the hint */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function dismiss() {
    try {
      localStorage.setItem(storageKey, "done");
    } catch {
      /* ignore */
    }
    setShow(false);
  }

  return { show, dismiss };
}
