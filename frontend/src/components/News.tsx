import { useNews } from "../data/hooks";

function when(ts: number): string {
  const d = Math.max(0, Math.floor(Date.now() / 1000) - ts);
  if (d < 3600) return `${Math.floor(d / 60)}m ago`;
  if (d < 86400) return `${Math.floor(d / 3600)}h ago`;
  return `${Math.floor(d / 86400)}d ago`;
}

export default function News({ symbol }: { symbol: string }) {
  const { data, error, isPending } = useNews(symbol, 10);
  const rows = data?.news;

  return (
    <div className="panel">
      <h2>News{symbol && ` · ${symbol}`}</h2>
      {!symbol && <div className="tag">Select a symbol</div>}
      {symbol && error && <div className="error">{error.message}</div>}
      {symbol && !error && isPending && <div className="tag">Loading…</div>}
      {rows && rows.length === 0 && <div className="tag">No recent news</div>}
      {rows &&
        rows.map((n) => (
          <div className="row" key={n.id}>
            <span className="label">
              {n.url ? (
                <a href={n.url} target="_blank" rel="noopener noreferrer">
                  {n.headline}
                </a>
              ) : (
                n.headline
              )}
            </span>
            <span className="price">
              {n.source} · {when(n.time)}
            </span>
          </div>
        ))}
    </div>
  );
}
