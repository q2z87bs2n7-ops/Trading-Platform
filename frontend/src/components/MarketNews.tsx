import { useState } from "react";

import type { MarketNewsArticle } from "../types";
import { useMarketNews } from "../data/hooks";
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
  article: MarketNewsArticle;
  onClose: () => void;
}) {
  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-40" onClick={onClose} />
      <div className="fixed inset-0 flex items-center justify-center z-50 p-4">
        <div className="relative bg-panel border border-border rounded-lg max-w-2xl w-full max-h-[80vh] overflow-y-auto p-4">
          <button
            onClick={onClose}
            className="absolute top-3 right-3 text-muted hover:text-text"
            type="button"
          >
            ✕
          </button>
          <p className="text-[11px] text-muted mb-2 uppercase tracking-wide">
            {article.source}
          </p>
          <h2 className="text-base font-semibold mb-3">{article.title}</h2>
          <div className="text-sm text-muted mb-4">{article.summary}</div>
          {article.link && (
            <a
              href={article.link}
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent hover:underline text-sm"
            >
              Read full article →
            </a>
          )}
        </div>
      </div>
    </>
  );
}

export default function MarketNews() {
  const { data, error, isPending } = useMarketNews(20);
  const [selected, setSelected] = useState<MarketNewsArticle | null>(null);

  return (
    <div className="bg-panel border border-border rounded-lg p-3">
      <h2 className="text-[13px] uppercase tracking-wide text-muted m-0 mb-2">
        Market News
      </h2>
      {error && <ErrorBanner message={error.message} />}
      {!error && isPending && <div className="text-xs text-muted">Loading…</div>}
      {data?.articles.map((a, i) => (
        <button
          key={i}
          onClick={() => setSelected(a)}
          className="w-full flex justify-between items-start py-1 text-[13px] bg-transparent border-0 p-0 cursor-pointer text-left hover:text-accent gap-3"
        >
          <span className="text-text">{a.title}</span>
          <span className="tabular-nums text-muted flex-shrink-0 text-[12px]">
            {when(a.pub_time)}
          </span>
        </button>
      ))}
      {selected && (
        <ArticleOverlay article={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}
