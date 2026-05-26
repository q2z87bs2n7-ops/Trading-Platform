import { useEffect, useRef } from "react";
import {
  createChart,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from "lightweight-charts";

import { useTheme } from "../../hooks/useTheme";
import { fmtCryptoPrice, pct } from "../../lib/format";
import { fmtPrice, sparkPaths } from "./util";

// Read --pos / --neg / --panel from the active Calm theme so the chart tracks
// light/dark swaps. The lightweight-charts canvas can't consume CSS variables
// directly, so we resolve them at apply-time.
function readSparkColors(up: boolean) {
  const cs = getComputedStyle(document.documentElement);
  const v = (name: string, fallback: string) =>
    cs.getPropertyValue(name).trim() || fallback;
  const stroke = v(up ? "--pos" : "--neg", up ? "#16a34a" : "#dc2626");
  return {
    stroke,
    background: v("--panel", "#ffffff"),
  };
}

// Approximate an oklch token by sampling the resolved color into a transparent
// rgba — lightweight-charts wants explicit alpha-baked colors for area fills,
// and the token may be in any color space, so let the browser do the conversion.
function withAlpha(color: string, alpha: number): string {
  // Trust the consumer that the token resolves to *something* paintable; if it
  // doesn't, lightweight-charts just won't render the fill (no crash).
  const probe = document.createElement("div");
  probe.style.color = color;
  probe.style.display = "none";
  document.body.appendChild(probe);
  const rgb = getComputedStyle(probe).color; // "rgb(r, g, b)" or "rgba(...)"
  document.body.removeChild(probe);
  const m = rgb.match(/rgba?\(([^)]+)\)/);
  if (!m) return color;
  const parts = m[1].split(",").map((s) => s.trim());
  return `rgba(${parts[0]}, ${parts[1]}, ${parts[2]}, ${alpha})`;
}

