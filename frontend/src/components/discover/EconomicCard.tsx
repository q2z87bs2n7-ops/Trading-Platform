import { compact } from "../../lib/format";
import type { EconomicRow } from "../../types";

// FMP economic times are UTC ("YYYY-MM-DD HH:MM:SS"); render in local time.
function fmtWhen(d: string): { day: string; time: string } {
  const dt = new Date(d.replace(" ", "T") + "Z");
  if (Number.isNaN(dt.getTime())) return { day: d, time: "" };
  return {
    day: dt.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    time: dt.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }),
  };
}

function fmtVal(n: number | null, unit: string | null): string {
  if (n == null) return "—";
  const s = Math.abs(n) >= 10_000 ? compact(n) : `${n}`;
  if (!unit) return s;
  return unit === "%" ? `${s}%` : `${s} ${unit}`;
}

function ImpactChip({ impact }: { impact: string | null }) {
  const high = impact === "High";
  return (
    <span
      className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded-full whitespace-nowrap"
      style={{
        background: high ? "var(--accent)" : "var(--panel-2)",
        color: high ? "#fff" : "var(--mute)",
        letterSpacing: "0.04em",
      }}
    >
      {impact ?? "—"}
    </span>
  );
}

function EconomicRowItem({ r, rank }: { r: EconomicRow; rank: number }) {
  const { day, time } = fmtWhen(r.date);
  return (
    <div
      className="grid items-start gap-3 py-2.5"
      style={{
        gridTemplateColumns: "64px 1fr auto",
        borderTop: rank === 0 ? "none" : "1px solid var(--border)",
      }}
    >
      <div className="font-mono text-[11px] leading-tight" style={{ color: "var(--mute)" }}>
        <div>{day}</div>
        <div>{time}</div>
      </div>
      <div className="min-w-0">
        <div className="text-[14px] leading-snug">{r.event ?? "—"}</div>
        <div className="text-[11px] mt-0.5 font-mono" style={{ color: "var(--mute)" }}>
          {`Prev ${fmtVal(r.previous, r.unit)} · Est ${fmtVal(r.estimate, r.unit)}`}
          {r.actual != null && (
            <span style={{ color: "var(--text)" }}>{` · Act ${fmtVal(r.actual, r.unit)}`}</span>
          )}
        </div>
      </div>
      <ImpactChip impact={r.impact} />
    </div>
  );
}

export function EconomicCard({
  rows,
  bare = false,
}: {
  rows: EconomicRow[];
  bare?: boolean;
}) {
  const body =
    rows.length === 0 ? (
      <p className="text-[13px]" style={{ color: "var(--mute)" }}>
        No major releases this week.
      </p>
    ) : (
      <div>
        {rows.map((r, i) => (
          <EconomicRowItem key={`${r.date}-${r.event}-${i}`} r={r} rank={i} />
        ))}
      </div>
    );

  if (bare) return body;

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
      {body}
    </div>
  );
}

export function EconomicCardSkeleton() {
  return (
    <div
      className="p-[18px] animate-pulse"
      style={{
        background: "var(--panel)",
        border: "1px solid var(--border)",
        borderRadius: "var(--r-lg)",
      }}
    >
      {Array.from({ length: 5 }).map((_, i) => (
        <div
          key={i}
          className="h-8 w-full rounded mt-1.5"
          style={{ background: "var(--panel-2)" }}
        />
      ))}
    </div>
  );
}
