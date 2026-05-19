import { useEffect, useState } from "react";

import { useAssetSearch } from "../data/hooks";

interface Props {
  onSelect: (symbol: string) => void;
  onAdd: (symbol: string) => void;
}

export default function AssetSearch({ onSelect, onAdd }: Props) {
  const [input, setInput] = useState("");
  const [query, setQuery] = useState("");

  // Debounce: search_assets fetches the full asset list server-side, so
  // don't fire on every keystroke.
  useEffect(() => {
    const id = setTimeout(() => setQuery(input.trim()), 300);
    return () => clearTimeout(id);
  }, [input]);

  const { data, isFetching, error } = useAssetSearch(query);

  return (
    <div className="bg-panel border border-border rounded-lg p-4">
      <h2 className="text-[13px] uppercase tracking-wide text-muted m-0 mb-3">Asset Search</h2>
      <input
        className="search-input"
        placeholder="symbol or company name"
        value={input}
        onChange={(e) => setInput(e.target.value)}
      />
      {error && <div className="text-red text-[13px]">{(error as Error).message}</div>}
      {isFetching && <div className="text-xs text-muted">Searching…</div>}
      {query && !isFetching && data && data.length === 0 && (
        <div className="text-xs text-muted">No matches</div>
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
    </div>
  );
}
