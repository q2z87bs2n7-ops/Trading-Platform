import { useEffect, useState } from "react";

import { useMobile } from "../../hooks/useMobile";
import {
  getTVWidget,
  subscribeTVWidget,
  type TVEntityInfo,
} from "../../lib/tv-widget-handle";

// TV doesn't expose onStudyAdded / onStudyRemoved on the chart API in this
// build, so we poll every ~1.2s. getAllStudies() is a synchronous in-memory
// read on TV's side; the cost is negligible. We also re-poll immediately
// after our own ChartTopBar createStudy() callbacks via the same hook
// (TV updates the list before the callback resolves).

export default function IndicatorPillsRow() {
  const [studies, setStudies] = useState<TVEntityInfo[]>([]);
  const [tvReady, setTvReady] = useState(!!getTVWidget());
  const isMobile = useMobile();

  useEffect(() => {
    return subscribeTVWidget((w) => setTvReady(!!w));
  }, []);

  useEffect(() => {
    if (!tvReady) return;
    let cancelled = false;

    function refresh() {
      const w = getTVWidget();
      if (!w || cancelled) return;
      try {
        const all = w.activeChart().getAllStudies();
        // Filter out the implicit "Compare" / "Volume" entries TV always
        // includes when you mount a chart; they don't read as user-added.
        const visible = all.filter(
          (s) => s.name && s.name.toLowerCase() !== "compare",
        );
        setStudies(visible);
      } catch {
        // chart not yet attached
      }
    }

    refresh();
    const id = setInterval(refresh, 1200);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [tvReady]);

  function removeStudy(id: string) {
    const w = getTVWidget();
    if (!w) return;
    try {
      w.activeChart().removeEntity(id);
      setStudies((prev) => prev.filter((s) => s.id !== id));
    } catch {
      /* noop */
    }
  }

  if (studies.length === 0) return null;

  return (
    <div
      className={
        isMobile
          ? "flex items-center gap-1.5 py-1.5"
          : "flex items-center flex-wrap gap-1.5 px-3 py-1.5"
      }
      style={
        isMobile
          ? {
              flexWrap: "nowrap",
              overflowX: "auto",
              scrollbarWidth: "none",
              padding: "4px var(--mob-container-pad)",
            }
          : undefined
      }
    >
      {studies.map((s) => (
        <span
          key={s.id}
          className="inline-flex items-center gap-1.5 text-[11.5px] font-medium px-2 py-1 font-mono"
          style={{
            background: "var(--accent-bg)",
            color: "var(--accent)",
            borderRadius: 6,
            letterSpacing: 0,
            flexShrink: 0,
          }}
        >
          <span>{s.name}</span>
          <button
            type="button"
            onClick={() => removeStudy(s.id)}
            aria-label={`Remove ${s.name}`}
            className="cursor-pointer border-0 bg-transparent text-[12px] leading-none"
            style={{ color: "var(--accent)", opacity: 0.7 }}
          >
            ✕
          </button>
        </span>
      ))}
    </div>
  );
}
