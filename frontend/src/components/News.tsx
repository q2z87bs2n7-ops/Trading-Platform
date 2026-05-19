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
    <div className="bg-panel border border-border rounded-lg p-4">
      <h2 className="text-[13px] uppercase tracking-wide text-muted m-0 mb-3">
        News{symbol && ` · ${symbol}`}
      </h2>
      {!symbol && <div className="text-xs text-muted">Select a symbol</div>}
      {symbol && error && (
        <div className="text-red text-[13px]">{error.message}</div>
      )}
      {symbol && !error && isPending && (
        <div className="text-xs text-muted">Loading…</div>
      )}
      {rows && rows.length === 0 && (
        <div className="text-xs text-muted">No recent news</div>
      )}
      {rows &&
        rows.map((n) => (
          <div
            className="flex justify-between py-1.5 text-sm"
            key={n.id}
          >
            <span className="text-muted">
              {n.url ? (
                <a href={n.url} target="_blank" rel="noopener noreferrer" className="text-text hover:text-green underline">
                  {n.headline}
                </a>
              ) : (
                n.headline
              )}
            </span>
            <span className="tabular-nums">
              {n.source} · {when(n.time)}
            </span>
          </div>
        ))}
    </div>
  );
}
