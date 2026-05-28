import { useMemo } from "react";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import * as api from "../api";
import { isCryptoOrder, isCryptoPosition } from "../lib/asset-class";
import type { ReplaceOrderInput, SubmitOrderInput } from "../types";
import { qk } from "./queryClient";

// --- Reads ---------------------------------------------------------------
// `refetchInterval`s preserve each component's prior poll cadence so the
// data-layer migration does not regress auto-refresh.

export const useConfig = () =>
  useQuery({
    queryKey: qk.config,
    queryFn: api.getConfig,
    staleTime: Infinity,
  });

// App version + maintenance/force-stop switches. Doesn't need a tight poll:
// check on mount, on window focus (instant for active users, free), and a slow
// 5-min interval that tightens to 30s while in graceful maintenance so recovery
// is prompt. `enabled` is set false by the caller once force_stop is seen, which
// halts ALL polling (no interval, no focus refetch) — the terminal boot.
export const useAppStatus = (enabled = true) =>
  useQuery({
    queryKey: qk.status,
    queryFn: api.getStatus,
    enabled,
    refetchOnWindowFocus: enabled,
    staleTime: 0,
    refetchInterval: (q) => (q.state.data?.maintenance ? 30_000 : 300_000),
  });

export const useAccount = () =>
  useQuery({
    queryKey: qk.account,
    queryFn: api.getAccount,
    refetchInterval: 15000,
  });

export const usePositions = () =>
  useQuery({
    queryKey: qk.positions,
    queryFn: api.getPositions,
    refetchInterval: 15000,
  });

// FXCM account/positions for the splash card. Polled gently — the splash is
// a transient overlay, not a constantly-mounted surface, and CfdDiscoverPage
// owns the fast (3s) loop when the silo is active.
export const useFxcmAccount = (enabled = true) =>
  useQuery({
    queryKey: qk.fxcmAccount,
    queryFn: api.getFxcmAccount,
    refetchInterval: 30_000,
    retry: 0, // bridge offline returns 503; don't hammer it
    enabled,
  });

export const useFxcmPositions = (enabled = true) =>
  useQuery({
    queryKey: qk.fxcmPositions,
    queryFn: api.getFxcmPositions,
    refetchInterval: 30_000,
    retry: 0,
    enabled,
  });

// All FXCM offer prices (bid/ask/high/low + display metadata) for the CFD
// silo's TradeBar live tip and the OrderSheet's instrument picker. 3 s poll
// matches CfdDiscoverPage's existing cadence; React Query dedupes both
// callers automatically.
export const useFxcmPrices = (enabled = true) =>
  useQuery({
    queryKey: qk.fxcmPrices,
    queryFn: () => api.getFxcmPrices(),
    refetchInterval: 3000,
    retry: 0,
    enabled,
  });

export const useFxcmOrders = (enabled = true) =>
  useQuery({
    queryKey: qk.fxcmOrders,
    queryFn: api.getFxcmOrders,
    refetchInterval: 15_000,
    retry: 0,
    enabled,
  });

export const useFxcmClosedTrades = (enabled = true) =>
  useQuery({
    queryKey: qk.fxcmClosedTrades,
    queryFn: api.getFxcmClosedTrades,
    refetchInterval: 30_000,
    retry: 0,
    enabled,
  });

function useFxcmTradeInvalidation() {
  const qc = useQueryClient();
  return (
    keys: readonly (readonly string[])[] = [
      qk.fxcmOrders,
      qk.fxcmPositions,
      qk.fxcmAccount,
      qk.fxcmClosedTrades,
    ],
  ) => {
    keys.forEach((k) => qc.invalidateQueries({ queryKey: k }));
  };
}

export function useFxcmSubmitOrder() {
  const invalidate = useFxcmTradeInvalidation();
  return useMutation({
    mutationFn: (order: api.FxcmOrderRequest) => api.submitFxcmOrder(order),
    onSuccess: () =>
      invalidate([qk.fxcmOrders, qk.fxcmPositions, qk.fxcmAccount]),
  });
}

