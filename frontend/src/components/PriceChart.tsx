import { useEffect, useRef, useState } from "react";
import {
  createChart,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from "lightweight-charts";

import { useAsset, useBars } from "../data/hooks";
import { useLiveQuotes } from "../data/useLiveQuotes";
import ErrorBanner from "./ErrorBanner";
import Pill from "./Pill";

const money = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD" });

const TIMEFRAMES = [
  { value: "1Min", label: "1m" },
  { value: "5Min", label: "5m" },
  { value: "15Min", label: "15m" },
  { value: "1Hour", label: "1H" },
  { value: "1Day", label: "1D" },
];

export default function PriceChart({ symbol }: { symbol: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const [timeframe, setTimeframe] = useState("1Day");

  const { data, error } = useBars(symbol, timeframe);
  // Day Δ% always derives from 1Day bars so it works regardless of the
  // user's chart timeframe selection. React Query dedupes when the chart
  // is already on 1Day (same query key).
  const { data: dailyBars } = useBars(symbol, "1Day");
  const { data: asset } = useAsset(symbol);
  const { quotes } = useLiveQuotes(symbol ? [symbol] : []);

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
    const chart = createChart(containerRef.current, {
      layout: { background: { color: "#161b22" }, textColor: "#8b949e" },
      grid: {
        vertLines: { color: "#21262d" },
        horzLines: { color: "#21262d" },
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

  useEffect(() => {
    if (!data || !seriesRef.current) return;
    seriesRef.current.setData(
      data.bars.map((b) => ({
        time: b.time as UTCTimestamp,
        open: b.open,
        high: b.high,
        low: b.low,
        close: b.close,
      })),
    );
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
    <div className="bg-panel border border-border rounded-lg p-3 flex-1 flex flex-col">
      {/* Header row 1: symbol/name/last/Δ% on the left, timeframe pills on the right */}
      <div className="flex items-baseline justify-between gap-3 mb-1 flex-wrap">
        <div className="flex items-baseline gap-3 flex-wrap">
          <strong className="text-[16px]">{symbol}</strong>
          {asset && (
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
      </div>

      {/* Attribute chips (replaces standalone InstrumentInfo card) */}
      {asset && (
        <div className="flex items-center gap-2 text-xs text-muted mb-2 flex-wrap">
          <span>{asset.exchange}</span>
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
      <div ref={containerRef} className="flex-1 min-h-0" style={{ minHeight: 240 }} />
    </div>
  );
}
