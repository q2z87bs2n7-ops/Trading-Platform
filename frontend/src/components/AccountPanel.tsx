import { useRef } from "react";

import { useAccount, useFxcmAccount, useFxcmOrders } from "../data/hooks";
import { useContainerNarrow } from "../hooks/useContainerNarrow";
import { money } from "../lib/format";

const ROOMY_W = 360;
const TIGHT_W = 240;

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

// Equity headline + today's P/L — shared shell for both silos. The container
// ref drives the responsive equity font size.
function Equity({
  px,
  equity,
  pl,
  plPct,
}: {
  px: number;
  equity: number;
  pl: number;
  plPct: number;
}) {
  const up = pl >= 0;
  return (
    <div>
      <div
        className="text-[11px] font-medium uppercase mb-0.5"
        style={{ color: "var(--mute)", letterSpacing: "0.04em" }}
      >
        Equity
      </div>
      <div
        className="font-mono font-semibold tabular-nums leading-tight"
        style={{ fontSize: px }}
      >
        {money(equity)}
      </div>
      <div
        className="font-mono text-[13px] tabular-nums"
        style={{ color: up ? "var(--pos)" : "var(--neg)" }}
      >
        {up ? "+" : ""}
        {money(pl)} ({up ? "+" : ""}
        {(plPct * 100).toFixed(2)}%) today
      </div>
    </div>
  );
}

/**
 * Curated whole-account overview — equity + day P/L + the buying-power / cash /
 * positions figures that actually matter (only what `/api/account` exposes).
 * Location-agnostic: takes `assetClass` and reads `useAccount`; the Workspace
 * Account widget wraps it. CFD reads the FXCM bridge instead (margin + balance).
 */
export default function AccountPanel({
  assetClass,
}: {
  assetClass: "stocks" | "crypto" | "cfd";
}) {
  if (assetClass === "cfd") return <CfdAccountPanel />;
  return <AlpacaAccountPanel assetClass={assetClass} />;
}

function AlpacaAccountPanel({
  assetClass,
}: {
  assetClass: "stocks" | "crypto";
}) {
  const { data: acct } = useAccount();
  const ref = useRef<HTMLDivElement>(null);
  const tight = useContainerNarrow(ref, TIGHT_W);
  const roomyOrAbove = !useContainerNarrow(ref, ROOMY_W);
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
  const bp =
    assetClass === "crypto"
      ? acct.non_marginable_buying_power
      : acct.buying_power;
  const equityPx = tight ? 20 : roomyOrAbove ? 32 : 24;

  return (
    <div ref={ref} className="flex flex-col gap-3">
      <Equity px={equityPx} equity={acct.equity} pl={pl} plPct={plpc} />

      <div className="flex flex-col" style={{ borderTop: "1px solid var(--hairline)" }}>
        <Row k="Buying power" v={money(bp)} />
        <Row k="Cash" v={money(acct.cash)} tone={acct.cash < 0 ? "var(--neg)" : undefined} />
        <Row k="Positions value" v={money(acct.long_market_value)} />
        {acct.short_market_value !== 0 && (
          <Row k="Short value" v={money(acct.short_market_value)} />
        )}
        <Row k="Portfolio value" v={money(acct.portfolio_value)} />
        <Row
          k="Margin (init / maint)"
          v={`${money(acct.initial_margin)} / ${money(acct.maintenance_margin)}`}
        />
      </div>
    </div>
  );
}

// FXCM demo account — equity / day P/L from the bridge, plus margin (used /
// free), balance, total P/L, and an open-order count. Mirrors the figures the
// CFD PortfolioHero shows. Day basis = equity - day_pl (no market-open anchor).
function CfdAccountPanel() {
  const { data: acct } = useFxcmAccount(true);
  const { data: orders } = useFxcmOrders(true);
  const ref = useRef<HTMLDivElement>(null);
  const tight = useContainerNarrow(ref, TIGHT_W);
  const roomyOrAbove = !useContainerNarrow(ref, ROOMY_W);
  if (!acct) {
    return (
      <div className="text-[13px] p-1" style={{ color: "var(--mute)" }}>
        Loading account…
      </div>
    );
  }

  const equity = Number(acct.equity ?? 0);
  const dayPl = Number(acct.day_pl ?? 0);
  const grossPl = Number(acct.gross_pl ?? 0);
  const dayBasis = equity - dayPl;
  const dayPlPct = dayBasis > 0 ? dayPl / dayBasis : 0;
  const grossUp = grossPl >= 0;
  const openOrders = Array.isArray(orders) ? orders.length : 0;
  const equityPx = tight ? 20 : roomyOrAbove ? 32 : 24;

  return (
    <div ref={ref} className="flex flex-col gap-3">
      <Equity px={equityPx} equity={equity} pl={dayPl} plPct={dayPlPct} />

      <div className="flex flex-col" style={{ borderTop: "1px solid var(--hairline)" }}>
        <Row k="Balance" v={money(Number(acct.balance ?? 0))} />
        <Row k="Used margin" v={money(Number(acct.usedmargin ?? 0))} />
        <Row k="Free margin" v={money(Number(acct.usablemargin ?? 0))} />
        <Row
          k="Total P/L"
          v={`${grossUp ? "+" : ""}${money(grossPl)}`}
          tone={grossUp ? "var(--pos)" : "var(--neg)"}
        />
        <Row k="Open orders" v={String(openOrders)} />
      </div>
    </div>
  );
}
