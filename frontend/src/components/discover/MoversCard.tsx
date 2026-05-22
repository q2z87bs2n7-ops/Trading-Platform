import { useState } from "react";

import { money, pct } from "../../lib/format";
import type { Mover } from "../../types";

type Tab = "gainers" | "losers";

export function MoversCard({
  gainers,
  losers,
  onSelect,
}: {
  gainers: Mover[];
  losers: Mover[];
  onSelect: (s: string) => void;
}) {
  const [tab, setTab] = useState<Tab>("gainers");
  const movers = tab === "gainers" ? gainers : losers;

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
        <div className="flex gap-1">
          {(["gainers", "losers"] as Tab[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className="text-[12px] font-medium px-2.5 py-0.5 rounded-full border-0 cursor-pointer"
              style={{
                background: tab === t ? "var(--accent)" : "var(--panel-2)",
                color: tab === t ? "#fff" : "var(--mute)",
                transition: "background 0.15s, color 0.15s",
              }}
            >
              {t === "gainers" ? "Gainers" : "Losers"}
            </button>
          ))}
        </div>
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
