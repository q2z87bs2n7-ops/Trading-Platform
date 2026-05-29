import { useEffect, useMemo, useRef, useState } from "react";
import {
  createChart,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type UTCTimestamp,
  LineStyle,
} from "lightweight-charts";

import { useFxcmBars, useFxcmDisplayNames } from "../data/hooks";
import { useTheme } from "../hooks/useTheme";
import { useFxcmView } from "../lib/fxcm-view";
import { cfdDigits } from "../lib/format";
import type { FxcmBar, FxcmPrice } from "../types";
import ErrorBanner from "./ErrorBanner";

// Mirror of PriceChart for the CFD silo. Pulls candles from /api/fxcm/history
// and a live tip from the parent's /api/fxcm/prices poll (passed as
// `livePrice`). Sibling rather than a branch inside PriceChart because the
// data shapes, formatting (5dp / 3dp JPY / metals 4dp / indices 1dp), and
// hooks are all different, and PriceChart already carries the Workspace
// `responsive` tier branches.

// Rollover / dividend financing values from the bridge (per the FClite
// Instrument). Units are the SDK's convention (refine labels once we read real
// demo numbers); shown signed, coloured by credit (+) vs debit (−).
function fmtFin(n: number | undefined): string {
  if (n == null || Number.isNaN(n)) return "—";
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}`;
}
function rollColor(n: number | undefined): string {
  if (n == null || n === 0) return "var(--mute)";
  return n > 0 ? "var(--pos)" : "var(--neg)";
}

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

// TV display labels → FXCM bridge timeframe ids. Pills mirror the stocks
// PriceChart set (1m / 5m / 15m / 1H / 1D) so the two pages read alike.
const TIMEFRAMES = [
  { value: "m1", label: "1m" },
  { value: "m5", label: "5m" },
  { value: "m15", label: "15m" },
  { value: "H1", label: "1H" },
  { value: "D1", label: "1D" },
];

// The bridge sends `time` as a naive ISO string (no zone) — treat as UTC
// epoch seconds for lightweight-charts.
function isoToEpochSec(iso: string): number {
  const ms = Date.parse(iso.endsWith("Z") ? iso : `${iso}Z`);
  return Math.floor(ms / 1000);
}

export default function CfdPriceChart({
  instrument,
  livePrice,
  onOpenChart,
  defaultTimeframe,
  barsToShow,
  entryLine,
}: {
  instrument: string;
  // Optional — the parent CfdDiscoverPage already polls /api/fxcm/prices and
  // can pass the row for this instrument straight through.
  livePrice?: FxcmPrice;
  onOpenChart?: () => void;
  // Additive, default-off presets for the Scalp surface. `defaultTimeframe`
  // opens on a small frame (e.g. "m1"); `barsToShow` zooms to the most recent
  // N bars instead of fit-to-content. Other callers keep the H1 / fit defaults.
  defaultTimeframe?: string;
  barsToShow?: number;
  // Optional dashed price line at a position's net average entry (Scalp).
  // `side` colours it long (pos) / short (neg). Null/absent = no line.
  entryLine?: { price: number; side: "B" | "S" } | null;
}) {
  // Keep the charted instrument subscribed (status T) for the live-tip price.
  useFxcmView(instrument);

  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const entryLineRef = useRef<IPriceLine | null>(null);
  const [timeframe, setTimeframe] = useState(defaultTimeframe ?? "H1");
  const { theme } = useTheme();

  const { data: bars, error, isPending } = useFxcmBars(instrument, timeframe);
  // Day Δ% always derives from D1 bars so it works regardless of the
  // chart timeframe; React Query dedupes when the chart is already on D1.
  const { data: dailyBars } = useFxcmBars(instrument, "D1");
  const dn = useFxcmDisplayNames();

  const digits = livePrice?.digits ?? cfdDigits(instrument);
  const fmt = (n: number | undefined | null) =>
    n == null || isNaN(n) ? "—" : n.toFixed(digits);

  // Live mid prefers the parent's polled price; falls back to last bar close.
  const liveMid = useMemo(() => {
    if (livePrice) {
      const bid = livePrice.bid ?? 0;
      const ask = livePrice.ask ?? 0;
      if (bid && ask) return (bid + ask) / 2;
      if (bid || ask) return bid || ask;
    }
    return bars && bars.length > 0 ? bars[bars.length - 1].close : undefined;
  }, [livePrice, bars]);

  const prevDailyClose =
    dailyBars && dailyBars.length >= 2
      ? dailyBars[dailyBars.length - 2].close
      : undefined;
  const dayPct =
    liveMid != null && prevDailyClose != null && prevDailyClose > 0
      ? (liveMid - prevDailyClose) / prevDailyClose
      : null;
  const dayUp = dayPct !== null && dayPct >= 0;

  // Create the chart once on mount (with a real instrument), reuse across
  // instrument/timeframe changes.
  useEffect(() => {
    if (!instrument || !containerRef.current || chartRef.current) return;
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
      priceFormat: { type: "price", precision: digits, minMove: 1 / 10 ** digits },
    });
    chartRef.current = chart;
    seriesRef.current = series;
  }, [instrument, digits]);

  useEffect(() => {
    return () => {
      chartRef.current?.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, []);

  // Adjust the candle precision when switching to an instrument with a
  // different digit count (5dp pair → 3dp JPY → 1dp index, …).
  useEffect(() => {
    if (!seriesRef.current) return;
    seriesRef.current.applyOptions({
      priceFormat: { type: "price", precision: digits, minMove: 1 / 10 ** digits },
    });
  }, [digits]);

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

  useEffect(() => {
    if (!bars || !seriesRef.current) return;
    const rows = (bars as FxcmBar[])
      .map((b) => ({
        time: isoToEpochSec(b.time) as UTCTimestamp,
        open: b.open,
        high: b.high,
        low: b.low,
        close: b.close,
      }))
      // Bridge sometimes emits same-timestamp dupes at session edges; LWC
      // rejects unsorted/duplicate timestamps with a hard throw.
      .filter((b, i, arr) => i === 0 || b.time > arr[i - 1].time);
    seriesRef.current.setData(rows);
    chartRef.current?.priceScale("right").applyOptions({ autoScale: true });
    chartRef.current?.timeScale().resetTimeScale();
    if (barsToShow && rows.length > barsToShow) {
      // Zoom to the most recent N bars (scalping preset) instead of showing
      // the whole window; +2 leaves a little right-edge breathing room.
      chartRef.current?.timeScale().setVisibleLogicalRange({
        from: rows.length - barsToShow,
        to: rows.length + 2,
      });
    } else {
      chartRef.current?.timeScale().fitContent();
    }
  }, [bars, barsToShow]);

  // Dashed entry line at the position's net average (Scalp). Re-runs on
  // entry/side/theme change and after bars load (series is ready by then).
  useEffect(() => {
    const series = seriesRef.current;
    if (!series) return;
    if (entryLineRef.current) {
      series.removePriceLine(entryLineRef.current);
      entryLineRef.current = null;
    }
    if (entryLine && entryLine.price > 0) {
      const cs = getComputedStyle(document.documentElement);
      const token = entryLine.side === "B" ? "--pos" : "--neg";
      const color =
        cs.getPropertyValue(token).trim() || (entryLine.side === "B" ? "#26a69a" : "#ef5350");
      entryLineRef.current = series.createPriceLine({
        price: entryLine.price,
        color,
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: entryLine.side === "B" ? "Long" : "Short",
      });
    }
  }, [entryLine?.price, entryLine?.side, theme, bars]);

  if (!instrument) {
    return (
      <div
        className="grid place-items-center text-[13px]"
        style={{ color: "var(--mute)", height: 280 }}
      >
        Pick an instrument from the watchlist.
      </div>
    );
  }

  return (
    <div className="bg-panel border border-border rounded-lg p-3 flex-1 flex flex-col">
      <div className="flex items-baseline justify-between gap-3 mb-1 flex-wrap">
        <div className="flex items-baseline gap-3 flex-wrap">
          <strong className="text-[16px]">{dn(instrument)}</strong>
          {dn(instrument) !== instrument && (
            <span className="text-[13px]" style={{ color: "var(--mute)" }}>{instrument}</span>
          )}
          {liveMid != null && (
            <span className="text-[16px] font-semibold tabular-nums">
              {fmt(liveMid)}
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
        <div className="flex items-center gap-1" role="tablist" aria-label="Chart timeframe">
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
          {onOpenChart && (
            <button
              type="button"
              onClick={onOpenChart}
              className="btn btn-mini ml-1"
              title="Open in Chart mode"
            >
              Open ↗
            </button>
          )}
        </div>
      </div>

      {/* Rollover (every instrument) + Dividend (index / single-share-ETF CFDs
         only — the bridge emits it via hasDividend*). Long & short values,
         coloured by sign (credit = +, debit = −). Replaces the old
         Bid/Ask/Spread chips (those live in the rate matrix + deal strip). */}
      {livePrice && (
        <div className="flex items-center gap-2 text-xs text-muted mb-2 flex-wrap">
          <span>
            Roll{" "}
            <span style={{ color: rollColor(livePrice.rollover_buy) }}>L {fmtFin(livePrice.rollover_buy)}</span>
            {" / "}
            <span style={{ color: rollColor(livePrice.rollover_sell) }}>S {fmtFin(livePrice.rollover_sell)}</span>
          </span>
          {(livePrice.dividend_buy != null || livePrice.dividend_sell != null) && (
            <>
              <span>·</span>
              <span>
                Div{" "}
                <span style={{ color: rollColor(livePrice.dividend_buy) }}>L {fmtFin(livePrice.dividend_buy)}</span>
                {" / "}
                <span style={{ color: rollColor(livePrice.dividend_sell) }}>S {fmtFin(livePrice.dividend_sell)}</span>
              </span>
            </>
          )}
          {livePrice.high != null && livePrice.low != null && (
            <>
              <span>·</span>
              <span>
                D-High {fmt(livePrice.high)} / D-Low {fmt(livePrice.low)}
              </span>
            </>
          )}
        </div>
      )}

      {error && <ErrorBanner message={(error as Error).message} />}

      <div
        ref={containerRef}
        className="flex-1 min-h-0"
        style={{ minHeight: 240 }}
      />

      {isPending && !bars && (
        <div className="text-[12px] mt-1" style={{ color: "var(--mute)" }}>
          Loading bars…
        </div>
      )}
    </div>
  );
}
