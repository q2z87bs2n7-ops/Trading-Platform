import { useBars } from "../data/hooks";
import { useLiveQuotes } from "../data/useLiveQuotes";
import type { Quote } from "../types";
import ErrorBanner from "./ErrorBanner";

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
      <h2 className="text-[13px] uppercase tracking-wide text-muted m-0 mb-2">
        Watchlist
      </h2>
      {error && <ErrorBanner message={error} />}
      {symbols.length === 0 && (
        <div className="text-xs text-muted">
          Search a symbol above to start watching.
        </div>
      )}
      {symbols.map((sym) => (
        <WatchlistRow
          key={sym}
          sym={sym}
          quote={quotes[sym]}
          selected={sym === selected}
          onSelect={() => onSelect(sym)}
          onRemove={() => onRemove(sym)}
        />
      ))}
    </div>
  );
}

// Per-row component so each symbol gets its own useBars subscription for
// day-delta. 1Day bars are cached indefinitely by React Query (no
// refetchInterval on useBars), so this is N one-time fetches on watchlist
// mount — not N-per-poll.
function WatchlistRow({
  sym,
  quote,
  selected,
  onSelect,
  onRemove,
}: {
  sym: string;
  quote: Quote | undefined;
  selected: boolean;
  onSelect: () => void;
  onRemove: () => void;
}) {
  const { data: dailyBars } = useBars(sym, "1Day");
  const prevClose =
    dailyBars?.bars && dailyBars.bars.length >= 2
      ? dailyBars.bars[dailyBars.bars.length - 2].close
      : undefined;
  const lastPrice = quote?.mid;
  const dayPct =
    lastPrice != null && prevClose != null
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
