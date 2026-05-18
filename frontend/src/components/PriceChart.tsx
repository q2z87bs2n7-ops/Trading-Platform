import { useEffect, useRef, useState } from "react";
import {
  createChart,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from "lightweight-charts";
import { getBars } from "../api";

const TIMEFRAMES = ["1Min", "5Min", "15Min", "1Hour", "1Day"];

export default function PriceChart({ symbol }: { symbol: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const [timeframe, setTimeframe] = useState("1Day");
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
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
    return () => chart.remove();
  }, []);

  useEffect(() => {
    let alive = true;
    getBars(symbol, timeframe, 200)
      .then((res) => {
        if (!alive || !seriesRef.current) return;
        setErr(null);
        seriesRef.current.setData(
          res.bars.map((b) => ({
            time: b.time as UTCTimestamp,
            open: b.open,
            high: b.high,
            low: b.low,
            close: b.close,
          })),
        );
        chartRef.current?.timeScale().fitContent();
      })
      .catch((e) => alive && setErr(e.message));
    return () => {
      alive = false;
    };
  }, [symbol, timeframe]);

  return (
    <div className="panel">
      <h2 style={{ display: "flex", justifyContent: "space-between" }}>
        <span>{symbol}</span>
        <select
          value={timeframe}
          onChange={(e) => setTimeframe(e.target.value)}
          style={{
            background: "#0e1117",
            color: "#e6edf3",
            border: "1px solid #30363d",
            borderRadius: 4,
          }}
        >
          {TIMEFRAMES.map((tf) => (
            <option key={tf} value={tf}>
              {tf}
            </option>
          ))}
        </select>
      </h2>
      {err && <div className="error">{err}</div>}
      <div className="chart-wrap" ref={containerRef} />
    </div>
  );
}
