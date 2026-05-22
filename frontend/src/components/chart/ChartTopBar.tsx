import { useEffect, useRef, useState } from "react";

import { useLiveQuotes } from "../../data/useLiveQuotes";
import { useMobile } from "../../hooks/useMobile";
import {
  getTVWidget,
  subscribeTVWidget,
  type TVChartApi,
} from "../../lib/tv-widget-handle";

const TFS: { label: string; res: string }[] = [
  { label: "1m", res: "1" },
  { label: "5m", res: "5" },
  { label: "15m", res: "15" },
  { label: "1h", res: "60" },
  { label: "4h", res: "240" },
  { label: "1D", res: "D" },
  { label: "1W", res: "W" },
];

// TV chart-type integer enum.
const CHART_TYPES: { label: string; value: number }[] = [
  { label: "Bars", value: 0 },
  { label: "Candles", value: 1 },
  { label: "Line", value: 2 },
  { label: "Area", value: 3 },
  { label: "Hollow", value: 9 },
  { label: "Heikin Ashi", value: 8 },
];

// Popover indicator picks. Names match TV's built-in study registry.
const INDICATORS: string[] = [
  "Moving Average",
  "Exponential Moving Average",
  "MACD",
  "RSI",
  "Bollinger Bands",
  "VWAP",
  "Volume",
  "Stochastic",
  "ATR",
];

const money = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD" });

function activeChart(): TVChartApi | null {
  const w = getTVWidget();
  if (!w) return null;
  try {
    return w.activeChart();
  } catch {
    return null;
  }
}

function useClickOutside(
  ref: React.RefObject<HTMLElement>,
  onOutside: () => void,
) {
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onOutside();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [ref, onOutside]);
}

interface Props {
  symbol: string;
  onChartBotClick?: () => void;
}