export function useFxcmCancelOrder() {
  const invalidate = useFxcmTradeInvalidation();
  return useMutation({
    mutationFn: (orderId: string) => api.cancelFxcmOrder(orderId),
    onSuccess: () => invalidate([qk.fxcmOrders, qk.fxcmAccount]),
  });
}

export function useFxcmModifyOrder() {
  const invalidate = useFxcmTradeInvalidation();
  return useMutation({
    mutationFn: (v: {
      id: string;
      body: { rate?: number; stop?: number; limit?: number };
    }) => api.modifyFxcmOrder(v.id, v.body),
    onSuccess: () => invalidate([qk.fxcmOrders, qk.fxcmAccount]),
  });
}

// FXCM watchlist — proxies to the Endpoints-suite per-user watchlist.
// 3 s refetch mirrors the CfdDiscoverPage cadence so live bid/ask stays
// fresh; the server already pulls the latest /prices on each call.
export const useFxcmWatchlistQuery = (enabled = true) =>
  useQuery({
    queryKey: qk.fxcmWatchlist,
    queryFn: api.getFxcmWatchlist,
    refetchInterval: 3000,
    retry: 0,
    enabled,
  });

export function useFxcmWatchlistAdd() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (instrument: string) => api.addFxcmWatchlistInstrument(instrument),
    onSuccess: (data) => {
      // Server returns the updated, enriched watchlist — seed the cache
      // so the UI doesn't blink while the next refetch runs.
      qc.setQueryData(qk.fxcmWatchlist, data);
    },
  });
}

export function useFxcmWatchlistRemove() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (instrument: string) => api.removeFxcmWatchlistInstrument(instrument),
    onSuccess: (data) => {
      qc.setQueryData(qk.fxcmWatchlist, data);
    },
  });
}

export function useFxcmClosePosition() {
  const invalidate = useFxcmTradeInvalidation();
  return useMutation({
    mutationFn: (v: { tradeId: string | number; amount?: number }) =>
      api.closeFxcmPosition(v.tradeId, v.amount ?? 0),
    onSuccess: () =>
      invalidate([qk.fxcmPositions, qk.fxcmAccount, qk.fxcmClosedTrades]),
  });
}

// Full FXCM instrument list. Long stale window — the universe rarely changes;
// the classifier boot effect already fetches once for symbol classification,
// this hook lets downstream surfaces (economic-calendar country filter, search)
// share the same cache.
// FXCM history bars for the CFD Discover inline chart. The bridge has no
// SSE bar stream, so a 60s refetch keeps the chart fresh on intraday
// timeframes; the live tip rides the parent's /api/fxcm/prices poll. The
// bridge requires explicit `from`/`to` dates (TV datafeed already passes
// them) — pick a window that yields ~200–400 bars per timeframe so the
// chart has enough scrollback without bloating the response.
const FXCM_WINDOW_DAYS: Record<string, number> = {
  m1: 2,
  m5: 7,
  m15: 14,
  m30: 21,
  H1: 60,
  H4: 180,
  D1: 365 * 2,
  W1: 365 * 5,
};

function fxcmHistoryWindow(timeframe: string): { from: string; to: string } {
  const days = FXCM_WINDOW_DAYS[timeframe] ?? 60;
  const to = new Date();
  const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { from: iso(from), to: iso(to) };
}

export const useFxcmBars = (
  instrument: string,
  timeframe: string,
  enabled = true,
) =>
  useQuery({
    queryKey: qk.fxcmHistory(instrument, timeframe),
    queryFn: () => {
      const { from, to } = fxcmHistoryWindow(timeframe);
      return api.getFxcmHistory(instrument, timeframe, from, to);
    },
    enabled: enabled && !!instrument,
    refetchInterval: timeframe === "D1" || timeframe === "W1" ? 5 * 60_000 : 60_000,
    retry: 0,
  });

export const useFxcmInstruments = (enabled = true) =>
  useQuery({
    queryKey: qk.fxcmInstruments,
    queryFn: () => api.getFxcmInstruments(),
    staleTime: 60 * 60_000, // 1h
    retry: 0,
    enabled,
  });

