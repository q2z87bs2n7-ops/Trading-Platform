import { useState } from "react";

import type { NewsArticle } from "../types";
import { useNews } from "../data/hooks";
import ErrorBanner from "./ErrorBanner";

function when(ts: number): string {
  const d = Math.max(0, Math.floor(Date.now() / 1000) - ts);
  if (d < 3600) return `${Math.floor(d / 60)}m ago`;
  if (d < 86400) return `${Math.floor(d / 3600)}h ago`;
  return `${Math.floor(d / 86400)}d ago`;
}

function ArticleOverlay({
  article,
  onClose,
}: {
  article: NewsArticle;
  onClose: () => void;
}) {
  return (
    <>
      <div
        className="fixed inset-0 bg-black/50 z-40"
        onClick={onClose}
      />
      <div className="fixed inset-0 flex items-center justify-center z-50 p-4">
        <div className="bg-panel border border-border rounded-lg max-w-2xl w-full max-h-[80vh] overflow-y-auto p-4">
          <h2 className="text-base font-semibold mb-3">{article.headline}</h2>
          <div className="text-sm text-muted mb-4">{article.summary}</div>
          {article.url && (
            <a
              href={article.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent hover:underline text-sm"
            >
              Read full article →
            </a>
          )}
          <button
            onClick={onClose}
            className="absolute top-3 right-3 text-muted hover:text-text"
            type="button"
          >
            ✕
          </button>
        </div>
      </div>
    </>
  );
}

export default function News({
  symbol,
  bare = false,
}: {
  symbol: string;
  bare?: boolean;
}) {
  const { data, error, isPending } = useNews(symbol, 10);
  const rows = data?.news;
  const [selected, setSelected] = useState<NewsArticle | null>(null);

  const body = (
    <>
      {!symbol && <div className="text-xs text-muted">Select a symbol</div>}
      {symbol && error && <ErrorBanner message={error.message} />}
      {symbol && !error && isPending && (
        <div className="text-xs text-muted">Loading…</div>
      )}
      {rows && rows.length === 0 && (
        <div className="text-xs text-muted">No recent news</div>
      )}
      {rows &&
        rows.map((n) => (
          <button
            key={n.id}
            onClick={() => setSelected(n)}
            className="w-full flex justify-between py-1 text-[13px] bg-transparent border-0 p-0 cursor-pointer text-left hover:text-accent"
          >
            <span className="text-text">{n.headline}</span>
            <span className="tabular-nums text-muted ml-2 flex-shrink-0">
              {when(n.time)}
            </span>
          </button>
        ))}
      {selected && (
        <ArticleOverlay article={selected} onClose={() => setSelected(null)} />
      )}
    </>
  );

  if (bare) return body;

  return (
    <div className="bg-panel border border-border rounded-lg p-3">
      <h2 className="text-[13px] uppercase tracking-wide text-muted m-0 mb-2">
        News{symbol && ` · ${symbol}`}
      </h2>
      {body}
    </div>
  );
}
