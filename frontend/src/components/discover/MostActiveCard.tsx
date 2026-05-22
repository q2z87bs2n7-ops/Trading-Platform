import { useState } from "react";

import { compact } from "../../lib/format";
import type { MostActive } from "../../types";

type By = "volume" | "trades";

export function MostActiveCard({
  volumeData,
  tradesData,
  onSelect,
}: {
  volumeData: MostActive[];
  tradesData: MostActive[];
  onSelect: (s: string) => void;
}) {
  const [by, setBy] = useState<By>("volume");
  const items = by === "volume" ? volumeData : tradesData;

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
          {(["volume", "trades"] as By[]).map((b) => (
            <button
              key={b}
              type="button"
              onClick={() => setBy(b)}
              className="text-[12px] font-medium px-2.5 py-0.5 rounded-full border-0 cursor-pointer"
              style={{
                background: by === b ? "var(--accent)" : "var(--panel-2)",
                color: by === b ? "#fff" : "var(--mute)",
                transition: "background 0.15s, color 0.15s",
              }}
            >
              {b === "volume" ? "Volume" : "Trades"}
            </button>
          ))}
        </div>
        <span
          className="text-[12px]"
          style={{ color: "var(--mute)", letterSpacing: "0.02em" }}
        >
          {by === "volume" ? "shares" : "# trades"}
        </span>
      </div>
      <div>
        {items.map((item, i) => (
          <button
            key={item.symbol}
            type="button"
            onClick={() => onSelect(item.symbol)}
            className="w-full text-left grid items-center gap-2.5 py-2 cursor-pointer bg-transparent border-0"
            style={{
              gridTemplateColumns: "32px 1fr auto",
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
              <div className="font-semibold text-[14px]">{item.symbol}</div>
            </div>
            <span className="font-mono text-[13px] tabular-nums text-right">
              {compact(by === "volume" ? item.volume : item.trade_count)}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

export function MostActiveCardSkeleton() {
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