export const useOrders = (status = "all", limit = 25) =>
  useQuery({
    queryKey: qk.orders(status, limit),
    queryFn: () => api.getOrders(status, limit),
    refetchInterval: 20000,
  });

export const useClock = () =>
  useQuery({
    queryKey: qk.clock,
    queryFn: api.getClock,
    refetchInterval: 30000,
  });

export const useActivities = (limit = 25) =>
  useQuery({
    queryKey: qk.activities(limit),
    queryFn: () => api.getActivities(limit),
    refetchInterval: 30000,
  });

export const useBars = (symbol: string, timeframe: string, limit = 200) =>
  useQuery({
    queryKey: qk.bars(symbol, timeframe),
    queryFn: () => api.getBars(symbol, timeframe, limit),
    enabled: symbol.length > 0,
  });

// Single-call batch for the watchlist sparklines. Daily closes are
// slow-moving so a 5-min refetch is plenty.
export const useBarsBatch = (
  symbols: string[],
  timeframe: string = "1Day",
  limit = 30,
) =>
  useQuery({
    queryKey: qk.barsBatch(symbols, timeframe),
    queryFn: () => api.getBarsBatch(symbols, timeframe, limit),
    enabled: symbols.length > 0,
    refetchInterval: 300_000,
    staleTime: 120_000,
  });

// Single-call replacement for the watchlist's N parallel useBars(sym,
// "1Day") mount burst. Snapshots are slower-moving than quotes (daily
// bar + prev close stay stable), so 60s refetch is plenty.
export const useSnapshots = (symbols: string[]) =>
  useQuery({
    queryKey: qk.snapshots(symbols),
    queryFn: () => api.getSnapshots(symbols),
    enabled: symbols.length > 0,
    refetchInterval: 60000,
    staleTime: 30000,
  });

export const useMovers = (top = 10, enabled = true) =>
  useQuery({
    queryKey: qk.movers(top),
    queryFn: () => api.getMovers(top),
    refetchInterval: 60000,
    enabled,
  });

export const useMostActive = (top = 10, by = "volume", enabled = true) =>
  useQuery({
    queryKey: qk.mostActive(top, by),
    queryFn: () => api.getMostActive(top, by),
    refetchInterval: 60000,
    enabled,
  });

export const useMarketNews = (limit = 20, enabled = true) =>
  useQuery({
    queryKey: qk.marketNews,
    queryFn: () => api.getMarketNews(limit),
    refetchInterval: 300_000, // 5 min — matches backend cache TTL
    staleTime: 120_000,
    enabled,
  });

export const useNews = (symbol: string, limit = 10, enabled = true) =>
  useQuery({
    queryKey: qk.news(symbol),
    queryFn: () => api.getNews(symbol, limit),
    enabled: enabled && symbol.length > 0,
    staleTime: 120_000,
  });

export const useIndices = (enabled = true) =>
  useQuery({
    queryKey: qk.indices,
    queryFn: api.getIndices,
    refetchInterval: 120_000,
    staleTime: 60_000,
    enabled,
  });

// Stock symbols the user holds / has working orders on / watches — always kept
// in the curated earnings calendar regardless of market cap. Crypto is excluded
// (no earnings). Deduped + sorted so the query key is stable.
const useEarningsIncludeSymbols = (): string[] => {
  const positions = usePositions();
  const orders = useOrders();
  const watchlist = useWatchlist();
  return useMemo(() => {
    const set = new Set<string>();
    positions.data?.positions.forEach((p) => {
      if (!isCryptoPosition(p)) set.add(p.symbol.toUpperCase());
    });
    orders.data?.orders.forEach((o) => {
      if (!isCryptoOrder(o)) set.add(o.symbol.toUpperCase());
    });
    watchlist.data?.symbols.forEach((s) => set.add(s.toUpperCase()));
    return [...set].sort();
  }, [positions.data, orders.data, watchlist.data]);
};