export default function ChartTopBar({ symbol, onChartBotClick }: Props) {
  const [resolution, setResolution] = useState<string>("D");
  const [typeOpen, setTypeOpen] = useState(false);
  const [indOpen, setIndOpen] = useState(false);
  const [tvReady, setTvReady] = useState(!!getTVWidget());
  const { quotes } = useLiveQuotes(symbol ? [symbol] : []);
  const quote = quotes[symbol];

  // Watch widget mount/unmount so we know when activeChart() is callable.
  useEffect(() => {
    return subscribeTVWidget((w) => setTvReady(!!w));
  }, []);

  // Mirror TV's current resolution into our active TF pill.
  useEffect(() => {
    if (!tvReady) return;
    const chart = activeChart();
    if (!chart) return;
    try {
      setResolution(chart.resolution());
      const sub = chart.onIntervalChanged();
      const handler = (r: string) => setResolution(r);
      sub.subscribe(null, () => {
        try {
          setResolution(chart.resolution());
        } catch {
          // chart could be torn down — ignore
        }
      });
      void handler; // typed for clarity
      return () => {
        try {
          sub.unsubscribe(null, () => {});
        } catch {
          // some TV builds reject unsubscribe with arbitrary cb; non-fatal
        }
      };
    } catch {
      // not ready yet
    }
  }, [tvReady]);

  function setTF(res: string) {
    const chart = activeChart();
    if (!chart) return;
    void chart.setResolution(res).catch(() => {});
  }

  function setType(n: number) {
    const chart = activeChart();
    if (!chart) return;
    try {
      chart.setChartType(n);
    } catch {
      /* noop */
    }
    setTypeOpen(false);
  }

  function addIndicator(name: string) {
    const chart = activeChart();
    if (!chart) return;
    void chart.createStudy(name).catch(() => {});
    setIndOpen(false);
  }

  const typeRef = useRef<HTMLDivElement>(null);
  const indRef = useRef<HTMLDivElement>(null);
  useClickOutside(typeRef, () => setTypeOpen(false));
  useClickOutside(indRef, () => setIndOpen(false));
  const isMobile = useMobile();

  if (isMobile) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          overflowX: "auto",
          scrollbarWidth: "none",
          padding: "6px 10px",
          borderBottom: "1px solid var(--hairline)",
        }}
      >
        {/* Compact symbol + live price */}
        <span
          className="font-semibold"
          style={{ fontSize: 14, whiteSpace: "nowrap" }}
        >
          {symbol || "—"}
        </span>
        {quote && (
          <span
            className="font-mono tabular-nums"
            style={{ fontSize: 12, color: "var(--text-2)", whiteSpace: "nowrap" }}
          >
            {money(quote.mid)}
          </span>
        )}

        {/* TF pills */}
        <div style={{ display: "inline-flex", gap: 4 }}>
          {TFS.map((t) => {
            const active = resolution === t.res;
            return (
              <button
                key={t.res}
                type="button"
                onClick={() => setTF(t.res)}
                disabled={!tvReady}
                className="font-mono cursor-pointer"
                style={{
                  fontSize: 11.5,
                  fontWeight: 600,
                  padding: "5px 10px",
                  borderRadius: 999,
                  whiteSpace: "nowrap",
                  background: active ? "var(--accent-bg)" : "transparent",
                  color: active ? "var(--accent)" : "var(--text-2)",
                  border: "1px solid " + (active ? "var(--accent)" : "var(--border)"),
                }}
              >
                {t.label}
              </button>
            );
          })}
        </div>

        {/* ⋯ overflow — chart type + indicators */}
        <OverflowMenu onPickType={setType} onAddIndicator={addIndicator} tvReady={tvReady} />
      </div>
    );
  }

  return (
    <div
      className="flex items-center gap-2 px-3 py-2 flex-wrap"
      style={{
        background: "var(--panel)",
        border: "1px solid var(--border)",
        borderRadius: "var(--r-lg)",
        boxShadow: "var(--shadow-sm)",
      }}
    >
      {/* Symbol + live price */}
      <div className="flex items-baseline gap-2 mr-1">
        <span className="text-[16px] font-semibold" style={{ letterSpacing: "-0.005em" }}>
          {symbol || "—"}
        </span>
        {quote && (
          <span className="font-mono text-[14px] tabular-nums">
            {money(quote.mid)}
          </span>
        )}
      </div>

      <div
        className="self-stretch w-px"
        style={{ background: "var(--hairline)" }}
        aria-hidden
      />

      {/* TF tabs */}
      <div
        className="inline-flex gap-px"
      >
        {TFS.map((t) => {
          const active = resolution === t.res;
          return (
            <button
              key={t.res}
              type="button"
              onClick={() => setTF(t.res)}
              disabled={!tvReady}
              className="font-mono text-[11.5px] font-medium cursor-pointer border-0 px-2 py-1.5 transition-colors"
              style={{
                background: "transparent",
                color: active ? "var(--accent)" : "var(--mute)",
                borderBottom: `2px solid ${active ? "var(--accent)" : "transparent"}`,
                borderRadius: 0,
              }}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Chart type popover */}
      <div className="relative" ref={typeRef}>
        <button
          type="button"
          onClick={() => setTypeOpen((v) => !v)}
          disabled={!tvReady}
          className="text-[12.5px] cursor-pointer px-3 py-1.5"
          style={{
            background: typeOpen ? "var(--panel-2)" : "transparent",
            color: "var(--text-2)",
            border: "1px solid var(--border)",
            borderRadius: "var(--r)",
          }}
        >
          Type ▾
        </button>
        {typeOpen && (
          <div
            className="absolute top-full right-0 mt-1 z-10 flex flex-col py-1"
            style={{
              background: "var(--panel)",
              border: "1px solid var(--border)",
              borderRadius: "var(--r)",
              boxShadow: "var(--shadow)",
              minWidth: 160,
            }}
          >
            {CHART_TYPES.map((ct) => (
              <button
                key={ct.value}
                type="button"
                onClick={() => setType(ct.value)}
                className="text-left text-[13px] px-3 py-1.5 cursor-pointer border-0 bg-transparent hover:bg-panel-2"
                style={{ color: "var(--text)" }}
              >
                {ct.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Indicators popover */}
      <div className="relative" ref={indRef}>
        <button
          type="button"
          onClick={() => setIndOpen((v) => !v)}
          disabled={!tvReady}
          className="text-[12.5px] cursor-pointer px-3 py-1.5"
          style={{
            background: indOpen ? "var(--panel-2)" : "transparent",
            color: "var(--text-2)",
            border: "1px solid var(--border)",
            borderRadius: "var(--r)",
          }}
        >
          + Indicator
        </button>
        {indOpen && (
          <div
            className="absolute top-full right-0 mt-1 z-10 flex flex-col py-1"
            style={{
              background: "var(--panel)",
              border: "1px solid var(--border)",
              borderRadius: "var(--r)",
              boxShadow: "var(--shadow)",
              minWidth: 220,
            }}
          >
            {INDICATORS.map((name) => (
              <button
                key={name}
                type="button"
                onClick={() => addIndicator(name)}
                className="text-left text-[13px] px-3 py-1.5 cursor-pointer border-0 bg-transparent hover:bg-panel-2"
                style={{ color: "var(--text)" }}
              >
                {name}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="ml-auto flex items-center gap-2">
        {/* ChartBot launch — violet to match the panel accent */}
        {onChartBotClick && (
          <button
            type="button"
            onClick={onChartBotClick}
            className="text-[12.5px] font-medium cursor-pointer px-3 py-1.5 inline-flex items-center gap-1.5"
            style={{
              background: "var(--cb-accent-bg)",
              color: "var(--cb-accent)",
              border: "1px solid var(--cb-accent)",
              borderRadius: "var(--r)",
            }}
          >
            <span aria-hidden>✦</span>
            ChartBot
          </button>
        )}
      </div>
    </div>
  );
}

// Mobile ⋯ overflow popover combining the chart-type and indicator lists
// that get their own buttons on desktop.
function OverflowMenu({
  onPickType,
  onAddIndicator,
  tvReady,
}: {
  onPickType: (n: number) => void;
  onAddIndicator: (name: string) => void;
  tvReady: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, () => setOpen(false));
  return (
    <div className="relative" ref={ref} style={{ marginLeft: "auto" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={!tvReady}
        aria-label="Chart type and indicators"
        style={{
          fontSize: 16,
          lineHeight: 1,
          padding: "5px 12px",
          borderRadius: 999,
          whiteSpace: "nowrap",
          background: open ? "var(--panel-2)" : "transparent",
          color: "var(--text-2)",
          border: "1px solid var(--border)",
          cursor: "pointer",
        }}
      >
        ⋯
      </button>
      {open && (
        <div
          className="absolute top-full right-0 mt-1 z-20 flex flex-col py-1"
          style={{
            background: "var(--panel)",
            border: "1px solid var(--border)",
            borderRadius: "var(--r)",
            boxShadow: "var(--shadow)",
            minWidth: 200,
            maxHeight: "60vh",
            overflowY: "auto",
          }}
        >
          <div
            className="px-3 pt-1 pb-0.5 text-[10.5px] uppercase"
            style={{ color: "var(--mute)", letterSpacing: "0.04em" }}
          >
            Chart type
          </div>
          {CHART_TYPES.map((ct) => (
            <button
              key={ct.value}
              type="button"
              onClick={() => {
                onPickType(ct.value);
                setOpen(false);
              }}
              className="text-left text-[13px] px-3 py-2 cursor-pointer border-0 bg-transparent hover:bg-panel-2"
              style={{ color: "var(--text)" }}
            >
              {ct.label}
            </button>
          ))}
          <div
            className="px-3 pt-2 pb-0.5 text-[10.5px] uppercase"
            style={{
              color: "var(--mute)",
              letterSpacing: "0.04em",
              borderTop: "1px solid var(--hairline)",
              marginTop: 4,
            }}
          >
            Indicators
          </div>
          {INDICATORS.map((name) => (
            <button
              key={name}
              type="button"
              onClick={() => {
                onAddIndicator(name);
                setOpen(false);
              }}
              className="text-left text-[13px] px-3 py-2 cursor-pointer border-0 bg-transparent hover:bg-panel-2"
              style={{ color: "var(--text)" }}
            >
              {name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
