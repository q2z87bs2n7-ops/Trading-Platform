import { useMemo } from "react";
import type { FxcmPrice } from "../../types";
import { fmtCfdPrice } from "../../lib/format";
import { useFxcmBars } from "../../data/hooks";
import { useFxcmView } from "../../lib/fxcm-view";

// Fixed marquee instruments for the CFD silo — a cross-asset snapshot
// (US/EU/Asia indices, majors, gold, oil, vol) mirroring the stocks indices
// marquee and the crypto price strip.
const CFD_TICKER_INSTRUMENTS = [
  "US30",
  "CHN50",
  "GER30",
  "EUR/USD",
  "USOIL",
  "VOLX",
  "JPN225",
  "XAU/USD",
] as const;

// One chip — pulls its own D1 bars so the day-% is real (the /prices feed has
// no prev-close). React Query dedupes against the watchlist sparklines when an
// instrument overlaps, so this is free for symbols already on the list.
function CfdTickerChip({
  instrument,
  livePrice,
}: {
  instrument: string;
  livePrice?: FxcmPrice;
}) {
  const { data: bars } = useFxcmBars(instrument, "D1");
  const closes = useMemo(() => (bars ?? []).map((b) => b.close), [bars]);

  const bid = livePrice?.bid as number | undefined;
  const ask = livePrice?.ask as number | undefined;
  const mid =
    bid != null && ask != null
      ? (bid + ask) / 2
      : bid ?? ask ?? closes[closes.length - 1] ?? 0;
  const prev = closes.length >= 2 ? closes[closes.length - 2] : 0;
  const changePct = prev > 0 ? (mid - prev) / prev : 0;
  const up = changePct >= 0;
  const color = up ? "var(--pos)" : "var(--neg)";

  if (mid <= 0) return null;
  return (
    <span
      className="flex items-center gap-2 px-4 whitespace-nowrap"
      style={{ borderRight: "1px solid var(--hairline)" }}
    >
      <span className="text-[11px] font-semibold" style={{ color: "var(--mute)" }}>
        {instrument}
      </span>
      <span className="text-[13px] font-semibold tabular-nums">
        {fmtCfdPrice(mid, livePrice?.digits ?? instrument)}
      </span>
      <span className="text-[12px] tabular-nums font-medium" style={{ color }}>
        {up ? "+" : ""}
        {(changePct * 100).toFixed(2)}%
      </span>
    </span>
  );
}

// Live CFD price strip — the CFD silo's equivalent of the equity indices
// marquee. Subscribes its instruments on the bridge (status T → live bid/ask)
// and duplicates the list so the marquee scrolls seamlessly.
export function CfdTicker({
  priceMap,
  enabled = true,
}: {
  priceMap: Map<string, FxcmPrice>;
  enabled?: boolean;
}) {
  useFxcmView(CFD_TICKER_INSTRUMENTS as unknown as string[], enabled);
  if (!enabled) return null;
  const list = CFD_TICKER_INSTRUMENTS as unknown as string[];
  return (
    <div
      className="overflow-hidden mb-4"
      style={{
        background: "var(--panel)",
        border: "1px solid var(--border)",
        borderRadius: "var(--r-lg)",
        boxShadow: "var(--shadow-sm)",
      }}
    >
      <div className="flex items-center">
        <span
          className="text-[11px] uppercase font-semibold px-3 py-2 whitespace-nowrap shrink-0"
          style={{
            color: "var(--mute)",
            letterSpacing: "0.06em",
            borderRight: "1px solid var(--border)",
          }}
        >
          Markets
        </span>
        <div className="ticker-wrap overflow-hidden flex-1" style={{ height: 36 }}>
          {/* ~4.6s per instrument matches the indices/crypto marquee pace. */}
          <div
            className="ticker-track h-full items-center"
            style={{ animationDuration: `${Math.max(list.length * 4.6, 20)}s` }}
          >
            {[...list, ...list].map((instrument, i) => (
              <CfdTickerChip
                key={`${instrument}-${i}`}
                instrument={instrument}
                livePrice={priceMap.get(instrument)}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
