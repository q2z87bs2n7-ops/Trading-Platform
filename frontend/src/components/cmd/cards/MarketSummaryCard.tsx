import { useState } from "react";

import {
  readMarketSummaryCache,
  windowLabel,
  type MarketSummaryCache,
} from "../../../hooks/useMarketSummary";
import type { AssetClass } from "../../../lib/cmd-intent";
import CmdResultCard from "../CmdResultCard";

export function MarketSummaryIntentCard({ assetClass }: { assetClass: AssetClass }) {
  const [cache] = useState<MarketSummaryCache | null>(() =>
    readMarketSummaryCache(assetClass),
  );

  const label = cache
    ? windowLabel(cache.window, assetClass)
    : assetClass === "crypto"
      ? "Crypto Summary"
      : "Market Summary";
  const isCrypto = assetClass === "crypto";
  const tz = isCrypto ? "UTC" : "America/New_York";
  const tzLabel = isCrypto ? "UTC" : "EST";
  const genTime = cache
    ? new Date(cache.generatedAt).toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        timeZone: tz,
      })
    : null;

  return (
    <CmdResultCard
      title={`✦ ${label}`}
      meta={genTime ? `Generated ${genTime} ${tzLabel}` : "No summary yet"}
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
          {isCrypto
            ? "No crypto summary yet. It generates automatically each 6-hour UTC window — open the Crypto Discover page to trigger it."
            : "No summary available yet. It generates automatically at midnight, market open (9:30), midday (12:00), and market close (4:30) EST — open the Stocks Discover page to trigger it."}
        </p>
      )}
    </CmdResultCard>
  );
}
