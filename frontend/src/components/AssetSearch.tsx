import { useEffect, useState } from "react";

import { useAssetSearch } from "../data/hooks";
import ErrorBanner from "./ErrorBanner";

interface Props {
  onSelect: (symbol: string) => void;
  onAdd: (symbol: string) => void;
  bare?: boolean;
}

export default function AssetSearch({ onSelect, onAdd, bare = false }: Props) {
  const [input, setInput] = useState("");
  const [query, setQuery] = useState("");

  // Debounce: search_assets fetches the full asset list server-side, so
  // don't fire on every keystroke.
  useEffect(() => {
    const id = setTimeout(() => setQuery(input.trim()), 300);
    return () => clearTimeout(id);
  }, [input]);

  const { data, isFetching, error } = useAssetSearch(query);

  const body = (
    <>
      <input
        className="search-input"
        placeholder="symbol or company name"
        value={input}
        onChange={(e) => setInput(e.target.value)}
      />
      {error && <ErrorBanner message={(error as Error).message} />}
      {isFetching && <div className="text-xs text-muted mt-1">Searching…</div>}
      {query && !isFetching && data && data.length === 0 && (
        <div className="text-xs text-muted mt-1">No matches</div>
      )}
      <div className="search-results">
        {data?.map((a) => (
          <div
            key={a.symbol}
            className="search-result"
            onClick={() => onSelect(a.symbol)}
          >
            <strong>{a.symbol}</strong>
            <span className="text-muted">
              {a.name} · {a.exchange}
            </span>
            <button
              className="watch-add"
              title="Add to watchlist"
              onClick={(e) => {
                e.stopPropagation();
                onAdd(a.symbol);
              }}
            >
              +
            </button>
          </div>
        ))}
      </div>
    </>
  );

  if (bare) return body;

  return (
    <div className="bg-panel border border-border rounded-lg p-3">
      <h2 className="text-[13px] uppercase tracking-wide text-muted m-0 mb-2">Asset Search</h2>
      {body}
    </div>
  );
}
