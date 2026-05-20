import { useEffect, useState } from "react";
import { useSnapshots } from "../data/hooks";
import { useLiveQuotes } from "../data/useLiveQuotes";
import type { Quote } from "../types";
import AssetSearch from "./AssetSearch";
import ErrorBanner from "./ErrorBanner";

const PAGE_SIZE = 5;
const AUTO_ROTATE_MS = 20_000;

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

  const totalPages = Math.max(1, Math.ceil(symbols.length / PAGE_SIZE));
  const [page, setPage] = useState(0);

  // Clamp page when symbols list shrinks
  const clampedPage = Math.min(page, totalPages - 1);

  // Auto-rotate pages every 20 seconds when there's more than one page
  useEffect(() => {
    if (totalPages <= 1) return;
    const id = setInterval(() => {
      setPage((p) => (p + 1) % totalPages);
    }, AUTO_ROTATE_MS);
    return () => clearInterval(id);
  }, [totalPages]);

  const pageSymbols = symbols.slice(
    clampedPage * PAGE_SIZE,
    clampedPage * PAGE_SIZE + PAGE_SIZE,
  );

  // Always render exactly PAGE_SIZE slots so the box never resizes.
  const emptySlots = PAGE_SIZE - pageSymbols.length;

  return (
    <div className="bg-panel border border-border rounded-lg p-3">
      <h2 className="text-[13px] uppercase tracking-wide text-muted m-0 mb-2">
        Watchlist
      </h2>
      <AssetSearch onSelect={onSelect} onAdd={onAdd} bare />
      {error && <ErrorBanner message={error} />}
      <div className="mt-1">
        {pageSymbols.map((sym) => (
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
        {/* Placeholder rows keep the box at a fixed 5-row height */}
        {Array.from({ length: emptySlots }).map((_, i) =>
          symbols.length === 0 && i === 0 ? (
            <div key={`empty-${i}`} className="watch-item" style={{ cursor: "default" }}>
              <span className="text-xs text-muted">Search above to add symbols</span>
            </div>
          ) : (
            <div key={`empty-${i}`} className="watch-item" style={{ cursor: "default" }} />
          )
        )}
      </div>
      {/* Pagination bar always rendered so the box height stays constant */}
      <div className="flex items-center justify-between mt-2 pt-2 border-t border-border">
        <button
          type="button"
          className="watch-remove"
          style={{ fontSize: 14, opacity: clampedPage === 0 || totalPages <= 1 ? 0.2 : 0.7 }}
          disabled={clampedPage === 0 || totalPages <= 1}
          onClick={() => setPage((p) => Math.max(0, p - 1))}
        >
          ‹
        </button>
        <span className="text-[11px] text-muted tabular-nums">
          {totalPages > 1 ? `${clampedPage + 1} / ${totalPages}` : "—"}
        </span>
        <button
          type="button"
          className="watch-remove"
          style={{ fontSize: 14, opacity: clampedPage === totalPages - 1 || totalPages <= 1 ? 0.2 : 0.7 }}
          disabled={clampedPage === totalPages - 1 || totalPages <= 1}
          onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
        >
          ›
        </button>
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
