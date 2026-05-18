import { useEffect, useState } from "react";
import { getQuotes } from "../api";
import type { Quote } from "../types";

interface Props {
  symbols: string[];
  selected: string;
  onSelect: (symbol: string) => void;
}

const POLL_MS = 2000;

export default function Watchlist({ symbols, selected, onSelect }: Props) {
  const [quotes, setQuotes] = useState<Record<string, Quote>>({});
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (symbols.length === 0) return;
    let alive = true;
    const tick = () =>
      getQuotes(symbols)
        .then((data) => {
          if (!alive) return;
          setErr(null);
          setQuotes((prev) => {
            const next = { ...prev };
            for (const q of data.quotes) next[q.symbol] = q;
            return next;
          });
        })
        .catch((e) => alive && setErr(e.message));
    tick();
    const id = setInterval(tick, POLL_MS);
    return () => {
      alive = false;
      clearInterval(id);
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
