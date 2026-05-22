import { useMemo, useState } from "react";

import type { Position } from "../../types";
import { DONUT_COLORS, buildArc } from "./util";

export function AllocationCard({
  positions,
  colors = DONUT_COLORS,
}: {
  positions: Position[] | undefined;
  colors?: string[];
}) {
  const [hovered, setHovered] = useState<string | null>(null);

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
        d: buildArc(65, 65, 55, 36, a0, a1),
      };
    });
  }, [open, total, colors]);

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
          Allocation
        </span>
        <span className="text-[12px]" style={{ color: "var(--mute)" }}>
          {open.length} symbol{open.length === 1 ? "" : "s"}
        </span>
      </div>

      {open.length === 0 ? (
        <div className="flex items-center justify-center py-10">
          <p className="text-[13px]" style={{ color: "var(--mute)" }}>
            No open positions
          </p>
        </div>
      ) : (
        <div className="flex items-center gap-[18px]">
          <div className="relative shrink-0">
            <svg width={130} height={130} viewBox="0 0 130 130" className="block">
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
            style={{ maxHeight: 130, overflow: "auto" }}
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
                    className="w-2.5 h-2.5 rounded-sm shrink-0"
                    style={{ background: s.color }}
                  />
                  <strong className="font-semibold truncate">{s.symbol}</strong>
                </span>
                <span
                  className="tabular-nums"
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
  );
}
