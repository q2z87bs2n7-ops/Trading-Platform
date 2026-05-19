import { useLiveQuotes } from "../data/useLiveQuotes";

interface Props {
  symbols: string[];
  selected: string;
  onSelect: (symbol: string) => void;
  onRemove: (symbol: string) => void;
}

export default function Watchlist({
  symbols,
  selected,
  onSelect,
  onRemove,
}: Props) {
  const { quotes, error } = useLiveQuotes(
    Array.from(new Set([...symbols, selected].filter(Boolean))),
  );

  return (
    <div className="bg-panel border border-border rounded-lg p-3">
      <h2 className="text-[13px] uppercase tracking-wide text-muted m-0 mb-2">Watchlist</h2>
      {error && <div className="text-red text-[13px]">{error}</div>}
      {symbols.map((sym) => {
        const q = quotes[sym];
        return (
          <div
            key={sym}
            className={`watch-item ${sym === selected ? "active" : ""}`}
            onClick={() => onSelect(sym)}
          >
            <strong>{sym}</strong>
            <span className="tabular-nums">
              {q ? `$${q.mid.toFixed(2)}` : "—"}
            </span>
            <button
              className="watch-remove"
              title="Remove from watchlist"
              onClick={(e) => {
                e.stopPropagation();
                onRemove(sym);
              }}
            >
              ×
            </button>
          </div>
        );
      })}
    </div>
  );
}
