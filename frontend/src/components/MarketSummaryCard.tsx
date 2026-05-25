import { useState } from "react";

import type { MarketSummaryCache } from "../hooks/useMarketSummary";
import AiDisabledNotice from "./AiDisabledNotice";

function relTime(ts: number): string {
  const diff = Math.max(0, (Date.now() - ts) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

interface Props {
  cache: MarketSummaryCache | null;
  isGenerating: boolean;
  windowLabel: string;
  onDismiss: () => void;
  disabled?: boolean;
}

export default function MarketSummaryCard({
  cache,
  isGenerating,
  windowLabel,
  onDismiss,
  disabled,
}: Props) {
  const [noticeHidden, setNoticeHidden] = useState(false);

  if (disabled) {
    if (noticeHidden) return null;
    return (
      <div
        className="rounded-card-lg mb-6 relative"
        style={{
          background: "var(--panel)",
          border: "1px solid var(--border)",
          boxShadow: "var(--shadow-sm)",
          padding: "10px 12px",
        }}
      >
        <button
          onClick={() => setNoticeHidden(true)}
          className="absolute top-2 right-2 text-[18px] leading-none px-1 hover:opacity-70 transition-opacity"
          style={{ color: "var(--mute)" }}
          aria-label="Dismiss"
        >
          ×
        </button>
        <AiDisabledNotice surface="market" compact />
      </div>
    );
  }

  if (cache?.dismissed && !isGenerating) return null;

  return (
    <div
      className="rounded-card-lg p-5 mb-6 relative"
      style={{
        background: "var(--panel)",
        border: "1px solid var(--border)",
        boxShadow: "var(--shadow-sm)",
      }}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span
            className="text-[11px] font-medium uppercase"
            style={{ color: "var(--accent)", letterSpacing: "0.08em" }}
          >
            ✦ {windowLabel}
          </span>
          {cache && !isGenerating && (
            <span className="text-[11px]" style={{ color: "var(--mute)" }}>
              · {relTime(cache.generatedAt)}
            </span>
          )}
          {isGenerating && (
            <span className="text-[11px]" style={{ color: "var(--mute)" }}>
              · generating…
            </span>
          )}
        </div>
        <button
          onClick={onDismiss}
          className="text-[18px] leading-none px-1 hover:opacity-70 transition-opacity"
          style={{ color: "var(--mute)" }}
          aria-label="Dismiss market summary"
        >
          ×
        </button>
      </div>

      {isGenerating ? (
        <div className="flex flex-col gap-[10px] animate-pulse">
          <div className="h-[11px] rounded w-full" style={{ background: "var(--panel-2)" }} />
          <div className="h-[11px] rounded w-[92%]" style={{ background: "var(--panel-2)" }} />
          <div className="h-[11px] rounded w-[78%]" style={{ background: "var(--panel-2)" }} />
          <div className="h-[11px] rounded w-full mt-1" style={{ background: "var(--panel-2)" }} />
          <div className="h-[11px] rounded w-[85%]" style={{ background: "var(--panel-2)" }} />
          <div className="h-[11px] rounded w-[60%]" style={{ background: "var(--panel-2)" }} />
        </div>
      ) : cache ? (
        <p
          className="text-[13px] leading-relaxed whitespace-pre-wrap"
          style={{ color: "var(--text-2)" }}
        >
          {cache.content}
        </p>
      ) : null}
    </div>
  );
}
