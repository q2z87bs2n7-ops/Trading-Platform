/**
 * TradingView Datafeed adapter — bridges TV's data requests to our FastAPI backend.
 * TV calls these methods; we forward to /api/bars (historical) and the
 * shared SSE stream with `kinds=bar` for real-time 1-minute aggregates.
 */
import { streamBars, type BarTick } from "../api";

// Strip trailing slash — prevents double-slash when VITE_API_BASE ends with "/"
const API_BASE = (import.meta.env.VITE_API_BASE ?? "").replace(/\/$/, "");

// Map TradingView resolution strings → our backend timeframe strings
const RESOLUTION_MAP: Record<string, string> = {
  "1": "1Min",
  "5": "5Min",
  "15": "15Min",
  "30": "30Min",
  "60": "1Hour",
  "D": "1Day",
  "1D": "1Day",
  "W": "1Week",
  "1W": "1Week",
};

function toBackendTf(resolution: string): string {
  return RESOLUTION_MAP[resolution] ?? "1Day";
}

export function createDatafeed() {
  return {
    onReady(callback: (config: object) => void) {
      setTimeout(() =>
        callback({
          supported_resolutions: ["1", "5", "15", "30", "60", "D", "W"],
          supports_search: true,
          supports_group_request: false,
          supports_marks: false,
          supports_timescale_marks: false,
        }),
      0);
    },

    searchSymbols(
      userInput: string,
      _exchange: string,
      _symbolType: string,
      onResult: (results: object[]) => void,
    ) {
      fetch(`${API_BASE}/api/assets?search=${encodeURIComponent(userInput)}`)
        .then((r) => r.json())
        .then((data) => {
          const results = (data.assets ?? []).map((a: { symbol: string; name: string; exchange: string }) => ({
            symbol: a.symbol,
            full_name: a.symbol,
            description: a.name,
            exchange: a.exchange ?? "NASDAQ",
            type: "stock",
          }));
          onResult(results);
        })
        .catch(() => onResult([]));
    },

    resolveSymbol(
      symbolName: string,
      onResolve: (info: object) => void,
      onError: (err: string) => void,
    ) {
      fetch(`${API_BASE}/api/assets/${encodeURIComponent(symbolName)}`)
        .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
        .then((data) => {
          onResolve({
            name: data.symbol,
            full_name: data.symbol,
            description: data.name ?? data.symbol,
            type: "stock",
            session: "0930-1600",
            timezone: "America/New_York",
            exchange: data.exchange ?? "NASDAQ",
            minmov: 1,
            pricescale: 100,
            has_intraday: true,
            supported_resolutions: ["1", "5", "15", "30", "60", "D", "W"],
            volume_precision: 0,
            data_status: "streaming",
            format: { type: "price", precision: 2 },
          });
        })
        .catch(() => onError(`Symbol ${symbolName} not found`));
    },

    getBars(
      symbolInfo: { name: string },
      resolution: string,
      periodParams: { from: number; to: number; countBack?: number },
      onResult: (bars: object[], meta: { noData: boolean }) => void,
      onError: (err: string) => void,
    ) {
      const tf = toBackendTf(resolution);
      // Backend uses ?symbol=&timeframe=&limit= — no path param, no start/end.
      // Use countBack as the limit when provided; fall back to 300.
      const limit = periodParams.countBack ?? 300;
      const url =
        `${API_BASE}/api/bars` +
        `?symbol=${encodeURIComponent(symbolInfo.name)}&timeframe=${tf}&limit=${limit}`;

      fetch(url)
        .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
        .then((data) => {
          const bars = (data.bars ?? []).map(
            (b: { time: number; open: number; high: number; low: number; close: number; volume: number }) => ({
              time: b.time * 1000, // TV expects milliseconds
              open: b.open,
              high: b.high,
              low: b.low,
              close: b.close,
              volume: b.volume ?? 0,
            }),
          );
          onResult(bars, { noData: bars.length === 0 });
        })
        .catch((e) => onError(String(e)));
    },

    subscribeBars(
      symbolInfo: { name: string },
      _resolution: string,
      onTick: (bar: object) => void,
      subscriberUID: string,
    ) {
      // Real-time OHLCV from Alpaca's `subscribe_bars` via the shared SSE
      // stream (kinds=bar). One 1-minute bar per minute per symbol; TV
      // happily merges that into whatever chart resolution it's showing.
      const unsubscribe = streamBars(
        [symbolInfo.name],
        (b: BarTick) => {
          if (b.symbol !== symbolInfo.name) return;
          onTick({
            time: b.time * 1000, // TV expects milliseconds
            open: b.open,
            high: b.high,
            low: b.low,
            close: b.close,
            volume: b.volume,
          });
        },
        () => {
          /* upstream closed; TV will keep its last-known bar until the
             next getBars refresh. */
        },
      );
      (window as unknown as Record<string, unknown>)[`__tv_bars_${subscriberUID}`] =
        unsubscribe;
    },

    unsubscribeBars(subscriberUID: string) {
      const key = `__tv_bars_${subscriberUID}`;
      const store = window as unknown as Record<string, unknown>;
      const off = store[key] as (() => void) | undefined;
      if (off) {
        off();
        delete store[key];
      }
    },
  };
}
