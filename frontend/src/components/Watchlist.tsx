import { useLiveQuotes } from "../data/useLiveQuotes";

interface Props {
  symbols: string[];
  selected: string;
  onSelect: (symbol: string) => void;
}

export default function Watchlist({ symbols, selected, onSelect }: Props) {
  const { quotes, error } = useLiveQuotes(
    Array.from(new Set([...symbols, selected].filter(Boolean))),
  );

  return (
    <div className="panel">
      <h2>Watchlist</h2>
      {error && <div className="error">{error}</div>}
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
