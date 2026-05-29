import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";

import type { FxcmPrice } from "../types";
import { qk } from "./queryClient";
import { subscribeFxcmPrices } from "./fxcmPriceStream";

type PriceMap = Record<string, FxcmPrice>;

/**
 * Live FXCM prices via the shared SSE feed (Scalp mode + the alert engine).
 * Registers interest with the ref-counted stream manager and reads the merged
 * ticks back from the React Query cache under `qk.fxcmLivePrices`. `enabled`
 * gates the subscription (e.g. only while the bridge is up / alerts are armed)
 * without conditionally calling the hook.
 *
 * Returns a `{ instrument: FxcmPrice }` map. The streamed set is the whole
 * subscribed/status-T universe; consumers narrow it to what they render.
 */
export function useFxcmPriceStream(enabled = true): { prices: PriceMap } {
  useEffect(() => {
    if (!enabled) return;
    return subscribeFxcmPrices();
  }, [enabled]);

  const { data } = useQuery<PriceMap>({
    queryKey: qk.fxcmLivePrices,
    queryFn: () => ({}),
    staleTime: Infinity,
    enabled,
  });

  return { prices: data ?? {} };
}
