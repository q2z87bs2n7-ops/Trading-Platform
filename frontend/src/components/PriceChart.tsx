import { useEffect, useRef, useState } from "react";
import {
  createChart,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from "lightweight-charts";

import { useAsset, useBars } from "../data/hooks";
import { useLiveQuotes } from "../data/useLiveQuotes";
import { useTheme } from "../hooks/useTheme";
import ErrorBanner from "./ErrorBanner";
import Pill from "./Pill";

const money = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD" });

// Pull chart chrome colours from the active Calm theme tokens so the
// canvas tracks light/dark (and any future token tweaks). Candle up/down
// colours stay the conventional teal/red — they read on both themes.
function readChartColors() {
  const cs = getComputedStyle(document.documentElement);
  const v = (name: string, fallback: string) =>
    cs.getPropertyValue(name).trim() || fallback;
  return {
    background: v("--panel", "#ffffff"),
    text: v("--mute", "#828680"),
    grid: v("--border", "#dcd9d4"),
  };
}

const TIMEFRAMES = [
  { value: "1Min", label: "1m" },
  { value: "5Min", label: "5m" },
  { value: "15Min", label: "15m" },
  { value: "1Hour", label: "1H" },
  { value: "1Day", label: "1D" },
];

export default function PriceChart({
  symbol,
  responsive = false,
}: {
  symbol: string;
  responsive?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const sparkRef = useRef<ISeriesApi<"Area"> | null>(null);
  const [timeframe, setTimeframe] = useState("1Day");
  // Responsive size tier (Workspace mini chart only). "full" is the unchanged
  // Discover presentation; smaller tiers shed chrome + chart axes to fit, and
  // "spark" swaps the candles for a bare close-price sparkline.
  const [tier, setTier] = useState<"full" | "compact" | "mini" | "spark">("full");

  const { data, error } = useBars(symbol, timeframe);
  // Day Δ% always derives from 1Day bars so it works regardless of the
  // user's chart timeframe selection. React Query dedupes when the chart
  // is already on 1Day (same query key).
  const { data: dailyBars } = useBars(symbol, "1Day");
  const { data: asset } = useAsset(symbol);
  const { quotes } = useLiveQuotes(symbol ? [symbol] : []);
  const { theme } = useTheme();

  // Last price prefers the live quote; falls back to the most recent bar
  // close if the stream/polling hasn't resolved yet.
  const lastPrice =
    quotes[symbol]?.mid ?? data?.bars[data.bars.length - 1]?.close;
  const prevDailyClose =
    dailyBars?.bars && dailyBars.bars.length >= 2
      ? dailyBars.bars[dailyBars.bars.length - 2].close
      : undefined;
  const dayPct =
    lastPrice != null && prevDailyClose != null
      ? (lastPrice - prevDailyClose) / prevDailyClose
      : null;
  const dayUp = dayPct !== null && dayPct >= 0;

  // Init runs when the chart-panel JSX mounts the container div. On the
  // initial app load `selected` is "" so PriceChart returns the empty-state
  // branch and containerRef is null; once the watchlist resolves and a
  // symbol is selected, this effect re-runs against the now-attached div
  // and creates the chart exactly once.
  useEffect(() => {
    if (!symbol || !containerRef.current || chartRef.current) return;
    const c = readChartColors();
    const chart = createChart(containerRef.current, {
      layout: { background: { color: c.background }, textColor: c.text },
      grid: {
        vertLines: { color: c.grid },
        horzLines: { color: c.grid },
      },
      autoSize: true,
      timeScale: { timeVisible: true },
    });
    const series = chart.addCandlestickSeries({
      upColor: "#26a69a",
      downColor: "#ef5350",
      wickUpColor: "#26a69a",
      wickDownColor: "#ef5350",
      borderVisible: false,
    });
    chartRef.current = chart;
    seriesRef.current = series;
  }, [symbol]);

  // Teardown only on component unmount, not on every symbol change —
  // symbol switches reuse the same chart instance (data is swapped via
  // the [data] effect below).
  useEffect(() => {
    return () => {
      chartRef.current?.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, []);

  // Re-skin the existing chart on theme toggle — it's created once and
  // reused across symbol changes, so colours must be applied in place.
  useEffect(() => {
    if (!chartRef.current) return;
    const c = readChartColors();
    chartRef.current.applyOptions({
      layout: { background: { color: c.background }, textColor: c.text },
      grid: {
        vertLines: { color: c.grid },
        horzLines: { color: c.grid },
      },
    });
  }, [theme]);

  // Drive the size tier off the panel's own dimensions (not the viewport), so
  // each docked mini chart adapts independently. Off in non-responsive mode.
  useEffect(() => {
    if (!responsive || !rootRef.current) return;
    const el = rootRef.current;
    const compute = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (w === 0 && h === 0) return;
      const next =
        h < 120 || w < 180
          ? "spark"
          : h < 210 || w < 240
            ? "mini"
            : h < 320 || w < 340
              ? "compact"
              : "full";
      setTier((prev) => (prev === next ? prev : next));
    };
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(el);
    return () => ro.disconnect();
  }, [responsive]);

  // Hide the grid (compact) and the time axis (mini) to maximise the plot area;
  // the price axis stays so the current level is always readable. At "spark"
  // both axes are hidden for a chrome-free sparkline.
  useEffect(() => {
    if (!responsive || !chartRef.current) return;
    const showGrid = tier === "full";
    const isSpark = tier === "spark";
    chartRef.current.applyOptions({
      grid: {
        vertLines: { visible: showGrid },
        horzLines: { visible: showGrid },
      },
      timeScale: { visible: tier !== "mini" && !isSpark },
      rightPriceScale: { visible: !isSpark },
    });
    chartRef.current.timeScale().fitContent();
  }, [responsive, tier]);

  // Swap candlesticks ↔ a bare close-price area sparkline at the "spark" tier.
  // Responsive-only; Discover always keeps candles. The chart is created once,
  // so the series is swapped in place here and re-fed the current bars (the
  // [data] effect below only fires on data changes, not tier changes).
  useEffect(() => {
    const chart = chartRef.current;
    if (!responsive || !chart) return;
    const wantSpark = tier === "spark";
    if (wantSpark === !!sparkRef.current) return;

    if (wantSpark) {
      if (seriesRef.current) {
        chart.removeSeries(seriesRef.current);
        seriesRef.current = null;
      }
      sparkRef.current = chart.addAreaSeries({
        lineColor: "#26a69a",
        topColor: "rgba(38,166,154,0.25)",
        bottomColor: "rgba(38,166,154,0.0)",
        lineWidth: 2,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      });
    } else {
      if (sparkRef.current) {
        chart.removeSeries(sparkRef.current);
        sparkRef.current = null;
      }
      seriesRef.current = chart.addCandlestickSeries({
        upColor: "#26a69a",
        downColor: "#ef5350",
        wickUpColor: "#26a69a",
        wickDownColor: "#ef5350",
        borderVisible: false,
      });
    }

    if (data) {
      if (sparkRef.current) {
        sparkRef.current.setData(
          data.bars.map((b) => ({
            time: b.time as UTCTimestamp,
            value: b.close,
          })),
        );
      } else if (seriesRef.current) {
        seriesRef.current.setData(
          data.bars.map((b) => ({
            time: b.time as UTCTimestamp,
            open: b.open,
            high: b.high,
            low: b.low,
            close: b.close,
          })),
        );
      }
      chart.priceScale("right").applyOptions({ autoScale: true });
      chart.timeScale().resetTimeScale();
      chart.timeScale().fitContent();
    }
  }, [responsive, tier, data]);

  useEffect(() => {
    if (!data) return;
    if (sparkRef.current) {
      sparkRef.current.setData(
        data.bars.map((b) => ({
          time: b.time as UTCTimestamp,
          value: b.close,
        })),
      );
    } else if (seriesRef.current) {
      seriesRef.current.setData(
        data.bars.map((b) => ({
          time: b.time as UTCTimestamp,
          open: b.open,
          high: b.high,
          low: b.low,
          close: b.close,
        })),
      );
    } else {
      return;
    }
    // setData replaces bars but lightweight-charts retains the user's
    // prior pan/zoom on both axes. Without explicit resets, switching
    // from AAPL (zoomed in) to NVDA leaves the camera pointed at the
    // old visible range, often outside NVDA's price/time domain.
    chartRef.current
      ?.priceScale("right")
      .applyOptions({ autoScale: true });
    chartRef.current?.timeScale().resetTimeScale();
    chartRef.current?.timeScale().fitContent();
  }, [data]);

  // Empty state — workspace shows a placeholder so the layout doesn't
  // collapse before the user picks a symbol.
  if (!symbol) {
    return (
      <div className="bg-panel border border-border rounded-lg p-3 flex-1 flex items-center justify-center text-xs text-muted">
        Select a symbol from the watchlist
      </div>
    );
  }

  return (
    <div
      ref={rootRef}
      className={
        responsive
          ? "flex-1 flex flex-col min-h-0 p-2"
          : "bg-panel border border-border rounded-lg p-3 flex-1 flex flex-col"
      }
    >
      {/* Header row 1: symbol/name/last/Δ% on the left, timeframe pills on the
          right. Hidden entirely at the spark tier for a chrome-free sparkline. */}
      {tier !== "spark" && (
      <div className="flex items-baseline justify-between gap-3 mb-1 flex-wrap">
        <div className="flex items-baseline gap-3 flex-wrap">
          <strong className="text-[16px]">{symbol}</strong>
          {asset && tier === "full" && (
            <span className="text-muted text-[13px]">{asset.name}</span>
          )}
          {lastPrice != null && (
            <span className="text-[16px] font-semibold tabular-nums">
              {money(lastPrice)}
            </span>
          )}
          {dayPct !== null && (
            <span
              className="text-[13px] tabular-nums"
              style={{ color: dayUp ? "var(--green)" : "var(--red)" }}
            >
              {dayUp ? "+" : ""}
              {(dayPct * 100).toFixed(2)}%
            </span>
          )}
        </div>
        {tier !== "mini" && (
        <div className="flex gap-1" role="tablist" aria-label="Chart timeframe">
          {TIMEFRAMES.map((tf) => (
            <button
              key={tf.value}
              type="button"
              role="tab"
              aria-selected={timeframe === tf.value}
              onClick={() => setTimeframe(tf.value)}
              className={`btn btn-mini${timeframe === tf.value ? " active" : ""}`}
              style={{ opacity: timeframe === tf.value ? 1 : 0.5 }}
            >
              {tf.label}
            </button>
          ))}
        </div>
        )}
      </div>
      )}

      {/* Attribute chips (replaces standalone InstrumentInfo card) */}
      {asset && tier === "full" && (
        <div className="flex items-center gap-2 text-xs text-muted mb-2 flex-wrap">
          {/* Crypto's pseudo-exchange is "CRYPTO", which would duplicate the
              asset-class pill below — show it only for real exchanges. */}
          {asset.exchange && asset.exchange !== "CRYPTO" && (
            <span>{asset.exchange}</span>
          )}
          <Pill status={asset.asset_class} tone="neutral" />
          {asset.tradable && (
            <>
              <span>·</span>
              <span>tradable</span>
            </>
          )}
          {asset.shortable && (
            <>
              <span>·</span>
              <span>shortable</span>
            </>
          )}
          {asset.fractionable && (
            <>
              <span>·</span>
              <span>fractional</span>
            </>
          )}
        </div>
      )}

      {error && <ErrorBanner message={error.message} />}

      {/* Flex-1 so the canvas fills whatever height the sidebar sets. */}
      <div
        ref={containerRef}
        className="flex-1 min-h-0"
        style={{ minHeight: responsive ? 0 : 240 }}
      />
    </div>
  );
}