export const useEarningsCalendar = (enabled = true) => {
  const include = useEarningsIncludeSymbols();
  return useQuery({
    queryKey: qk.earningsCalendar(include.join(",")),
    queryFn: () => api.getEarningsCalendar(include),
    refetchInterval: 300_000, // matches backend cache TTL
    staleTime: 120_000,
    enabled,
  });
};

export const useSymbolEarnings = (symbol: string, enabled = true) =>
  useQuery({
    queryKey: qk.symbolEarnings(symbol),
    queryFn: () => api.getSymbolEarnings(symbol),
    enabled: enabled && symbol.length > 0,
    staleTime: 300_000,
  });

export const useEconomicCalendar = (
  countries: readonly string[] = [],
  enabled = true,
) =>
  useQuery({
    queryKey: qk.economicCalendar(countries),
    queryFn: () => api.getEconomicCalendar(countries),
    refetchInterval: 300_000,
    staleTime: 120_000,
    enabled,
  });

export const useTrendingResearch = (enabled = true) =>
  useQuery({
    queryKey: qk.trendingResearch,
    queryFn: api.getTrendingResearch,
    refetchInterval: 900_000, // matches backend cache TTL
    staleTime: 600_000,
    enabled,
  });

export const useSmartScore = (symbol: string, enabled = true) =>
  useQuery({
    queryKey: qk.smartScore(symbol),
    queryFn: () => api.getSmartScore(symbol),
    refetchInterval: 3_600_000, // 1h, matches backend cache TTL
    staleTime: 1_800_000,
    enabled: enabled && symbol.length > 0,
  });

export const useSentiment = (symbol: string, enabled = true) =>
  useQuery({
    queryKey: qk.sentiment(symbol),
    queryFn: () => api.getSentiment(symbol),
    refetchInterval: 1_800_000, // 30min, matches backend cache TTL
    staleTime: 900_000,
    enabled: enabled && symbol.length > 0,
  });

export const useAnalystRatings = (symbol: string, enabled = true) =>
  useQuery({
    queryKey: qk.analystRatings(symbol),
    queryFn: () => api.getAnalystRatings(symbol),
    refetchInterval: 3_600_000, // 1h, matches backend cache TTL
    staleTime: 1_800_000,
    enabled: enabled && symbol.length > 0,
  });

export const useHedgeFunds = (symbol: string, enabled = true) =>
  useQuery({
    queryKey: qk.hedgeFunds(symbol),
    queryFn: () => api.getHedgeFunds(symbol),
    refetchInterval: 21_600_000, // 6h, matches backend cache TTL (13F cadence)
    staleTime: 10_800_000,
    enabled: enabled && symbol.length > 0,
  });

export const useInsiders = (symbol: string, enabled = true) =>
  useQuery({
    queryKey: qk.insiders(symbol),
    queryFn: () => api.getInsiders(symbol),
    refetchInterval: 14_400_000, // 4h, matches backend cache TTL
    staleTime: 7_200_000,
    enabled: enabled && symbol.length > 0,
  });

export const useRelatedTickers = (symbol: string, enabled = true) =>
  useQuery({
    queryKey: qk.relatedTickers(symbol),
    queryFn: () => api.getRelatedTickers(symbol),
    refetchInterval: 1_800_000, // 30min — shares backend InvestorSentiment cache
    staleTime: 900_000,
    enabled: enabled && symbol.length > 0,
  });

export const useHolderDemographics = (symbol: string, enabled = true) =>
  useQuery({
    queryKey: qk.holderDemographics(symbol),
    queryFn: () => api.getHolderDemographics(symbol),
    refetchInterval: 1_800_000, // 30min — shares backend InvestorSentiment cache
    staleTime: 900_000,
    enabled: enabled && symbol.length > 0,
  });

// --- Asset symbol universe (Ask-anything router ticker validation) -------
// The full catalogue is fetched once a day and served instantly from a
// localStorage snapshot (stale-while-revalidate). Staleness is harmless: a
// ticker missing from the set just routes to the AI rather than a canned card.

const ASSET_SYMBOLS_KEY = "asset_symbols_v1";
const ASSET_SYMBOLS_MAX_AGE = 24 * 60 * 60 * 1000; // refresh ≤ 1×/day

