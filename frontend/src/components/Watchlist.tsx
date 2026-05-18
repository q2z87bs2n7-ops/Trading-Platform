import { useEffect, useRef, useState } from "react";
import { quotesSocket } from "../api";
import type { Quote } from "../types";

interface Props {
  symbols: string[];
  selected: string;
  onSelect: (symbol: string) => void;
}

export default function Watchlist({ symbols, selected, onSelect }: Props) {
  const [quotes, setQuotes] = useState<Record<string, Quote>>({});
  const [err, setErr] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (symbols.length === 0) return;
    const ws = quotesSocket(symbols);
    wsRef.current = ws;
    ws.onmessage = (ev) => {
      const data = JSON.parse(ev.data);
      if (data.error) {
        setErr(data.error);
        return;
      }
      setErr(null);
      setQuotes((prev) => {
        const next = { ...prev };
        for (const q of data.quotes as Quote[]) next[q.symbol] = q;
        return next;
      });
    };
    ws.onerror = () => setErr("Quote stream connection error");
    return () => ws.close();
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
