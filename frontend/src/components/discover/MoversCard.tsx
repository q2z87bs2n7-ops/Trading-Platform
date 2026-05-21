import { money, pct } from "../../lib/format";
import type { Mover } from "../../types";

export function MoversCard({
  title,
  movers,
  onSelect,
}: {
  title: string;
  movers: Mover[];
  onSelect: (s: string) => void;
}) {
  return (
    <div
      className="p-[18px]"
      style={{
        background: "var(--panel)",
        border: "1px solid var(--border)",
        borderRadius: "var(--r-lg)",
        boxShadow: "var(--shadow-sm)",
      }}
    >
      <div className="flex items-center justify-between mb-2.5">
        <strong className="text-[14px]">{title}</strong>
        <span
          className="text-[12px]"
          style={{ color: "var(--mute)", letterSpacing: "0.02em" }}
        >
          % change
        </span>
      </div>
      <div>
        {movers.map((m, i) => {
          const up = m.percent_change >= 0;
          return (
            <button
              key={m.symbol}
              type="button"
              onClick={() => onSelect(m.symbol)}
              className="w-full text-left grid items-center gap-2.5 py-2 cursor-pointer bg-transparent border-0"
              style={{
                gridTemplateColumns: "32px 1fr auto auto",
                borderTop: i === 0 ? "none" : "1px solid var(--border)",
              }}
            >
              <span
                className="font-mono text-[12px]"
                style={{ color: "var(--mute)" }}
              >
                {String(i + 1).padStart(2, "0")}
              </span>
              <div className="min-w-0">
                <div className="font-semibold text-[14px]">{m.symbol}</div>
              </div>
              <span className="font-mono text-[13px] tabular-nums">
                {money(m.price)}
              </span>
              <span
                className="font-mono text-[13px] tabular-nums text-right min-w-[64px]"
                style={{ color: up ? "var(--pos)" : "var(--neg)" }}
              >
                {pct(m.percent_change)}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function MoversCardSkeleton() {
  return (
    <div
      className="p-[18px] animate-pulse"
      style={{
        background: "var(--panel)",
        border: "1px solid var(--border)",
        borderRadius: "var(--r-lg)",
      }}
    >
      <div className="h-4 w-28 rounded mb-3" style={{ background: "var(--panel-2)" }} />
      {Array.from({ length: 5 }).map((_, i) => (
        <div
          key={i}
          className="h-7 w-full rounded mt-1.5"
          style={{ background: "var(--panel-2)" }}
        />
      ))}
    </div>
  );
}
