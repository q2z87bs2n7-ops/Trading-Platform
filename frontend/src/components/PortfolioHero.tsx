import { useAccount, useOrders, usePnlHistory, usePositions } from "../data/hooks";
import { isCryptoOrder, isCryptoPosition } from "../lib/asset-class";
import type { Order, Position } from "../types";

const money = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD" });

const pct = (n: number) => `${n >= 0 ? "+" : ""}${(n * 100).toFixed(2)}%`;

type AssetClass = "stocks" | "crypto";

const TERMINAL = new Set([
  "filled",
  "canceled",
  "cancelled",
  "expired",
  "rejected",
  "done_for_day",
  "replaced",
]);
const isLive = (o: Order) => !TERMINAL.has(o.status.toLowerCase());

// ── Net P/L curve card ────────────────────────────────────────────────────────
// Running cumulative net P/L for this silo, reconstructed from fills + daily
// closes (see backend/app/alpaca/pnl.py). The curve is anchored on the
// notional entry cost of open positions; the readout is realized + unrealized
// P/L (curve tip minus open cost basis), deposits ignored.

function NetPnlCard({
  assetClass,
  costBasis,
}: {
  assetClass: AssetClass;
  costBasis: number;
}) {
  const history = usePnlHistory(assetClass);
  const pnl = history.data?.pnl ?? [];
  const title = assetClass === "crypto" ? "Crypto" : "Stocks";

  if (history.isPending && pnl.length === 0) {
    return (
      <div
        className="rounded-card-lg p-[22px] flex flex-col gap-3 animate-pulse"
        style={{
          background: "var(--panel)",
          border: "1px solid var(--border)",
          boxShadow: "var(--shadow-sm)",
          minHeight: 220,
        }}
      >
        <div className="h-3 w-32 rounded" style={{ background: "var(--panel-2)" }} />
        <div className="h-[160px] rounded" style={{ background: "var(--panel-2)" }} />
      </div>
    );
  }

  if (pnl.length < 2) {
    return (
      <div
        className="rounded-card-lg p-[22px] flex flex-col gap-3"
        style={{
          background: "var(--panel)",
          border: "1px solid var(--border)",
          boxShadow: "var(--shadow-sm)",
          minHeight: 220,
        }}
      >
        <span
          className="text-[12px]"
          style={{ color: "var(--mute)", letterSpacing: "0.02em" }}
        >
          Net P/L · all {title} trades
        </span>
        <div
          className="grid place-items-center text-[13px] flex-1"
          style={{ color: "var(--mute)" }}
        >
          No trade history yet.
        </div>
      </div>
    );
  }

  const last = pnl[pnl.length - 1];
  const netPl = last - costBasis;
  const netPlPct = costBasis > 0 ? netPl / costBasis : 0;
  const up = netPl >= 0;
  const stroke = up ? "var(--pos)" : "var(--neg)";

  const min = Math.min(...pnl);
  const max = Math.max(...pnl);
  const range = max - min || 1;
  const W = 600;
  const H = 160;
  const stepX = W / (pnl.length - 1);
  const points = pnl.map((v, i) => ({
    x: i * stepX,
    y: H - ((v - min) / range) * (H - 8) - 4,
  }));
  const linePath = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(" ");
  const areaPath = `${linePath} L ${W} ${H} L 0 ${H} Z`;

  return (
    <div
      className="rounded-card-lg p-[22px] flex flex-col gap-3"
      style={{
        background: "var(--panel)",
        border: "1px solid var(--border)",
        boxShadow: "var(--shadow-sm)",
      }}
    >
      <div className="flex items-center justify-between">
        <span
          className="text-[12px]"
          style={{ color: "var(--mute)", letterSpacing: "0.02em" }}
        >
          Net P/L · all {title} trades
        </span>
        <span
          className="text-[12px] font-mono tabular-nums"
          style={{ color: stroke }}
        >
          {up ? "+" : ""}
          {money(netPl)} ({pct(netPlPct)})
        </span>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        height={160}
        preserveAspectRatio="none"
        className="block"
      >
        <defs>
          <linearGradient id="pnl-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={stroke} stopOpacity={0.18} />
            <stop offset="100%" stopColor={stroke} stopOpacity={0} />
          </linearGradient>
        </defs>
        <path d={areaPath} fill="url(#pnl-grad)" />
        <path d={linePath} fill="none" stroke={stroke} strokeWidth={1.5} />
      </svg>
    </div>
  );
}

// ── Portfolio value card ──────────────────────────────────────────────────────

