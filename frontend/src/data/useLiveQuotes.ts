import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect } from "react";

import type { Quote } from "../types";
import { qk } from "./queryClient";
import { subscribeQuotes } from "./quoteStream";

type QuoteMap = Record<string, Quote>;

/**
 * Single source of live quotes for the data layer. Registers the requested
 * symbols with the shared quote-stream manager (one ref-counted SSE connection
 * for the union of all consumers, with the load-bearing polling fallback) and
 * reads the merged ticks back from the React Query cache under `qk.quotes`.
 */
export function useLiveQuotes(symbols: string[]) {
  const key = symbols.join(",");

  useEffect(() => {
    if (symbols.length === 0) return;
    return subscribeQuotes(symbols);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // Narrow the shared quote map to just this consumer's symbols so React
  // Query's structural sharing skips re-renders when an unrelated symbol ticks.
  const select = useCallback(
    (m: QuoteMap) => {
      const out: QuoteMap = {};
      for (const s of symbols) if (m[s]) out[s] = m[s];
      return out;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key],
  );

  const { data } = useQuery<QuoteMap, Error, QuoteMap>({
    queryKey: qk.quotes,
    queryFn: () => ({}),
    staleTime: Infinity,
    select,
  });

  return { quotes: data ?? {}, error: null as string | null };
}
