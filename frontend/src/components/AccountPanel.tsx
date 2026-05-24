import { useAccount } from "../data/hooks";
import { money } from "../lib/format";

function Row({ k, v, tone }: { k: string; v: string; tone?: string }) {
  return (
    <div className="flex items-center justify-between py-1.5 text-[13px]">
      <span style={{ color: "var(--mute)" }}>{k}</span>
      <span
        className="font-mono tabular-nums"
        style={tone ? { color: tone } : undefined}
      >
        {v}
      </span>
    </div>
  );
}

/**
 * Curated whole-account overview — equity + day P/L + the buying-power / cash /
 * positions figures that actually matter (only what `/api/account` exposes).
 * Location-agnostic: takes `assetClass` and reads `useAccount`; the Workspace
 * Account widget wraps it.
 */
export default function AccountPanel({
  assetClass,
}: {
  assetClass: "stocks" | "crypto";
}) {
  const { data: acct } = useAccount();
  if (!acct) {
    return (
      <div className="text-[13px] p-1" style={{ color: "var(--mute)" }}>
        Loading account…
      </div>
    );
  }

  const pl = acct.equity - acct.equity_at_market_open;
  const plpc =
    acct.equity_at_market_open > 0 ? pl / acct.equity_at_market_open : 0;
  const up = pl >= 0;
  const plColor = up ? "var(--pos)" : "var(--neg)";
  const bp =
    assetClass === "crypto"
      ? acct.non_marginable_buying_power
      : acct.buying_power;

  return (
    <div className="flex flex-col gap-3">
      <div>
        <div
          className="text-[11px] font-medium uppercase mb-0.5"
          style={{ color: "var(--mute)", letterSpacing: "0.04em" }}
        >
          Equity
        </div>
        <div className="font-mono text-[24px] font-semibold tabular-nums leading-tight">
          {money(acct.equity)}
        </div>
        <div className="font-mono text-[13px] tabular-nums" style={{ color: plColor }}>
          {up ? "+" : ""}
          {money(pl)} ({up ? "+" : ""}
          {(plpc * 100).toFixed(2)}%) today
        </div>
      </div>

      <div className="flex flex-col" style={{ borderTop: "1px solid var(--hairline)" }}>
        <Row k="Buying power" v={money(bp)} />
        <Row k="Cash" v={money(acct.cash)} tone={acct.cash < 0 ? "var(--neg)" : undefined} />
        <Row k="Positions value" v={money(acct.long_market_value)} />
        <Row k="Portfolio value" v={money(acct.portfolio_value)} />
      </div>
    </div>
  );
}