function ValueCard({
  account,
  title,
  holdings,
  netEquity,
  dayPl,
  dayPlPct,
  unrealized,
  unrealizedPct,
  openOrderCount,
}: {
  account: ReturnType<typeof useAccount>["data"];
  title: string;
  holdings: number;
  netEquity?: number;
  dayPl: number;
  dayPlPct: number;
  unrealized: number;
  unrealizedPct: number;
  openOrderCount: number;
}) {
  if (!account) {
    return (
      <div
        className="rounded-card-lg p-[22px] flex flex-col gap-3 animate-pulse"
        style={{
          background: "var(--panel)",
          border: "1px solid var(--border)",
          boxShadow: "var(--shadow-sm)",
          minHeight: 220,
        }}
      >
        <div className="h-3 w-28 rounded" style={{ background: "var(--panel-2)" }} />
        <div className="h-12 w-56 rounded" style={{ background: "var(--panel-2)" }} />
        <div className="h-4 w-64 rounded" style={{ background: "var(--panel-2)" }} />
      </div>
    );
  }

  const dayUp = dayPl >= 0;
  const unrealUp = unrealized >= 0;

  return (
    <div
      className="rounded-card-lg p-[22px] flex flex-col gap-3"
      style={{
        background: "var(--panel)",
        border: "1px solid var(--border)",
        boxShadow: "var(--shadow-sm)",
      }}
    >
      <span
        className="text-[12px]"
        style={{ color: "var(--mute)", letterSpacing: "0.02em" }}
      >
        {title} value
      </span>
      <div
        className="font-semibold tabular-nums"
        style={{
          fontSize: "clamp(34px, 5.4vw, 48px)",
          letterSpacing: "-0.028em",
          lineHeight: 1,
        }}
      >
        {money(holdings)}
      </div>
      {netEquity !== undefined && (
        <div className="flex items-baseline gap-2">
          <span className="text-[12px]" style={{ color: "var(--mute)", letterSpacing: "0.02em" }}>
            Net equity
          </span>
          <span className="text-[15px] font-medium tabular-nums" style={{ letterSpacing: "-0.015em" }}>
            {money(netEquity)}
          </span>
        </div>
      )}
      <div className="flex gap-3.5 items-baseline flex-wrap">
        <span
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-[12.5px] font-medium tabular-nums"
          style={{
            background: dayUp ? "var(--pos-bg)" : "var(--neg-bg)",
            color: dayUp ? "var(--pos)" : "var(--neg)",
            letterSpacing: "-0.005em",
          }}
        >
          {dayUp ? "↑" : "↓"} {dayUp ? "+" : ""}
          {money(dayPl)} ({pct(dayPlPct)}) today
        </span>
      </div>
      <div className="flex gap-6 mt-1 flex-wrap">
        <div className="flex flex-col">
          <small className="text-[12px]" style={{ color: "var(--mute)" }}>
            Unrealized P&L
          </small>
          <strong
            className="font-medium text-[16px] tabular-nums"
            style={{ color: unrealUp ? "var(--pos)" : "var(--neg)" }}
          >
            {unrealUp ? "+" : ""}
            {money(unrealized)} ({pct(unrealizedPct)})
          </strong>
        </div>
        <div className="flex flex-col">
          <small className="text-[12px]" style={{ color: "var(--mute)" }}>
            Open orders
          </small>
          <strong className="font-medium text-[16px] tabular-nums">
            {openOrderCount}
          </strong>
        </div>
      </div>
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

export default function PortfolioHero({ assetClass }: { assetClass: AssetClass }) {
  const account = useAccount();
  const positions = usePositions();
  const orders = useOrders("open", 50);

  const title = assetClass === "crypto" ? "Crypto" : "Stocks";
  const allPositions = positions.data?.positions || [];
  const siloPositions = allPositions.filter((p: Position) =>
    assetClass === "crypto" ? isCryptoPosition(p) : !isCryptoPosition(p),
  );
  const holdings = siloPositions.reduce((s, p) => s + p.market_value, 0);
  const unrealized = siloPositions.reduce((s, p) => s + p.unrealized_pl, 0);
  const costBasis = siloPositions.reduce((s, p) => s + p.cost_basis, 0);
  const cryptoMarketValue = allPositions
    .filter((p: Position) => isCryptoPosition(p))
    .reduce((s, p) => s + p.market_value, 0);
  const stockNetEquity =
    account.data && assetClass === "stocks"
      ? account.data.equity - cryptoMarketValue
      : undefined;
  const unrealizedPct = costBasis > 0 ? unrealized / costBasis : 0;
  const dayPl = siloPositions.reduce((s, p) => s + p.unrealized_intraday_pl, 0);
  const dayBasis = holdings - dayPl;
  const dayPlPct = dayBasis > 0 ? dayPl / dayBasis : 0;

  const openOrderCount = (orders.data?.orders || [])
    .filter(isLive)
    .filter((o) => (assetClass === "crypto" ? isCryptoOrder(o) : !isCryptoOrder(o)))
    .length;

  return (
    <div className="grid gap-4 mb-6 grid-cols-1 lg:grid-cols-[1.4fr_1fr]">
      <ValueCard
        account={account.data}
        title={title}
        holdings={holdings}
        netEquity={stockNetEquity}
        dayPl={dayPl}
        dayPlPct={dayPlPct}
        unrealized={unrealized}
        unrealizedPct={unrealizedPct}
        openOrderCount={openOrderCount}
      />
      <NetPnlCard assetClass={assetClass} costBasis={costBasis} />
    </div>
  );
}
