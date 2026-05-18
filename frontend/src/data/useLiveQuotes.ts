import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { getQuotes, streamQuotes } from "../api";
import type { Quote } from "../types";
import { qk } from "./queryClient";

const POLL_MS = 2000;
// Buffer stream ticks and flush at most this often (mirrors Watchlist's
// load-bearing constant from CLAUDE.md). Tune, don't remove.
const STREAM_FLUSH_MS = 500;

type QuoteMap = Record<string, Quote>;

/**
 * Single source of live quotes for the data layer: prefers the SSE stream
 * and auto-falls-back to polling /api/quotes (the load-bearing fallback —
 * EventSource auto-reconnect stays disabled). Ticks are buffered and
 * merged into the React Query cache under `qk.quotes` so any component can
 * read them via `useQuery({ queryKey: qk.quotes })` with no fetcher.
 */
export function useLiveQuotes(symbols: string[]) {
  const qc = useQueryClient();
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (symbols.length === 0) return;
    let alive = true;
    let pollId: number | undefined;
    let pending: QuoteMap = {};

    const merge = (qs: Quote[]) =>
      qc.setQueryData<QuoteMap>(qk.quotes, (prev) => {
        const next = { ...(prev ?? {}) };
        for (const q of qs) next[q.symbol] = q;
        return next;
      });

    const flushId = window.setInterval(() => {
      const batch = Object.values(pending);
      if (batch.length === 0) return;
      pending = {};
      if (alive) merge(batch);
    }, STREAM_FLUSH_MS);

    const startPolling = () => {
      if (pollId !== undefined) return;
      const tick = () =>
        getQuotes(symbols)
          .then((data) => {
            if (!alive) return;
            setErr(null);
            merge(data.quotes);
          })
          .catch((e) => alive && setErr(e.message));
      tick();
      pollId = window.setInterval(tick, POLL_MS);
    };

    const stopStream = streamQuotes(
      (q) => {
        if (!alive) return;
        setErr(null);
        pending[q.symbol] = q;
      },
      () => {
        if (alive) startPolling();
      },
    );

    return () => {
      alive = false;
      stopStream();
      clearInterval(flushId);
      if (pollId !== undefined) clearInterval(pollId);
    };
  }, [qc, symbols.join(",")]);

  const { data } = useQuery<QuoteMap>({
    queryKey: qk.quotes,
    queryFn: () => ({}),
    staleTime: Infinity,
  });

  return { quotes: data ?? {}, error: err };
}
