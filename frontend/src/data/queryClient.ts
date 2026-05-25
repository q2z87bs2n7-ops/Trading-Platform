import { QueryClient } from "@tanstack/react-query";

// One client for the app. Conservative defaults: data is paper-trading
// state, so a short stale window + no aggressive refetch-on-focus.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

export const qk = {
  config: ["config"] as const,
  account: ["account"] as const,
  positions: ["positions"] as const,
  orders: (status: string, limit: number) =>
    ["orders", status, limit] as const,
  quotes: ["quotes"] as const,
  snapshots: (symbols: string[]) =>
    ["snapshots", symbols.join(",")] as const,
  clock: ["clock"] as const,
  activities: (limit: number) => ["activities", limit] as const,
  bars: (symbol: string, timeframe: string) =>
    ["bars", symbol, timeframe] as const,
  movers: (top: number) => ["movers", top] as const,
  mostActive: (top: number, by: string) => ["mostActive", top, by] as const,
  portfolioHistory: (period: string, timeframe: string) =>
    ["portfolioHistory", period, timeframe] as const,
  pnlHistory: (assetClass: string, period: string) =>
    ["pnlHistory", assetClass, period] as const,
  asset: (symbol: string) => ["asset", symbol] as const,
  assetProfile: (symbol: string) => ["assetProfile", symbol] as const,
  calendar: (start: string, end: string) =>
    ["calendar", start, end] as const,
  watchlist: ["watchlist"] as const,
  cryptoWatchlist: ["watchlist", "crypto"] as const,
  cryptoTickers: ["cryptoTickers"] as const,
  indices: ["indices"] as const,
  assetSymbols: ["assetSymbols"] as const,
  marketNews: ["marketNews"] as const,
  news: (symbol: string) => ["news", symbol] as const,
};
