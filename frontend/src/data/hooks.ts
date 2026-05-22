import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import * as api from "../api";
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

export const useMovers = (top = 10) =>
  useQuery({
    queryKey: qk.movers(top),
    queryFn: () => api.getMovers(top),
    refetchInterval: 60000,
  });

export const useMostActive = (top = 10, by = "volume") =>
  useQuery({
    queryKey: qk.mostActive(top, by),
    queryFn: () => api.getMostActive(top, by),
    refetchInterval: 60000,
  });

export const useMarketNews = (limit = 20) =>
  useQuery({
    queryKey: qk.marketNews,
    queryFn: () => api.getMarketNews(limit),
    refetchInterval: 300_000, // 5 min — matches backend cache TTL
    staleTime: 120_000,
  });

export const useNews = (symbol: string, limit = 10) =>
  useQuery({
    queryKey: qk.news(symbol),
    queryFn: () => api.getNews(symbol, limit),
    enabled: symbol.length > 0,
    staleTime: 120_000,
  });

export const useIndices = () =>
  useQuery({
    queryKey: qk.indices,
    queryFn: api.getIndices,
    refetchInterval: 120_000,
    staleTime: 60_000,
  });

export const usePortfolioHistory = (period = "1M", timeframe = "1D") =>
  useQuery({
    queryKey: qk.portfolioHistory(period, timeframe),
    queryFn: () => api.getPortfolioHistory(period, timeframe),
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

// Market calendar for a fixed [start, end] window. Sessions only change
// with holiday schedules, so cache hard and skip auto-refetch.
export const useCalendar = (start: string, end: string) =>
  useQuery({
    queryKey: qk.calendar(start, end),
    queryFn: () => api.getCalendar(start, end),
    staleTime: 60 * 60_000,
  });

export const useWatchlist = () =>
  useQuery({
    queryKey: qk.watchlist,
    queryFn: api.getWatchlist,
    staleTime: Infinity,
  });

export function useAddToWatchlist() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (symbol: string) => api.addToWatchlist(symbol),
    onSuccess: (data) => qc.setQueryData(qk.watchlist, data),
  });
}

export function useRemoveFromWatchlist() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (symbol: string) => api.removeFromWatchlist(symbol),
    onSuccess: (data) => qc.setQueryData(qk.watchlist, data),
  });
}

export const useCryptoWatchlist = () =>
  useQuery({
    queryKey: qk.cryptoWatchlist,
    queryFn: api.getCryptoWatchlist,
    staleTime: Infinity,
  });

export function useAddToCryptoWatchlist() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (symbol: string) => api.addToCryptoWatchlist(symbol),
    onSuccess: (data) => qc.setQueryData(qk.cryptoWatchlist, data),
  });
}

export function useRemoveFromCryptoWatchlist() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (symbol: string) => api.removeFromCryptoWatchlist(symbol),
    onSuccess: (data) => qc.setQueryData(qk.cryptoWatchlist, data),
  });
}

export const useCryptoTickers = () =>
  useQuery({
    queryKey: qk.cryptoTickers,
    queryFn: api.getCryptoTickers,
    refetchInterval: 15000,
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
