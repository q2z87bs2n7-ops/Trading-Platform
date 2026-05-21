import { pct } from "../../lib/format";
import type { IndexData } from "../../types";
import { fmtPrice } from "./util";

const REGION_ORDER: IndexData["region"][] = ["US", "Europe", "Asia"];

function IndexChip({ idx }: { idx: IndexData }) {
  const up = idx.change >= 0;
  const color = up ? "var(--pos)" : "var(--neg)";
  const arrow = up ? "▲" : "▼";
  const hasExt =
    idx.session &&
    idx.session !== "regular" &&
    idx.ext_price != null &&
    idx.ext_change_pct != null;
  const extUp = hasExt && idx.ext_change_pct! >= 0;
  return (
    <span
      className="flex items-center gap-2 px-4 whitespace-nowrap"
      style={{ borderRight: "1px solid var(--hairline)" }}
    >
      <span className="text-[11px] font-medium" style={{ color: "var(--mute)" }}>
        {idx.name}
      </span>
      <span className="text-[13px] font-semibold tabular-nums">
        {fmtPrice(idx.price)}
      </span>
      <span className="text-[12px] tabular-nums font-medium" style={{ color }}>
        {arrow} {pct(idx.change_pct)}
      </span>
      {hasExt && (
        <span
          className="flex items-center gap-1 pl-1"
          style={{ borderLeft: "1px solid var(--hairline)" }}
        >
          <span
            className="text-[10px] uppercase tracking-wide"
            style={{ color: "var(--mute)" }}
          >
            {idx.session}
          </span>
          <span
            className="text-[11px] tabular-nums font-medium"
            style={{ color: extUp ? "var(--pos)" : "var(--neg)" }}
          >
            {fmtPrice(idx.ext_price!)} ({pct(idx.ext_change_pct!)})
          </span>
        </span>
      )}
    </span>
  );
}

export function IndicesTicker({ indices }: { indices: IndexData[] }) {
  const sorted = REGION_ORDER.flatMap((r) =>
    indices.filter((i) => i.region === r),
  );
  if (sorted.length === 0) return null;
  return (
    <div
      className="overflow-hidden mb-4"
      style={{
        background: "var(--panel)",
        border: "1px solid var(--border)",
        borderRadius: "var(--r-lg)",
        boxShadow: "var(--shadow-sm)",
      }}
    >
      <div className="flex items-center">
        <span
          className="text-[11px] uppercase font-semibold px-3 py-2 whitespace-nowrap"
          style={{
            color: "var(--mute)",
            letterSpacing: "0.06em",
            borderRight: "1px solid var(--border)",
          }}
        >
          Markets
        </span>
        <div className="ticker-wrap overflow-hidden flex-1" style={{ height: 36 }}>
          <div className="ticker-track h-full items-center">
            {[...sorted, ...sorted].map((idx, i) => (
              <IndexChip key={i} idx={idx} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
