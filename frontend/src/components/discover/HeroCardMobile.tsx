import type { useAccount } from "../../data/hooks";
import type { Position } from "../../types";
import { money, pct } from "../../lib/format";
import { DONUT_COLORS } from "./util";

// Mobile-only combined Discover hero: BalanceCard + AllocationCard folded
// into one card with a horizontal allocation bar (no donut). Desktop keeps
// the two-card grid.
export function HeroCardMobile({
  account,
  title,
  value,
  dayPl,
  dayPlPct,
  buyingPower,
  positions,
  colors = DONUT_COLORS,
}: {
  account: ReturnType<typeof useAccount>["data"];
  title: string;
  value: number;
  dayPl: number;
  dayPlPct: number;
  unrealized: number;
  unrealizedPct: number;
  buyingPower: number;
  positions: Position[];
  colors?: string[];
}) {
  if (!account) {
    return (
      <div
        className="rounded-card-lg p-[22px] flex flex-col gap-3 animate-pulse"
        style={{
          background: "var(--panel)",
          border: "1px solid var(--border)",
          boxShadow: "var(--shadow-sm)",
          minHeight: 180,
        }}
      >
        <div className="h-3 w-24 rounded" style={{ background: "var(--panel-2)" }} />
        <div className="h-10 w-48 rounded" style={{ background: "var(--panel-2)" }} />
        <div className="h-4 w-64 rounded" style={{ background: "var(--panel-2)" }} />
      </div>
    );
  }

  const dayUp = dayPl >= 0;

  const open = (positions || [])
    .filter((p) => p.market_value > 0)
    .sort((a, b) => b.market_value - a.market_value);
  const total = open.reduce((s, p) => s + p.market_value, 0);

  const MAX_SEG = 4;
  const segs = open.map((p, i) => ({
    symbol: p.symbol,
    share: total > 0 ? p.market_value / total : 0,
    color: colors[i % colors.length],
  }));
  const barSegs =
    segs.length > MAX_SEG
      ? [
          ...segs.slice(0, MAX_SEG),
          {
            symbol: "more",
            share: segs.slice(MAX_SEG).reduce((s, x) => s + x.share, 0),
            color: "var(--mute)",
          },
        ]
      : segs;
  const legend = segs.slice(0, 3);
  const moreCount = segs.length - 3;

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
        {title} holdings
      </span>
      <div
        className="font-semibold tabular-nums"
        style={{
          fontSize: "var(--mob-hero-value, clamp(34px, 5.4vw, 48px))",
          letterSpacing: "-0.028em",
          lineHeight: 1,
        }}
      >
        {money(value)}
      </div>

      <div className="flex gap-2 items-center flex-wrap">
        <span
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-[12.5px] font-medium tabular-nums"
          style={{
            background: dayUp ? "var(--pos-bg)" : "var(--neg-bg)",
            color: dayUp ? "var(--pos)" : "var(--neg)",
          }}
        >
          {dayUp ? "↑" : "↓"} {dayUp ? "+" : ""}
          {money(dayPl)} ({pct(dayPlPct)})
        </span>
        <span
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-[12.5px] tabular-nums"
          style={{ background: "var(--panel-2)", color: "var(--text-2)" }}
        >
          <span style={{ color: "var(--mute)" }}>BP</span>
          {money(buyingPower)}
        </span>
      </div>

      {open.length === 0 ? (
        <p className="text-[13px]" style={{ color: "var(--mute)" }}>
          No open positions
        </p>
      ) : (
        <div className="flex flex-col gap-2 mt-1">
          <div
            className="flex h-2.5 w-full overflow-hidden rounded-full"
            style={{ background: "var(--panel-2)" }}
          >
            {barSegs.map((s) => (
              <div
                key={s.symbol}
                style={{ width: `${s.share * 100}%`, background: s.color }}
              />
            ))}
          </div>
          <div className="flex items-center gap-3 text-[12px] flex-wrap">
            {legend.map((s) => (
              <span key={s.symbol} className="inline-flex items-center gap-1.5">
                <span
                  className="w-2.5 h-2.5 rounded-sm"
                  style={{ background: s.color }}
                />
                <strong className="font-semibold">{s.symbol}</strong>
                <span className="tabular-nums" style={{ color: "var(--mute)" }}>
                  {(s.share * 100).toFixed(0)}%
                </span>
              </span>
            ))}
            {moreCount > 0 && (
              <span style={{ color: "var(--mute)" }}>+{moreCount} more</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
