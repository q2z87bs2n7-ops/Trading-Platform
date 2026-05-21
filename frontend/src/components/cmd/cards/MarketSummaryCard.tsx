import { useState } from "react";

import {
  WINDOW_LABELS,
  readMarketSummaryCache,
  type MarketSummaryCache,
} from "../../../hooks/useMarketSummary";
import CmdResultCard from "../CmdResultCard";

export function MarketSummaryIntentCard() {
  const [cache] = useState<MarketSummaryCache | null>(readMarketSummaryCache);

  const label = cache ? WINDOW_LABELS[cache.window] : "Market Summary";
  const genTime = cache
    ? new Date(cache.generatedAt).toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        timeZone: "America/New_York",
      })
    : null;

  return (
    <CmdResultCard
      title={`✦ ${label}`}
      meta={genTime ? `Generated ${genTime} EST` : "No summary yet"}
    >
      {cache ? (
        <p
          className="text-[13.5px] whitespace-pre-wrap leading-relaxed"
          style={{ color: "var(--text)" }}
        >
          {cache.content}
        </p>
      ) : (
        <p className="text-[13px]" style={{ color: "var(--mute)" }}>
          No summary available yet. It generates automatically at midnight,
          market open (9:30), midday (12:00), and market close (4:30) EST —
          open the app during one of those windows.
        </p>
      )}
    </CmdResultCard>
  );
}
