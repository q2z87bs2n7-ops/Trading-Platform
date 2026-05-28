import { useMemo } from "react";

import {
  useAccount,
  useFxcmAccount,
  useFxcmOrders,
  useFxcmPositions,
  useOrders,
  usePnlHistory,
  usePositions,
} from "../data/hooks";
import { useMobile } from "../hooks/useMobile";
import { isCryptoOrder, isCryptoPosition } from "../lib/asset-class";
import type { Order, Position } from "../types";

const money = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD" });

const pct = (n: number) => `${n >= 0 ? "+" : ""}${(n * 100).toFixed(2)}%`;

type AssetClass = "stocks" | "crypto" | "forex";

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

// Unified Portfolio hero (replaces the old 60/40 ValueCard + NetPnlCard pair).
// LEFT: equity, day chip, ~70px area-filled PnL sparkline. RIGHT: 2x2 stat
// grid (Cash · Buying Power · Total P/L · Open orders), separated by a
// hairline. Window switcher waits on backend pnl-history growing 1D/1W/YTD;
// curve here defaults to ALL.
export default function PortfolioHero({ assetClass }: { assetClass: AssetClass }) {
  const isMobile = useMobile();
  if (assetClass === "forex") return <ForexPortfolioHero isMobile={isMobile} />;
  return <AlpacaPortfolioHero assetClass={assetClass} isMobile={isMobile} />;
}

