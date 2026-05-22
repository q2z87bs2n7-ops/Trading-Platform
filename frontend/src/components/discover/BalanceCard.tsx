import type { useAccount } from "../../data/hooks";
import { money, pct } from "../../lib/format";

export function BalanceCard({
  account,
  title,
  value,
  dayPl,
  dayPlPct,
  unrealized,
  unrealizedPct,
  buyingPower,
}: {
  account: ReturnType<typeof useAccount>["data"];
  title: string;
  value: number;
  dayPl: number;
  dayPlPct: number;
  unrealized: number;
  unrealizedPct: number;
  buyingPower: number;
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
        <div className="h-3 w-24 rounded" style={{ background: "var(--panel-2)" }} />
        <div className="h-12 w-56 rounded" style={{ background: "var(--panel-2)" }} />
        <div className="h-4 w-72 rounded" style={{ background: "var(--panel-2)" }} />
      </div>
    );
  }

  const dayUp = dayPl >= 0;
  const allUp = unrealized >= 0;

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
        <span style={{ color: "var(--mute)" }} className="text-[12.5px] tabular-nums">
          All time {allUp ? "+" : ""}
          {money(unrealized)} ({pct(unrealizedPct)})
        </span>
      </div>
      <div className="flex gap-6 mt-1 flex-wrap">
        <div className="flex flex-col">
          <small className="text-[12px]" style={{ color: "var(--mute)" }}>
            Buying power
          </small>
          <strong className="font-medium text-[16px] tabular-nums">
            {money(buyingPower)}
          </strong>
        </div>
      </div>
    </div>
  );
}
