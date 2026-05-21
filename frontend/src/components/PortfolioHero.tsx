import { useAccount, useOrders, usePortfolioHistory, usePositions } from "../data/hooks";
import type { Order, Position } from "../types";

const money = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD" });

const pct = (n: number) => `${n >= 0 ? "+" : ""}${(n * 100).toFixed(2)}%`;

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

// ── Equity curve card ─────────────────────────────────────────────────────────
// Renders portfolio equity over the period as a smooth area chart. Pulls
// from /api/portfolio-history which already returns aligned timestamp +
// equity arrays.

function EquityCurveCard() {
  const history = usePortfolioHistory("1M", "1D");
  const eq = history.data?.equity ?? [];

  if (history.isPending && eq.length === 0) {
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

  if (eq.length < 2) {
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
          Equity curve · 30d
        </span>
        <div
          className="grid place-items-center text-[13px] flex-1"
          style={{ color: "var(--mute)" }}
        >
          Not enough history yet.
        </div>
      </div>
    );
  }

  const min = Math.min(...eq);
  const max = Math.max(...eq);
  const range = max - min || 1;
  const W = 600;
  const H = 160;
  const stepX = W / (eq.length - 1);
  const points = eq.map((v, i) => ({
    x: i * stepX,
    y: H - ((v - min) / range) * (H - 8) - 4,
  }));
  const linePath = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(" ");
  const areaPath = `${linePath} L ${W} ${H} L 0 ${H} Z`;
  const last = eq[eq.length - 1];
  const first = eq[0];
  const periodPl = last - first;
  const periodUp = periodPl >= 0;
  const stroke = periodUp ? "var(--pos)" : "var(--neg)";

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
          Equity curve · 30d
        </span>
        <span
          className="text-[12px] font-mono tabular-nums"
          style={{ color: stroke }}
        >
          {periodUp ? "+" : ""}
          {money(periodPl)}
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
          <linearGradient id="equity-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={stroke} stopOpacity={0.18} />
            <stop offset="100%" stopColor={stroke} stopOpacity={0} />
          </linearGradient>
        </defs>
        <path d={areaPath} fill="url(#equity-grad)" />
        <path d={linePath} fill="none" stroke={stroke} strokeWidth={1.5} />
      </svg>
    </div>
  );
}

// ── Portfolio value card ──────────────────────────────────────────────────────

function ValueCard({
  account,
  positions,
  openOrderCount,
}: {
  account: ReturnType<typeof useAccount>["data"];
  positions: Position[] | undefined;
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

  const unrealized = (positions || []).reduce(
    (s, p) => s + p.unrealized_pl,
    0,
  );
  const cost = (positions || []).reduce((s, p) => s + p.cost_basis, 0);
  const unrealizedPct = cost > 0 ? unrealized / cost : 0;
  const dayPl = account.equity - account.equity_at_market_open;
  const dayPlPct =
    account.equity_at_market_open > 0
      ? dayPl / account.equity_at_market_open
      : 0;
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
        Portfolio value
      </span>
      <div
        className="font-semibold tabular-nums"
        style={{
          fontSize: "clamp(34px, 5.4vw, 48px)",
          letterSpacing: "-0.028em",
          lineHeight: 1,
        }}
      >
        {money(account.portfolio_value)}
      </div>
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
            Cash
          </small>
          <strong className="font-medium text-[16px] tabular-nums">
            {money(account.cash)}
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

export default function PortfolioHero() {
  const account = useAccount();
  const positions = usePositions();
  const orders = useOrders("open", 50);
  const openOrderCount = (orders.data?.orders || []).filter(isLive).length;

  return (
    <div
      className="grid gap-4 mb-6"
      style={{ gridTemplateColumns: "1.4fr 1fr" }}
    >
      <ValueCard
        account={account.data}
        positions={positions.data?.positions}
        openOrderCount={openOrderCount}
      />
      <EquityCurveCard />
    </div>
  );
}