// Cold-load seed so crypto pairs still route correctly in the brief window
// before the universe (or its localStorage snapshot) is available.
const CRYPTO_SEED = ["BTC/USD", "ETH/USD", "SOL/USD"];

interface AssetSymbolsCache {
  ts: number;
  us_equity: string[];
  crypto: string[];
}

function readAssetSymbolsCache(): AssetSymbolsCache | undefined {
  if (typeof localStorage === "undefined") return undefined;
  try {
    const raw = localStorage.getItem(ASSET_SYMBOLS_KEY);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as AssetSymbolsCache;
    if (
      typeof parsed?.ts !== "number" ||
      !Array.isArray(parsed.us_equity) ||
      !Array.isArray(parsed.crypto)
    ) {
      localStorage.removeItem(ASSET_SYMBOLS_KEY);
      return undefined;
    }
    return parsed;
  } catch {
    try {
      localStorage.removeItem(ASSET_SYMBOLS_KEY);
    } catch {
      /* ignore */
    }
    return undefined;
  }
}

function writeAssetSymbolsCache(data: api.AssetSymbols): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(
      ASSET_SYMBOLS_KEY,
      JSON.stringify({ ts: Date.now(), ...data }),
    );
  } catch {
    /* quota / private mode — non-fatal, the network fetch still serves */
  }
}

export const useAssetSymbols = () =>
  useQuery({
    queryKey: qk.assetSymbols,
    queryFn: async () => {
      const data = await api.getAssetSymbols();
      writeAssetSymbolsCache(data);
      return data;
    },
    staleTime: ASSET_SYMBOLS_MAX_AGE,
    gcTime: Infinity,
    initialData: () => {
      const c = readAssetSymbolsCache();
      return c ? { us_equity: c.us_equity, crypto: c.crypto } : undefined;
    },
    initialDataUpdatedAt: () => readAssetSymbolsCache()?.ts,
  });

export interface SymbolUniverse {
  stocks: Set<string>;
  crypto: Set<string>;
  loaded: boolean;
}

// FE silo "stocks" maps to backend "us_equity". Before the universe loads,
// `crypto` carries the seed and `loaded` is false so the router can apply its
// cold-load heuristic.
export const useSymbolUniverse = (): SymbolUniverse => {
  const { data } = useAssetSymbols();
  return useMemo(
    () => ({
      stocks: new Set(data?.us_equity ?? []),
      crypto: new Set(data?.crypto ?? CRYPTO_SEED),
      loaded: data != null,
    }),
    [data],
  );
};

export const usePortfolioHistory = (period = "1M", timeframe = "1D") =>
  useQuery({
    queryKey: qk.portfolioHistory(period, timeframe),
    queryFn: () => api.getPortfolioHistory(period, timeframe),
    refetchInterval: 60000,
  });

export const usePnlHistory = (assetClass: "stocks" | "crypto", period = "ALL") =>
  useQuery({
    queryKey: qk.pnlHistory(assetClass, period),
    queryFn: () => api.getPnlHistory(assetClass, period),
    refetchInterval: 60000,
  });

// Single-asset metadata (tradable/fractionable/shortable). Effectively
// static, so cache hard and skip auto-refetch. The order-ticket hook
// debounces the symbol it passes in to avoid a lookup per keystroke.
export const useAsset = (symbol: string) =>
  useQuery({
    queryKey: qk.asset(symbol),
    queryFn: () => api.getAsset(symbol),
    enabled: symbol.trim().length > 0,
    staleTime: 5 * 60_000,
    retry: false,
  });

// Full catalogue enrichment for one symbol (Profile widget). Enrichment is
// effectively static, so cache hard and skip auto-refetch.
export const useAssetProfile = (symbol: string) =>
  useQuery({
    queryKey: qk.assetProfile(symbol),
    queryFn: () => api.getAssetProfile(symbol),
    enabled: symbol.trim().length > 0,
    staleTime: 60 * 60_000,
    retry: false,
  });

