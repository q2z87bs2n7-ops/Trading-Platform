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
  account: ["account"] as const,
  positions: ["positions"] as const,
  orders: (status: string) => ["orders", status] as const,
  quotes: ["quotes"] as const,
  clock: ["clock"] as const,
  activities: ["activities"] as const,
  portfolioHistory: (period: string, timeframe: string) =>
    ["portfolioHistory", period, timeframe] as const,
  assets: (search: string) => ["assets", search] as const,
};