function AlpacaPortfolioHero({
  assetClass,
  isMobile,
}: {
  assetClass: "stocks" | "crypto";
  isMobile: boolean;
}) {
  const account = useAccount();
  const positions = usePositions();
  const orders = useOrders("open", 50);
  const history = usePnlHistory(assetClass);

  const title = assetClass === "crypto" ? "Crypto" : "Stocks";
  const siloPositions = (positions.data?.positions || []).filter((p: Position) =>
    assetClass === "crypto" ? isCryptoPosition(p) : !isCryptoPosition(p),
  );
  const holdings = siloPositions.reduce((s, p) => s + p.market_value, 0);
  const unrealized = siloPositions.reduce((s, p) => s + p.unrealized_pl, 0);
  const costBasis = siloPositions.reduce((s, p) => s + p.cost_basis, 0);
  const unrealizedPct = costBasis > 0 ? unrealized / costBasis : 0;
  const dayPl = siloPositions.reduce((s, p) => s + p.unrealized_intraday_pl, 0);
  const dayBasis = holdings - dayPl;
  const dayPlPct = dayBasis > 0 ? dayPl / dayBasis : 0;

  const openOrderCount = (orders.data?.orders || [])
    .filter(isLive)
    .filter((o) => (assetClass === "crypto" ? isCryptoOrder(o) : !isCryptoOrder(o)))
    .length;

  const dayUp = dayPl >= 0;
  const unrealUp = unrealized >= 0;

  const acct = account.data;
  const bp = acct
    ? assetClass === "crypto"
      ? acct.non_marginable_buying_power
      : acct.buying_power
    : 0;
  const cash = acct?.cash ?? 0;

  const pnl = history.data?.pnl ?? [];
  const curve = useMemo(() => {
    if (pnl.length < 2) return null;
    const W = 600;
    const H = 70;
    const min = Math.min(...pnl);
    const max = Math.max(...pnl);
    const range = max - min || 1;
    const stepX = W / (pnl.length - 1);
    const tipUp = pnl[pnl.length - 1] >= pnl[0];
    const stroke = tipUp ? "var(--pos)" : "var(--neg)";
    const pts = pnl.map((v, i) => ({
      x: i * stepX,
      y: H - ((v - min) / range) * (H - 8) - 4,
    }));
    const line = pts
      .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
      .join(" ");
    const area = `${line} L ${W} ${H} L 0 ${H} Z`;
    return { W, H, line, area, stroke };
  }, [pnl]);

  if (!acct && account.isPending) {
    return (
      <div
        className="rounded-card-lg mb-6 p-[22px] flex flex-col gap-3 animate-pulse"
        style={{
          background: "var(--panel)",
          border: "1px solid var(--border)",
          boxShadow: "var(--shadow-sm)",
          minHeight: 220,
        }}
      >
        <div className="h-3 w-32 rounded" style={{ background: "var(--panel-2)" }} />
        <div className="h-10 w-56 rounded" style={{ background: "var(--panel-2)" }} />
        <div className="h-4 w-72 rounded" style={{ background: "var(--panel-2)" }} />
      </div>
    );
  }

  // Per-silo stats:
  // - Crypto: BP (non-marginable, = cash effectively, so we don't show cash too) ·
  //   Total P/L · Open orders.
  // - Stocks: Cash · Buying power · Net equity (holdings - margin used) ·
  //   Total P/L · Open orders.
  const marginUsed = acct?.initial_margin ?? 0;
  const netEquity = holdings - marginUsed;
  const stats: Array<{ label: string; value: string; color?: string }> =
    assetClass === "crypto"
      ? [
          { label: "Buying power", value: money(bp) },
          {
            label: "Total P/L",
            value: `${unrealUp ? "+" : ""}${money(unrealized)}`,
            color: unrealUp ? "var(--pos)" : "var(--neg)",
          },
          { label: "Open orders", value: String(openOrderCount) },
        ]
      : [
          { label: "Cash", value: money(cash) },
          { label: "Buying power", value: money(bp) },
          { label: "Net equity", value: money(netEquity) },
          {
            label: "Total P/L",
            value: `${unrealUp ? "+" : ""}${money(unrealized)}`,
            color: unrealUp ? "var(--pos)" : "var(--neg)",
          },
          { label: "Open orders", value: String(openOrderCount) },
        ];

  return (
    <div
      className="rounded-card-lg mb-6 grid"
      style={{
        background: "var(--panel)",
        border: "1px solid var(--border)",
        boxShadow: "var(--shadow-sm)",
        // Mobile collapses to a single column — the 60/40 grid bleeds the
        // hero number off the right edge at iPhone widths.
        gridTemplateColumns: isMobile ? "1fr" : "1.4fr 1fr",
      }}
    >
      {/* LEFT (mobile: top) — equity + day chip + sparkline */}
      <div
        className="flex flex-col gap-3"
        style={{ padding: isMobile ? "16px 16px 14px" : "22px" }}
      >
        <span
          className="text-[12px]"
          style={{ color: "var(--mute)", letterSpacing: "0.02em" }}
        >
          {title} holdings
        </span>
        <div
          className="font-mono font-semibold tabular-nums"
          style={{
            fontSize: isMobile
              ? "clamp(24px, 7.5vw, 30px)"
              : "clamp(30px, 4vw, 38px)",
            letterSpacing: "-0.025em",
            lineHeight: 1,
            // Belt-and-suspenders: even with the single-col grid, the long
            // mono number can still bleed if the parent ever stops being
            // min-width: 0 (Dockview / mobile container quirks).
            overflowWrap: "anywhere",
          }}
        >
          {money(holdings)}
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
            {money(dayPl)} ({pct(dayPlPct)})
          </span>
          <span
            className="text-[11.5px] tabular-nums"
            style={{ color: "var(--mute)" }}
          >
            Day · vs market open
          </span>
        </div>
        <div className="text-[11.5px] tabular-nums" style={{ color: "var(--mute)" }}>
          All time {unrealUp ? "+" : ""}
          {money(unrealized)} ({pct(unrealizedPct)})
        </div>
        {curve ? (
          <svg
            viewBox={`0 0 ${curve.W} ${curve.H}`}
            width="100%"
            height={curve.H}
            preserveAspectRatio="none"
            className="block mt-1"
            aria-hidden
          >
            <defs>
              <linearGradient id="port-hero-pnl" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={curve.stroke} stopOpacity={0.18} />
                <stop offset="100%" stopColor={curve.stroke} stopOpacity={0} />
              </linearGradient>
            </defs>
            <path d={curve.area} fill="url(#port-hero-pnl)" />
            <path
              d={curve.line}
              fill="none"
              stroke={curve.stroke}
              strokeWidth={1.5}
              vectorEffect="non-scaling-stroke"
            />
          </svg>
        ) : (
          <div
            className="text-[12px] mt-1"
            style={{ color: "var(--mute)", minHeight: 70 }}
          >
            {history.isPending ? "Loading curve…" : "No trade history yet."}
          </div>
        )}
      </div>

      {/* RIGHT (mobile: bottom) — stat grid. Desktop sits beside the hero
         column behind a left hairline; mobile drops below with a top
         hairline and shifts to 3-col mini-stats per the spec. */}
      <div
        className="grid"
        style={{
          padding: isMobile ? "12px 16px 16px" : "22px",
          borderLeft: isMobile ? "0" : "1px solid var(--hairline)",
          borderTop: isMobile ? "1px solid var(--hairline)" : "0",
          gridTemplateColumns: isMobile ? "repeat(3, minmax(0, 1fr))" : "1fr 1fr",
          gap: isMobile ? "12px 14px" : 14,
          alignContent: "start",
        }}
      >
        {stats.map((s) => (
          <div key={s.label} className="flex flex-col gap-1 min-w-0">
            <span
              className="uppercase"
              style={{
                color: "var(--mute)",
                letterSpacing: "0.04em",
                fontSize: isMobile ? 9.5 : 10.5,
              }}
            >
              {s.label}
            </span>
            <span
              className="font-mono font-semibold tabular-nums"
              style={{
                fontSize: isMobile ? 14 : 18,
                color: s.color ?? "var(--text)",
                overflowWrap: "anywhere",
              }}
            >
              {s.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// FXCM forex silo: no per-symbol P/L history (bridge doesn't expose it), so
// the curve slot is intentionally empty — kept as a fixed-height spacer so
// the right-side stat grid keeps the same baseline as stocks/crypto.
function ForexPortfolioHero({ isMobile }: { isMobile: boolean }) {
  const account = useFxcmAccount(true);
  const positions = useFxcmPositions(true);
  const orders = useFxcmOrders(true);

  const acct = account.data;

  if (!acct && account.isPending) {
    return (
      <div
        className="rounded-card-lg mb-6 p-[22px] flex flex-col gap-3 animate-pulse"
        style={{
          background: "var(--panel)",
          border: "1px solid var(--border)",
          boxShadow: "var(--shadow-sm)",
          minHeight: 220,
        }}
      >
        <div className="h-3 w-32 rounded" style={{ background: "var(--panel-2)" }} />
        <div className="h-10 w-56 rounded" style={{ background: "var(--panel-2)" }} />
        <div className="h-4 w-72 rounded" style={{ background: "var(--panel-2)" }} />
      </div>
    );
  }

  const equity = Number(acct?.equity ?? 0);
  const dayPl = Number(acct?.day_pl ?? 0);
  const grossPl = Number((acct as Record<string, unknown> | undefined)?.gross_pl ?? 0);
  const usableMargin = Number(
    (acct as Record<string, unknown> | undefined)?.usablemargin ?? 0,
  );
  const usedMargin = Number(
    (acct as Record<string, unknown> | undefined)?.usedmargin ?? 0,
  );
  const dayBasis = equity - dayPl;
  const dayPlPct = dayBasis > 0 ? dayPl / dayBasis : 0;
  const dayUp = dayPl >= 0;
  const grossUp = grossPl >= 0;
  const openOrderCount = Array.isArray(orders.data) ? orders.data.length : 0;
  // Reserve the same vertical space the SVG curve uses in the stocks/crypto
  // variant (70px) so the stat-grid baseline aligns across silos.
  void positions;

  const stats: Array<{ label: string; value: string; color?: string }> = [
    { label: "Used margin", value: money(usedMargin) },
    { label: "Free margin", value: money(usableMargin) },
    {
      label: "Total P/L",
      value: `${grossUp ? "+" : ""}${money(grossPl)}`,
      color: grossUp ? "var(--pos)" : "var(--neg)",
    },
    { label: "Open orders", value: String(openOrderCount) },
  ];

  return (
    <div
      className="rounded-card-lg mb-6 grid"
      style={{
        background: "var(--panel)",
        border: "1px solid var(--border)",
        boxShadow: "var(--shadow-sm)",
        gridTemplateColumns: isMobile ? "1fr" : "1.4fr 1fr",
      }}
    >
      <div
        className="flex flex-col gap-3"
        style={{ padding: isMobile ? "16px 16px 14px" : "22px" }}
      >
        <span
          className="text-[12px]"
          style={{ color: "var(--mute)", letterSpacing: "0.02em" }}
        >
          Forex holdings
        </span>
        <div
          className="font-mono font-semibold tabular-nums"
          style={{
            fontSize: isMobile
              ? "clamp(24px, 7.5vw, 30px)"
              : "clamp(30px, 4vw, 38px)",
            letterSpacing: "-0.025em",
            lineHeight: 1,
            overflowWrap: "anywhere",
          }}
        >
          {money(equity)}
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
            {money(dayPl)} ({pct(dayPlPct)})
          </span>
          <span
            className="text-[11.5px] tabular-nums"
            style={{ color: "var(--mute)" }}
          >
            Day · vs market open
          </span>
        </div>
        <div style={{ minHeight: 70, marginTop: 4 }} aria-hidden />
      </div>

      <div
        className="grid"
        style={{
          padding: isMobile ? "12px 16px 16px" : "22px",
          borderLeft: isMobile ? "0" : "1px solid var(--hairline)",
          borderTop: isMobile ? "1px solid var(--hairline)" : "0",
          gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
          gap: isMobile ? "12px 14px" : 14,
          alignContent: "start",
        }}
      >
        {stats.map((s) => (
          <div key={s.label} className="flex flex-col gap-1 min-w-0">
            <span
              className="uppercase"
              style={{
                color: "var(--mute)",
                letterSpacing: "0.04em",
                fontSize: isMobile ? 9.5 : 10.5,
              }}
            >
              {s.label}
            </span>
            <span
              className="font-mono font-semibold tabular-nums"
              style={{
                fontSize: isMobile ? 14 : 18,
                color: s.color ?? "var(--text)",
                overflowWrap: "anywhere",
              }}
            >
              {s.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
