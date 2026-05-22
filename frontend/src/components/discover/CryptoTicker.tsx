import type { Snapshot } from "../../types";
import { coinLabel } from "./util";

const money = (n: number, decimals = 2) =>
  n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });

// Live crypto price strip — the crypto silo's equivalent of the equity
// indices marquee. Duplicates the list so the marquee scrolls seamlessly.
export function CryptoTicker({ tickers }: { tickers: Snapshot[] }) {
  if (!tickers.length) return null;
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
          Crypto
        </span>
        <div className="ticker-wrap overflow-hidden flex-1" style={{ height: 36 }}>
          <div
            className="ticker-track h-full items-center"
            style={{ animationDuration: `${Math.max(tickers.length * 6, 20)}s` }}
          >
            {[...tickers, ...tickers].map((t, i) => {
              const last = t.last_price ?? 0;
              const prev = t.prev_close ?? 0;
              const changePct = prev ? (last - prev) / prev : 0;
              const up = changePct >= 0;
              const color = up ? "var(--pos)" : "var(--neg)";
              const decimals = last < 1 ? 4 : last < 10 ? 3 : 2;
              return (
                <span
                  key={i}
                  className="flex items-center gap-2 px-4 whitespace-nowrap"
                  style={{ borderRight: "1px solid var(--hairline)" }}
                >
                  <span
                    className="text-[11px] font-semibold"
                    style={{ color: "var(--mute)" }}
                  >
                    {coinLabel(t.symbol)}
                  </span>
                  <span className="text-[13px] font-semibold tabular-nums">
                    {money(last, decimals)}
                  </span>
                  <span
                    className="text-[12px] tabular-nums font-medium"
                    style={{ color }}
                  >
                    {up ? "+" : ""}
                    {(changePct * 100).toFixed(2)}%
                  </span>
                </span>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
