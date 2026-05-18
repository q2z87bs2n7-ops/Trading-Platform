import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import * as api from "../api";
import type { ReplaceOrderInput, SubmitOrderInput } from "../types";
import { qk } from "./queryClient";

// --- Reads ---------------------------------------------------------------

export const useAccount = () =>
  useQuery({ queryKey: qk.account, queryFn: api.getAccount });

export const usePositions = () =>
  useQuery({ queryKey: qk.positions, queryFn: api.getPositions });

export const useOrders = (status = "all") =>
  useQuery({
    queryKey: qk.orders(status),
    queryFn: () => api.getOrders(status),
  });

export const useClock = () =>
  useQuery({ queryKey: qk.clock, queryFn: api.getClock });

export const useActivities = () =>
  useQuery({ queryKey: qk.activities, queryFn: () => api.getActivities() });

export const usePortfolioHistory = (period = "1M", timeframe = "1D") =>
  useQuery({
    queryKey: qk.portfolioHistory(period, timeframe),
    queryFn: () => api.getPortfolioHistory(period, timeframe),
  });

export const useAssetSearch = (search: string) =>
  useQuery({
    queryKey: qk.assets(search),
    queryFn: () => api.searchAssets(search),
    enabled: search.trim().length > 0,
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
