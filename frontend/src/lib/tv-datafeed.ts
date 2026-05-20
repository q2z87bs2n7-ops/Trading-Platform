/**
 * TradingView Datafeed adapter — bridges TV's data requests to our FastAPI backend.
 * TV calls these methods; we forward to /api/bars (historical) and the
 * shared SSE stream with `kinds=bar` for real-time 1-minute aggregates.
 * Also implements IDatafeedQuotesApi (getQuotes/subscribeQuotes) so the
 * trading order ticket can display live bid/ask and last price.
 */
import { streamBars, streamQuotes, type BarTick } from "../api";
import type { Quote } from "../types";

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
          supports_quotes: true,
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
          // /api/assets returns a plain array, not { assets: [...] }
          const results = (Array.isArray(data) ? data : []).map((a: { symbol: string; name: string; exchange: string }) => ({
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

    // --- IDatafeedQuotesApi: required by the order ticket panel ---
    // Without these the ticket aborts with "quotesSnapshot/formatter/
    // spreadFormatter not received". TV calls getQuotes once for an
    // initial snapshot, then subscribeQuotes for live updates.
    getQuotes(
      symbols: string[],
      onDataCallback: (data: object[]) => void,
      onErrorCallback: (err: string) => void,
    ) {
      const syms = encodeURIComponent(symbols.join(","));
      Promise.all([
        fetch(`${API_BASE}/api/snapshots?symbols=${syms}`).then((r) => r.json()),
        fetch(`${API_BASE}/api/quotes?symbols=${syms}`).then((r) => r.json()),
      ])
        .then(([snapData, quoteData]) => {
          const snaps: Record<string, Record<string, number | null>> = {};
          for (const s of snapData.snapshots ?? []) {
            snaps[s.symbol] = s;
          }
          const quotes: Record<string, Record<string, number>> = {};
          for (const q of quoteData.quotes ?? []) {
            quotes[q.symbol] = q;
          }
          const out = symbols.map((sym) => {
            const s = snaps[sym] ?? {};
            const q = quotes[sym] ?? {};
            const lp = (s.last_price as number) ?? (q.mid as number) ?? 0;
            const prev = (s.prev_close as number) ?? 0;
            const ch = prev ? lp - prev : 0;
            const chp = prev ? ((lp - prev) / prev) * 100 : 0;
            const bid = (q.bid as number) ?? 0;
            const ask = (q.ask as number) ?? 0;
            return {
              s: "ok",
              n: sym,
              v: {
                ch,
                chp,
                short_name: sym,
                exchange: "NASDAQ",
                description: sym,
                lp,
                ask,
                bid,
                spread: ask && bid ? ask - bid : 0,
                open_price: (s.day_open as number) ?? 0,
                high_price: (s.day_high as number) ?? 0,
                low_price: (s.day_low as number) ?? 0,
                prev_close_price: prev,
                volume: (s.day_volume as number) ?? 0,
              },
            };
          });
          onDataCallback(out);
        })
        .catch((e) => onErrorCallback(String(e)));
    },

    subscribeQuotes(
      symbols: string[],
      _fastSymbols: string[],
      onRealtimeCallback: (data: object[]) => void,
      listenerGUID: string,
    ) {
      const all = Array.from(new Set([...symbols, ..._fastSymbols]));
      const last: Record<string, { bid: number; ask: number; mid: number }> = {};
      const unsubscribe = streamQuotes(
        all,
        (q: Quote) => {
          last[q.symbol] = { bid: q.bid, ask: q.ask, mid: q.mid };
          onRealtimeCallback([
            {
              s: "ok",
              n: q.symbol,
              v: {
                lp: q.mid,
                ask: q.ask,
                bid: q.bid,
                spread: q.ask && q.bid ? q.ask - q.bid : 0,
              },
            },
          ]);
        },
        () => {
          /* stream closed; ticket will keep last-known values */
        },
      );
      (window as unknown as Record<string, unknown>)[`__tv_quotes_${listenerGUID}`] =
        unsubscribe;
    },

    unsubscribeQuotes(listenerGUID: string) {
      const key = `__tv_quotes_${listenerGUID}`;
      const store = window as unknown as Record<string, unknown>;
      const off = store[key] as (() => void) | undefined;
      if (off) {
        off();
        delete store[key];
      }
    },
  };
}