// Market calendar for a fixed [start, end] window. Sessions only change
// with holiday schedules, so cache hard and skip auto-refetch.
export const useCalendar = (start: string, end: string) =>
  useQuery({
    queryKey: qk.calendar(start, end),
    queryFn: () => api.getCalendar(start, end),
    staleTime: 60 * 60_000,
  });

// The stocks and crypto watchlist hooks differ only by silo (query key + the
// api fn each calls). One factory builds the list/add/remove trio for a silo;
// the six original hook names are re-exported as thin wrappers so call sites
// are unchanged.
type WatchlistApi = {
  get: () => Promise<{ symbols: string[] }>;
  add: (symbol: string) => Promise<{ symbols: string[] }>;
  remove: (symbol: string) => Promise<{ symbols: string[] }>;
};

function makeWatchlistHooks(key: readonly string[], fns: WatchlistApi) {
  const useList = () =>
    useQuery({ queryKey: key, queryFn: fns.get, staleTime: Infinity });

  const useAdd = () => {
    const qc = useQueryClient();
    return useMutation({
      mutationFn: fns.add,
      onSuccess: (data) => qc.setQueryData(key, data),
    });
  };

  const useRemove = () => {
    const qc = useQueryClient();
    return useMutation({
      mutationFn: fns.remove,
      onSuccess: (data) => qc.setQueryData(key, data),
    });
  };

  return { useList, useAdd, useRemove };
}

const stocksWatchlist = makeWatchlistHooks(qk.watchlist, {
  get: api.getWatchlist,
  add: api.addToWatchlist,
  remove: api.removeFromWatchlist,
});
const cryptoWatchlist = makeWatchlistHooks(qk.cryptoWatchlist, {
  get: api.getCryptoWatchlist,
  add: api.addToCryptoWatchlist,
  remove: api.removeFromCryptoWatchlist,
});

export const useWatchlist = stocksWatchlist.useList;
export const useAddToWatchlist = stocksWatchlist.useAdd;
export const useRemoveFromWatchlist = stocksWatchlist.useRemove;
export const useCryptoWatchlist = cryptoWatchlist.useList;
export const useAddToCryptoWatchlist = cryptoWatchlist.useAdd;
export const useRemoveFromCryptoWatchlist = cryptoWatchlist.useRemove;

export const useCryptoTickers = (enabled = true) =>
  useQuery({
    queryKey: qk.cryptoTickers,
    queryFn: api.getCryptoTickers,
    refetchInterval: 15000,
    enabled,
  });

// --- Writes: invalidate everything a trade can move ----------------------

function useTradeInvalidation() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ["orders"] });
    qc.invalidateQueries({ queryKey: qk.positions });
    qc.invalidateQueries({ queryKey: qk.account });
  };
}

export function useSubmitOrder() {
  const invalidate = useTradeInvalidation();
  return useMutation({
    mutationFn: (input: SubmitOrderInput) => api.submitOrder(input),
    onSuccess: invalidate,
  });
}

export function useReplaceOrder() {
  const invalidate = useTradeInvalidation();
  return useMutation({
    mutationFn: (v: { id: string; input: ReplaceOrderInput }) =>
      api.replaceOrder(v.id, v.input),
    onSuccess: invalidate,
  });
}

export function useCancelOrder() {
  const invalidate = useTradeInvalidation();
  return useMutation({
    mutationFn: (id: string) => api.cancelOrder(id),
    onSuccess: invalidate,
  });
}

export function useCancelAllOrders() {
  const invalidate = useTradeInvalidation();
  return useMutation({
    mutationFn: () => api.cancelAllOrders(),
    onSuccess: invalidate,
  });
}

export function useClosePosition() {
  const invalidate = useTradeInvalidation();
  return useMutation({
    mutationFn: (symbol: string) => api.closePosition(symbol),
    onSuccess: invalidate,
  });
}

export function useCloseAllPositions() {
  const invalidate = useTradeInvalidation();
  return useMutation({
    mutationFn: () => api.closeAllPositions(),
    onSuccess: invalidate,
  });
}
