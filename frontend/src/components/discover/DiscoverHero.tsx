import { useMemo } from "react";

import { usePnlHistory } from "../../data/hooks";
import { money, pct } from "../../lib/format";
import type { Position } from "../../types";

type AssetClass = "stocks" | "crypto";

// Discover hero: silo holdings + day chip + net-P/L sparkline. Single-column
// since the allocation donut moved to Portfolio — Discover is for market
// discovery, the donut belongs alongside the rest of the portfolio summary.
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
}: {
  assetClass: AssetClass;
  title: string;
  value: number;
  dayPl: number;
  dayPlPct: number;
  unrealized: number;
  unrealizedPct: number;
  // Kept on the API for parity with the previous donut-bearing version; the
  // hero itself no longer reads it, but call sites pass it through and other
  // sibling surfaces (Discover's AI summary) still expect the shape.
  positions: Position[] | undefined;
}) {
  // Suppress unused warning; documented above why we still accept the prop.
  void positions;
  const history = usePnlHistory(assetClass);
  const pnl = history.data?.pnl ?? [];

  const dayUp = dayPl >= 0;
  const allUp = unrealized >= 0;

  // Curve geometry — 80 px area-filled sparkline beneath the day chip. The
  // backend always appends a "today" tip at index N-1 (live market value),
  // with N-2 being yesterday's close — i.e. the baseline against which the
  // day chip is computed. Marker that index so the all-time curve makes
  // sense alongside the day chip ("everything to the right of the line is
  // today").
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
    // Marker at yesterday's close (today's baseline). Skip when there are
    // fewer than three points (single-day account) or when it'd visually
    // collide with the tip.
    const todayIdx = pnl.length - 2;
    const marker =
      pnl.length >= 3 && todayIdx > 0
        ? { x: todayIdx * stepX, y: pts[todayIdx].y }
        : null;
    return { W, H, line, area, stroke, marker };
  }, [pnl]);

  return (
    <div
      className="rounded-card-lg mb-6"
      style={{
        background: "var(--panel)",
        border: "1px solid var(--border)",
        boxShadow: "var(--shadow-sm)",
      }}
    >
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
            {curve.marker && (
              <>
                <line
                  x1={curve.marker.x}
                  y1={0}
                  x2={curve.marker.x}
                  y2={curve.H}
                  stroke="var(--mute)"
                  strokeWidth={1}
                  strokeDasharray="3 3"
                  opacity={0.5}
                />
                <circle
                  cx={curve.marker.x}
                  cy={curve.marker.y}
                  r={2.5}
                  fill="var(--mute)"
                  opacity={0.7}
                />
              </>
            )}
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
