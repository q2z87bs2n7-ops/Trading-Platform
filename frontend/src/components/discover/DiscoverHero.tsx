import { useMemo, useState } from "react";

import { usePnlHistory } from "../../data/hooks";
import { money, pct } from "../../lib/format";
import type { Position } from "../../types";
import { buildArc, DONUT_COLORS } from "./util";

type AssetClass = "stocks" | "crypto";

// Unified desktop Discover hero. Replaces the old BalanceCard + AllocationCard
// pair: equity / day chip / PnL sparkline on the left, hairline divider, donut
// + legend on the right. Mobile keeps using HeroCardMobile.
//
// TODO: spec calls for a 1D/1W/1M/YTD/ALL window switcher feeding the curve.
// Backend currently supports only 1M/3M/1Y/ALL (backend/app/alpaca/pnl.py).
// Switcher will land once backend grows the smaller periods.
export function DiscoverHero({
  assetClass,
  title,
  value,
  dayPl,
  dayPlPct,
  unrealized,
  unrealizedPct,
  positions,
  colors = DONUT_COLORS,
}: {
  assetClass: AssetClass;
  title: string;
  value: number;
  dayPl: number;
  dayPlPct: number;
  unrealized: number;
  unrealizedPct: number;
  positions: Position[] | undefined;
  colors?: string[];
}) {
  const history = usePnlHistory(assetClass);
  const pnl = history.data?.pnl ?? [];
  const [hovered, setHovered] = useState<string | null>(null);

  const dayUp = dayPl >= 0;
  const allUp = unrealized >= 0;

  const open = (positions || []).filter((p) => p.market_value > 0);
  const total = open.reduce((s, p) => s + p.market_value, 0);
  const slices = useMemo(() => {
    if (total === 0) return [];
    let a = -Math.PI / 2;
    return open.map((p, i) => {
      const sweep = (p.market_value / total) * 2 * Math.PI;
      const a0 = a;
      const a1 = a + sweep;
      a = a1;
      return {
        symbol: p.symbol,
        share: p.market_value / total,
        color: colors[i % colors.length],
        d: buildArc(60, 60, 50, 38, a0, a1),
      };
    });
  }, [open, total, colors]);

  // Curve geometry — 80 px area-filled sparkline beneath the day chip.
  const curve = useMemo(() => {
    if (pnl.length < 2) return null;
    const W = 600;
    const H = 80;
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

  return (
    <div
      className="rounded-card-lg mb-6 grid"
      style={{
        background: "var(--panel)",
        border: "1px solid var(--border)",
        boxShadow: "var(--shadow-sm)",
        gridTemplateColumns: "1.4fr 1fr",
      }}
    >
      {/* LEFT — equity, day chip, sparkline */}
      <div className="flex flex-col gap-3 p-[22px]">
        <span
          className="text-[12px]"
          style={{ color: "var(--mute)", letterSpacing: "0.02em" }}
        >
          {title} holdings
        </span>
        <div
          className="font-mono font-semibold tabular-nums"
          style={{
            fontSize: "clamp(28px, 3.6vw, 36px)",
            letterSpacing: "-0.025em",
            lineHeight: 1,
          }}
        >
          {money(value)}
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
            style={{ color: "var(--mute)" }}
            className="text-[11.5px] tabular-nums"
          >
            Day · vs market open
          </span>
        </div>
        <div className="text-[11.5px] tabular-nums" style={{ color: "var(--mute)" }}>
          All time {allUp ? "+" : ""}
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
              <linearGradient id="disc-hero-pnl" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={curve.stroke} stopOpacity={0.18} />
                <stop offset="100%" stopColor={curve.stroke} stopOpacity={0} />
              </linearGradient>
            </defs>
            <path d={curve.area} fill="url(#disc-hero-pnl)" />
            <path
              d={curve.line}
              fill="none"
              stroke={curve.stroke}
              strokeWidth={1.5}
            />
          </svg>
        ) : (
          <div
            className="text-[12px] mt-1"
            style={{ color: "var(--mute)", minHeight: 80 }}
          >
            {history.isPending ? "Loading curve…" : "No trade history yet."}
          </div>
        )}
      </div>

      {/* RIGHT — allocation donut + legend, separated by a hairline */}
      <div
        className="flex flex-col gap-3 p-[22px]"
        style={{ borderLeft: "1px solid var(--hairline)" }}
      >
        <div className="flex items-center justify-between">
          <span
            className="text-[12px]"
            style={{ color: "var(--mute)", letterSpacing: "0.02em" }}
          >
            Allocation
          </span>
          <span className="text-[11.5px]" style={{ color: "var(--mute)" }}>
            {open.length} symbol{open.length === 1 ? "" : "s"}
          </span>
        </div>
        {open.length === 0 ? (
          <div className="flex items-center justify-center py-8 text-[13px]" style={{ color: "var(--mute)" }}>
            No open positions
          </div>
        ) : (
          <div className="flex items-center gap-[18px] min-h-[120px]">
            <div className="relative shrink-0">
              <svg width={120} height={120} viewBox="0 0 120 120" className="block">
                {slices.map((s) => (
                  <path
                    key={s.symbol}
                    d={s.d}
                    fill={s.color}
                    opacity={hovered && hovered !== s.symbol ? 0.35 : 1}
                    style={{ transition: "opacity 0.15s", cursor: "pointer" }}
                    onMouseEnter={() => setHovered(s.symbol)}
                    onMouseLeave={() => setHovered(null)}
                  />
                ))}
              </svg>
            </div>
            <div
              className="flex flex-col gap-1 text-[12.5px] flex-1 min-w-0"
              style={{ maxHeight: 120, overflow: "auto" }}
            >
              {slices.map((s) => (
                <div
                  key={s.symbol}
                  className="flex items-center justify-between gap-2.5"
                  onMouseEnter={() => setHovered(s.symbol)}
                  onMouseLeave={() => setHovered(null)}
                  style={{ opacity: hovered && hovered !== s.symbol ? 0.45 : 1 }}
                >
                  <span className="flex items-center gap-1.5 min-w-0">
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ background: s.color }}
                    />
                    <strong className="font-semibold truncate">{s.symbol}</strong>
                  </span>
                  <span
                    className="tabular-nums font-mono"
                    style={{ color: "var(--mute)" }}
                  >
                    {(s.share * 100).toFixed(1)}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function DiscoverHeroSkeleton() {
  return (
    <div
      className="rounded-card-lg p-[22px] mb-6 flex flex-col gap-3 animate-pulse"
      style={{
        background: "var(--panel)",
        border: "1px solid var(--border)",
        boxShadow: "var(--shadow-sm)",
        minHeight: 220,
      }}
    >
      <div className="h-3 w-32 rounded" style={{ background: "var(--panel-2)" }} />
      <div className="h-9 w-56 rounded" style={{ background: "var(--panel-2)" }} />
      <div className="h-4 w-64 rounded" style={{ background: "var(--panel-2)" }} />
      <div className="h-20 w-full rounded mt-1" style={{ background: "var(--panel-2)" }} />
    </div>
  );
}
