import type { AssetClass } from "../../../lib/ask-intent";
import { usePositions } from "../../../data/hooks";
import { isCryptoPosition } from "../../../lib/asset-class";
import { money } from "../../../lib/format";
import AskResultCard from "../AskResultCard";

export function PortfolioCard({ assetClass }: { assetClass: AssetClass }) {
  const positions = usePositions();
  const all = positions.data?.positions || [];
  const rows = all.filter((p) =>
    assetClass === "crypto" ? isCryptoPosition(p) : !isCryptoPosition(p),
  );
  const total = rows.reduce((s, p) => s + p.market_value, 0);
  const label = assetClass === "crypto" ? "Crypto" : "Stocks";

  return (
    <AskResultCard title={`${label} portfolio`} meta={`Holdings ${money(total)}`}>
      {rows.length === 0 ? (
        <div className="text-[13px]" style={{ color: "var(--mute)" }}>
          No open {label.toLowerCase()} positions.
        </div>
      ) : (
        <div className="flex flex-col">
          <div
            className="grid gap-2 text-[11px] uppercase pb-1.5"
            style={{
              gridTemplateColumns: "1fr 60px 1fr 1fr",
              color: "var(--mute)",
              borderBottom: "1px solid var(--hairline)",
            }}
          >
            <span>Symbol</span>
            <span className="text-right">Qty</span>
            <span className="text-right">Value</span>
            <span className="text-right">P&L</span>
          </div>
          {rows.map((p) => {
            const plUp = p.unrealized_pl >= 0;
            const share = total > 0 ? p.market_value / total : 0;
            return (
              <div
                key={p.symbol}
                className="grid gap-2 py-1.5 text-[13px] items-center"
                style={{
                  gridTemplateColumns: "1fr 60px 1fr 1fr",
                  borderBottom: "1px solid var(--hairline)",
                }}
              >
                <span className="font-semibold">
                  {p.symbol}
                  <span
                    className="ml-2 font-mono text-[11px]"
                    style={{ color: "var(--mute)" }}
                  >
                    {(share * 100).toFixed(1)}%
                  </span>
                </span>
                <span
                  className="font-mono tabular-nums text-right"
                  style={{ color: "var(--text-2)" }}
                >
                  {p.qty}
                </span>
                <span className="font-mono tabular-nums text-right">
                  {money(p.market_value)}
                </span>
                <span
                  className="font-mono tabular-nums text-right"
                  style={{ color: plUp ? "var(--pos)" : "var(--neg)" }}
                >
                  {plUp ? "+" : ""}
                  {money(p.unrealized_pl)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </AskResultCard>
  );
}
