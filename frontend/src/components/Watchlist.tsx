import { useEffect, useState } from "react";
import { getQuotes, streamQuotes } from "../api";
import type { Quote } from "../types";

interface Props {
  symbols: string[];
  selected: string;
  onSelect: (symbol: string) => void;
}

const POLL_MS = 2000;
// Stream ticks are buffered and flushed to React state at most this often,
// so a fast quote feed can't cause a render per tick.
const STREAM_FLUSH_MS = 500;

export default function Watchlist({ symbols, selected, onSelect }: Props) {
  const [quotes, setQuotes] = useState<Record<string, Quote>>({});
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (symbols.length === 0) return;
    let alive = true;
    let pollId: number | undefined;
    let pending: Record<string, Quote> = {};

    const apply = (qs: Quote[]) =>
      setQuotes((prev) => {
        const next = { ...prev };
        for (const q of qs) next[q.symbol] = q;
        return next;
      });

    // Coalesce buffered stream ticks into a single state update.
    const flushId = window.setInterval(() => {
      const keys = Object.keys(pending);
      if (keys.length === 0) return;
      const batch = Object.values(pending);
      pending = {};
      if (alive) apply(batch);
    }, STREAM_FLUSH_MS);

    const startPolling = () => {
      if (pollId !== undefined) return;
      const tick = () =>
        getQuotes(symbols)
          .then((data) => {
            if (!alive) return;
            setErr(null);
            apply(data.quotes);
          })
          .catch((e) => alive && setErr(e.message));
      tick();
      pollId = window.setInterval(tick, POLL_MS);
    };

    // Prefer the real-time stream; fall back to polling if it fails.
    const stopStream = streamQuotes(
      (q) => {
        if (!alive) return;
        setErr(null);
        pending[q.symbol] = q; // flushed on the interval above
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
  }, [symbols.join(",")]);

  return (
    <div className="panel">
      <h2>Watchlist</h2>
      {err && <div className="error">{err}</div>}
      {symbols.map((sym) => {
        const q = quotes[sym];
        return (
          <div
            key={sym}
            className={`watch-item ${sym === selected ? "active" : ""}`}
            onClick={() => onSelect(sym)}
          >
            <strong>{sym}</strong>
            <span className="price">
              {q ? `$${q.mid.toFixed(2)}` : "—"}
            </span>
          </div>
        );
      })}
    </div>
  );
}
