import { useSnapshots } from "../data/hooks";
import { useLiveQuotes } from "../data/useLiveQuotes";
import type { Quote } from "../types";
import AssetSearch from "./AssetSearch";
import ErrorBanner from "./ErrorBanner";

interface Props {
  symbols: string[];
  selected: string;
  onSelect: (symbol: string) => void;
  onAdd: (symbol: string) => void;
  onRemove: (symbol: string) => void;
}

export default function Watchlist({
  symbols,
  selected,
  onSelect,
  onAdd,
  onRemove,
}: Props) {
  const allSymbols = Array.from(
    new Set([...symbols, selected].filter(Boolean)),
  );
  const { quotes, error } = useLiveQuotes(allSymbols);
  // One round-trip for prev-close across all rows (was N parallel
  // useBars(sym,"1Day") — closes the BACKLOG "Watchlist day-delta" item).
  const { data: snapData } = useSnapshots(allSymbols);
  const prevCloseBySymbol: Record<string, number | null> = {};
  for (const s of snapData?.snapshots ?? []) {
    prevCloseBySymbol[s.symbol] = s.prev_close;
  }

  return (
    <div className="bg-panel border border-border rounded-lg p-3">
      <h2 className="text-[13px] uppercase tracking-wide text-muted m-0 mb-2">
        Watchlist
      </h2>
      <AssetSearch onSelect={onSelect} onAdd={onAdd} bare />
      {error && <ErrorBanner message={error} />}
      {symbols.length === 0 && (
        <div className="text-xs text-muted mt-2">
          Search a symbol above to start watching.
        </div>
      )}
      <div className="mt-1">
        {symbols.map((sym) => (
          <WatchlistRow
            key={sym}
            sym={sym}
            quote={quotes[sym]}
            prevClose={prevCloseBySymbol[sym] ?? null}
            selected={sym === selected}
            onSelect={() => onSelect(sym)}
            onRemove={() => onRemove(sym)}
          />
        ))}
      </div>
    </div>
  );
}

function WatchlistRow({
  sym,
  quote,
  prevClose,
  selected,
  onSelect,
  onRemove,
}: {
  sym: string;
  quote: Quote | undefined;
  prevClose: number | null;
  selected: boolean;
  onSelect: () => void;
  onRemove: () => void;
}) {
  const lastPrice = quote?.mid;
  const dayPct =
    lastPrice != null && prevClose != null && prevClose > 0
      ? (lastPrice - prevClose) / prevClose
      : null;
  const dayUp = dayPct !== null && dayPct >= 0;

  return (
    <div
      className={`watch-item ${selected ? "active" : ""}`}
      onClick={onSelect}
    >
      <strong>{sym}</strong>
      <div className="flex items-center gap-2">
        <span className="tabular-nums">
          {quote ? `$${quote.mid.toFixed(2)}` : "—"}
        </span>
        {dayPct !== null && (
          <span
            className="text-xs tabular-nums"
            style={{ color: dayUp ? "var(--green)" : "var(--red)" }}
          >
            {dayUp ? "+" : ""}
            {(dayPct * 100).toFixed(2)}%
          </span>
        )}
        <button
          className="watch-remove"
          title="Remove from watchlist"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
        >
          ×
        </button>
      </div>
    </div>
  );
}
