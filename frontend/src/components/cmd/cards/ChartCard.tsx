import { useBars, useSnapshots } from "../../../data/hooks";
import { money, pct } from "../../../lib/format";
import CmdResultCard from "../CmdResultCard";

const compact = (n: number) =>
  n.toLocaleString("en-US", { notation: "compact", maximumFractionDigits: 1 });

export function ChartCard({
  symbol,
  onOpenInWorkspace,
}: {
  symbol: string;
  onOpenInWorkspace: () => void;
}) {
  const snaps = useSnapshots([symbol]);
  const bars = useBars(symbol, "1Day", 60);
  const snap = snaps.data?.snapshots?.[0];

  const dayChange =
    snap?.prev_close && snap.last_price
      ? (snap.last_price - snap.prev_close) / snap.prev_close
      : 0;
  const up = dayChange >= 0;
  const stroke = up ? "var(--pos)" : "var(--neg)";

  // Mini sparkline from real bars (last 60 daily closes).
  const closes = (bars.data?.bars || []).map((b) => b.close);
  let path = "";
  if (closes.length > 1) {
    const min = Math.min(...closes);
    const max = Math.max(...closes);
    const range = max - min || 1;
    const W = 320;
    const H = 60;
    const stepX = W / (closes.length - 1);
    path = closes
      .map((c, i) => {
        const x = i * stepX;
        const y = H - ((c - min) / range) * (H - 6) - 3;
        return `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
      })
      .join(" ");
  }

  return (
    <CmdResultCard
      title={symbol}
      meta={snap?.last_price ? money(snap.last_price) : undefined}
    >
      <div className="grid gap-3 grid-cols-1 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <span className="text-[11px] uppercase" style={{ color: "var(--mute)" }}>
            Today
          </span>
          <span
            className="font-mono text-[18px] tabular-nums"
            style={{ color: stroke }}
          >
            {pct(dayChange)}
          </span>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-[11px] uppercase" style={{ color: "var(--mute)" }}>
            Day H / L · Vol
          </span>
          <span className="font-mono text-[13px] tabular-nums">
            {snap?.day_high ? money(snap.day_high) : "—"} /{" "}
            {snap?.day_low ? money(snap.day_low) : "—"}{" "}
            <span style={{ color: "var(--mute)" }}>
              · {snap?.day_volume ? compact(snap.day_volume) : "—"}
            </span>
          </span>
        </div>
      </div>
      {path && (
        <svg
          viewBox="0 0 320 60"
          width="100%"
          height={60}
          preserveAspectRatio="none"
          className="block mt-3"
        >
          <path d={path} fill="none" stroke={stroke} strokeWidth={1.5} />
        </svg>
      )}
      <button
        type="button"
        onClick={onOpenInWorkspace}
        className="w-full mt-3 text-[13px] font-medium cursor-pointer"
        style={{
          padding: "9px",
          background: "var(--accent-bg)",
          color: "var(--accent)",
          border: "1px solid var(--accent)",
          borderRadius: "var(--r)",
        }}
      >
        Open {symbol} in Chart workspace →
      </button>
    </CmdResultCard>
  );
}
