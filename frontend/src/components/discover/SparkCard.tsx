import { useEffect, useRef } from "react";
import {
  createChart,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  LineStyle,
  type UTCTimestamp,
} from "lightweight-charts";

import { useTheme } from "../../hooks/useTheme";
import { fmtCryptoPrice, pct } from "../../lib/format";
import { fmtPrice } from "./util";

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

// Resolve any CSS colour (oklch, color(), rgb, named, …) to an rgba string
// with the given alpha. Calm v2 uses oklch() tokens, which getComputedStyle
// may return as `color(srgb …)` or `oklch(…)` depending on browser — the
// previous regex-on-rgb() probe missed both formats and silently returned
// the input at implicit alpha=1, painting the area series at full opacity.
// Canvas fillStyle parses every modern CSS colour and we read it back as
// 8-bit RGB, so the alpha hand-off is exact and format-agnostic.
function withAlpha(color: string, alpha: number): string {
  if (typeof document === "undefined") return color;
  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;
  const ctx = canvas.getContext("2d");
  if (!ctx) return color;
  // Set a known sentinel first; if the browser can't parse `color`, fillStyle
  // stays at the sentinel and we paint that — still a valid rgba string, no
  // accidental opacity=1 fall-through.
  ctx.fillStyle = "#000";
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 1, 1);
  const d = ctx.getImageData(0, 0, 1, 1).data;
  return `rgba(${d[0]}, ${d[1]}, ${d[2]}, ${alpha})`;
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
  // Holds the createPriceLine instance so we can remove it before redrawing
  // when `closes` updates (new prev_close on the next bar).
  const priceLineRef = useRef<IPriceLine | null>(null);
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
      topColor: withAlpha(c.stroke, 0.1),
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
      priceLineRef.current = null;
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
      topColor: withAlpha(c.stroke, 0.1),
      bottomColor: withAlpha(c.stroke, 0),
    });
  }, [up, theme]);

  // Feed data + redraw the prev-close hairline. Horizontal price line at
  // closes[N-2] (yesterday's daily close — the `prev_close` the card's
  // day-% chip is measured against). A horizontal hairline directly shows
  // the baseline: tip above = today up, tip below = today down. Resolve
  // --text-2 through the canvas trick so the token works whether it's
  // oklch / color() / rgb.
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

    if (priceLineRef.current) {
      seriesRef.current.removePriceLine(priceLineRef.current);
      priceLineRef.current = null;
    }
    if (closes.length >= 2) {
      const prevClose = closes[closes.length - 2];
      const cs = getComputedStyle(document.documentElement);
      const muteToken = cs.getPropertyValue("--text-2").trim() || "#828680";
      const mute = withAlpha(muteToken, 0.7);
      priceLineRef.current = seriesRef.current.createPriceLine({
        price: prevClose,
        color: mute,
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: false,
        title: "",
      });
    }
  }, [closes, theme]);

  return <div ref={ref} style={{ height, width: "100%" }} />;
}

export function SparkCard({
  symbol,
  name,
  displayName,
  price,
  changePct,
  selected,
  onSelect,
  onRemove,
  isCrypto,
  dense = false,
  compact = false,
  closes,
  formatPrice,
}: {
  symbol: string;
  name: string;
  /** Optional override for the bold primary label — used by the CFD silo
   *  so stock CFDs show "Fosun Tourism" instead of "1992.hk". The raw
   *  `symbol` is still used for aria-labels and API calls. */
  displayName?: string;
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
  /** Override price formatter — used by the CFD silo so FX pairs render
   *  at 5dp / JPY at 3dp / metals at 4dp / indices at 1dp instead of the
   *  default $-formatted ladder for stocks/crypto. */
  formatPrice?: (n: number) => string;
}) {
  const up = changePct >= 0;
  const stroke = up ? "var(--pos)" : "var(--neg)";
  const H = compact ? 32 : 48;
  const hasReal = !!closes && closes.length >= 2;
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
        {displayName ?? symbol}
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
        {formatPrice
          ? formatPrice(price)
          : isCrypto
            ? fmtCryptoPrice(price)
            : fmtPrice(price)}
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
          {hasReal && <SparkChart closes={closes!} up={up} height={H} />}
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
