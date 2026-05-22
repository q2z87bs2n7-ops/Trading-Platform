import { useState } from "react";

import type { MostActive, Mover } from "../../types";
import { MoverRow } from "./MoversCard";
import { MostActiveRow } from "./MostActiveCard";

type Tab = "gainers" | "losers" | "active";

// Mobile-only: Movers + Most Active folded into one card with three tabs.
// Desktop keeps the two-card grid. Rows are the shared MoverRow /
// MostActiveRow so the markup isn't duplicated.
export function MoversCombinedCard({
  gainers,
  losers,
  active,
  onSelect,
}: {
  gainers: Mover[];
  losers: Mover[];
  active: MostActive[];
  onSelect: (s: string) => void;
}) {
  const [tab, setTab] = useState<Tab>("gainers");

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
      <div className="flex gap-1 mb-2.5">
        {(["gainers", "losers", "active"] as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className="text-[12.5px] font-medium px-3 py-1.5 rounded-full border-0 cursor-pointer capitalize"
            style={{
              background: tab === t ? "var(--accent)" : "var(--panel-2)",
              color: tab === t ? "#fff" : "var(--mute)",
              transition: "background 0.15s, color 0.15s",
            }}
          >
            {t}
          </button>
        ))}
      </div>
      <div>
        {tab === "gainers" &&
          gainers.map((m, i) => (
            <MoverRow key={m.symbol} m={m} rank={i} onSelect={onSelect} />
          ))}
        {tab === "losers" &&
          losers.map((m, i) => (
            <MoverRow key={m.symbol} m={m} rank={i} onSelect={onSelect} />
          ))}
        {tab === "active" &&
          active.map((item, i) => (
            <MostActiveRow
              key={item.symbol}
              item={item}
              rank={i}
              by="volume"
              onSelect={onSelect}
            />
          ))}
      </div>
    </div>
  );
}