// Tiny lightweight-charts area sparkline. Matches the Workspace Mini-chart's
// "spark" tier (PriceChart.tsx) for visual parity across the app.
function SparkChart({
  closes,
  up,
  height,
}: {
  closes: number[];
  up: boolean;
  height: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Area"> | null>(null);
  const { theme } = useTheme();

  useEffect(() => {
    if (!ref.current || chartRef.current) return;
    const c = readSparkColors(up);
    const chart = createChart(ref.current, {
      layout: { background: { color: c.background }, textColor: "transparent" },
      grid: { vertLines: { visible: false }, horzLines: { visible: false } },
      rightPriceScale: { visible: false },
      leftPriceScale: { visible: false },
      timeScale: { visible: false, borderVisible: false },
      crosshair: {
        vertLine: { visible: false, labelVisible: false },
        horzLine: { visible: false, labelVisible: false },
      },
      handleScroll: false,
      handleScale: false,
      autoSize: true,
    });
    seriesRef.current = chart.addAreaSeries({
      lineColor: c.stroke,
      topColor: withAlpha(c.stroke, 0.18),
      bottomColor: withAlpha(c.stroke, 0),
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
    });
    chartRef.current = chart;
    return () => {
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
    // Re-create on `up` flip handled via applyOptions below — no remount needed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-skin in place when theme toggles or the up/down direction flips.
  useEffect(() => {
    if (!chartRef.current || !seriesRef.current) return;
    const c = readSparkColors(up);
    chartRef.current.applyOptions({
      layout: { background: { color: c.background }, textColor: "transparent" },
    });
    seriesRef.current.applyOptions({
      lineColor: c.stroke,
      topColor: withAlpha(c.stroke, 0.18),
      bottomColor: withAlpha(c.stroke, 0),
    });
  }, [up, theme]);

  // Feed data. We don't have real bar timestamps at this layer (Watchlist /
  // DiscoverPage only forward closes), so synthesise sequential daily times
  // ending today — order is what matters, not absolute dates.
  useEffect(() => {
    if (!seriesRef.current) return;
    const t0 = Math.floor(Date.now() / 1000);
    seriesRef.current.setData(
      closes.map((v, i) => ({
        time: (t0 - (closes.length - 1 - i) * 86400) as UTCTimestamp,
        value: v,
      })),
    );
    chartRef.current?.timeScale().fitContent();
  }, [closes]);

  return <div ref={ref} style={{ height, width: "100%" }} />;
}

export function SparkCard({
  symbol,
  name,
  price,
  changePct,
  selected,
  onSelect,
  onRemove,
  isCrypto,
  dense = false,
  compact = false,
  closes,
}: {
  symbol: string;
  name: string;
  price: number;
  changePct: number;
  selected: boolean;
  onSelect: () => void;
  onRemove?: () => void;
  isCrypto?: boolean;
  /** Compact 2-col layout for narrow Workspace docks — drops the sparkline,
   *  name slot, and shrinks fonts so two cards fit in ~180px width. */
  dense?: boolean;
  /** Mid tier between full and dense — keeps the sparkline but shorter
   *  (H=32 instead of 48), drops the name slot. */
  compact?: boolean;
  /** Real recent closes (newest last). When present we render a tiny
   *  lightweight-charts area series for visual parity with the Workspace
   *  Mini chart; otherwise fall back to the symbol-seeded synthetic SVG
   *  so first paint isn't blank while /api/bars/batch is in flight. */
  closes?: number[];
}) {
  const up = changePct >= 0;
  const stroke = up ? "var(--pos)" : "var(--neg)";
  const W = 100;
  const H = compact ? 32 : 48;
  const hasReal = !!closes && closes.length >= 2;
  const { line, area } = sparkPaths(symbol, changePct, W, H);
  const gradId = `spark-${symbol.replace(/[^A-Z0-9]/gi, "")}`;
  return (
    <div
      role="button"
      onClick={onSelect}
      className="group text-left cursor-pointer transition-all relative overflow-hidden bg-panel"
      style={{
        padding: dense ? "8px 10px 8px 10px" : "13px 14px 10px 14px",
        border: `1px solid ${selected ? "var(--accent)" : "var(--border)"}`,
        borderRadius: "var(--r)",
        boxShadow: selected ? "0 0 0 2px var(--accent-bg)" : "none",
        scrollSnapAlign: "start",
      }}
    >
      {onRemove && (
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          aria-label={`Remove ${symbol} from watchlist`}
          className="absolute top-1.5 right-1.5 cursor-pointer border-0 text-[12px] leading-none w-5 h-5 grid place-items-center transition-opacity hover:opacity-100"
          style={{
            background: "var(--panel-2)",
            color: "var(--mute)",
            borderRadius: 4,
            opacity: 0.55,
          }}
        >
          ✕
        </button>
      )}
      <div
        className="font-semibold"
        style={{ fontSize: dense ? 12 : 15, paddingRight: dense ? 16 : 0 }}
      >
        {symbol}
      </div>
      {!dense && !compact && (
        <div
          className="text-[11px] mt-px truncate h-[14px]"
          style={{ color: "var(--mute)" }}
        >
          {name}
        </div>
      )}
      <div
        className="font-mono font-medium tabular-nums"
        style={{ fontSize: dense ? 13 : 16, marginTop: dense ? 2 : 8 }}
      >
        {isCrypto ? fmtCryptoPrice(price) : fmtPrice(price)}
      </div>
      <div
        className="font-mono tabular-nums"
        style={{
          fontSize: dense ? 10.5 : 12,
          marginTop: dense ? 0 : 1,
          color: stroke,
        }}
      >
        {pct(changePct)}
      </div>
      {!dense && (
        <div className="mt-1.5" style={{ height: H }}>
          {hasReal ? (
            <SparkChart closes={closes!} up={up} height={H} />
          ) : (
            <svg
              height={H}
              viewBox={`0 0 ${W} ${H}`}
              preserveAspectRatio="none"
              className="block w-full"
            >
              <defs>
                <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={stroke} stopOpacity={0.12} />
                  <stop offset="100%" stopColor={stroke} stopOpacity={0} />
                </linearGradient>
              </defs>
              <path d={area} fill={`url(#${gradId})`} />
              <path d={line} fill="none" stroke={stroke} strokeWidth={1.5} />
            </svg>
          )}
        </div>
      )}
    </div>
  );
}

export function SparkCardSkeleton() {
  return (
    <div
      className="animate-pulse p-[13px_14px_10px]"
      style={{
        background: "var(--panel)",
        border: "1px solid var(--border)",
        borderRadius: "var(--r)",
      }}
    >
      <div className="h-3 w-12 rounded mb-1.5" style={{ background: "var(--panel-2)" }} />
      <div className="h-2.5 w-20 rounded" style={{ background: "var(--panel-2)" }} />
      <div className="h-4 w-16 rounded mt-2" style={{ background: "var(--panel-2)" }} />
      <div className="h-12 w-full rounded mt-2" style={{ background: "var(--panel-2)" }} />
    </div>
  );
}
