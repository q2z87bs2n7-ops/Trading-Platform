import { useEffect, useState } from "react";

import { useLiveQuotes } from "../../data/useLiveQuotes";
import {
  getTVWidget,
  subscribeTVWidget,
} from "../../lib/tv-widget-handle";

const money = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD" });

// Maps TV's resolution string into the short labels the user reads.
function fmtRes(r: string): string {
  if (r === "D") return "1D";
  if (r === "W") return "1W";
  if (r === "M") return "1M";
  const n = Number(r);
  if (!Number.isFinite(n)) return r;
  if (n >= 60) return `${n / 60}h`;
  return `${n}m`;
}

export default function ChatContextPills({ symbol }: { symbol: string }) {
  const [resolution, setResolution] = useState("D");
  const [indCount, setIndCount] = useState(0);
  const [tvReady, setTvReady] = useState(!!getTVWidget());
  const { quotes } = useLiveQuotes(symbol ? [symbol] : []);
  const q = quotes[symbol];

  useEffect(() => subscribeTVWidget((w) => setTvReady(!!w)), []);

  // Resolution + indicator count from TV. Same 1.2s polling cadence as
  // IndicatorPillsRow — cheap, and bounded by Chart-mode-only mounts.
  useEffect(() => {
    if (!tvReady) return;
    let cancelled = false;

    function refresh() {
      const w = getTVWidget();
      if (!w || cancelled) return;
      try {
        const c = w.activeChart();
        setResolution(c.resolution());
        const all = c.getAllStudies();
        setIndCount(
          all.filter((s) => s.name && s.name.toLowerCase() !== "compare")
            .length,
        );
      } catch {
        /* not ready */
      }
    }

    refresh();
    const id = setInterval(refresh, 1200);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [tvReady]);

  return (
    <div
      className="flex items-center flex-wrap gap-1.5 px-3 py-2"
      style={{ borderBottom: "1px solid var(--hairline)" }}
    >
      <span
        className="inline-flex items-center gap-1.5 font-mono text-[11px] px-2 py-1 tabular-nums"
        style={{
          background: "var(--cb-accent-bg)",
          color: "var(--cb-accent)",
          borderRadius: 6,
        }}
      >
        <span className="font-semibold">{symbol}</span>
        <span style={{ opacity: 0.5 }}>·</span>
        <span>{fmtRes(resolution)}</span>
        {q && (
          <>
            <span style={{ opacity: 0.5 }}>·</span>
            <span>{money(q.mid)}</span>
          </>
        )}
      </span>
      {indCount > 0 && (
        <span
          className="inline-flex items-center gap-1 font-mono text-[11px] px-2 py-1"
          style={{
            background: "var(--panel-2)",
            color: "var(--text-2)",
            borderRadius: 6,
          }}
        >
          Indicators +{indCount}
        </span>
      )}
    </div>
  );
}
