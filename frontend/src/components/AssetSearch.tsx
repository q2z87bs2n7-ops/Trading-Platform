import { useEffect, useState } from "react";

import { useAssetSearch } from "../data/hooks";

interface Props {
  onSelect: (symbol: string) => void;
}

export default function AssetSearch({ onSelect }: Props) {
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
    <div className="panel">
      <h2>Asset Search</h2>
      <input
        className="search-input"
        placeholder="symbol or company name"
        value={input}
        onChange={(e) => setInput(e.target.value)}
      />
      {error && <div className="error">{(error as Error).message}</div>}
      {isFetching && <div className="tag">Searching…</div>}
      {query && !isFetching && data && data.length === 0 && (
        <div className="tag">No matches</div>
      )}
      <div className="search-results">
        {data?.map((a) => (
          <div
            key={a.symbol}
            className="search-result"
            onClick={() => onSelect(a.symbol)}
          >
            <strong>{a.symbol}</strong>
            <span className="label">
              {a.name} · {a.exchange}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
