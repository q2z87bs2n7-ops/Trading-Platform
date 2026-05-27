import { useMemo, useState } from "react";

import { lookupFredUrl } from "../../lib/economic-fred-map";
import { compact } from "../../lib/format";
import type { EconomicRow } from "../../types";
import { CardPager } from "./CardPager";

// FMP economic times are UTC ("YYYY-MM-DD HH:MM:SS"); render in local time.
function fmtWhen(d: string): { day: string; time: string } {
  const dt = new Date(d.replace(" ", "T") + "Z");
  if (Number.isNaN(dt.getTime())) return { day: d, time: "" };
  return {
    day: dt.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    time: dt.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }),
  };
}

// Local calendar-date key (YYYY-MM-DD) for a UTC timestamp, so day-grouping
// lines up with the local times the rows actually render in.
function localKey(d: string): string {
  const dt = new Date(d.replace(" ", "T") + "Z");
  if (Number.isNaN(dt.getTime())) return d.slice(0, 10);
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const day = String(dt.getDate()).padStart(2, "0");
  return `${dt.getFullYear()}-${m}-${day}`;
}

function keyOf(dt: Date): string {
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const day = String(dt.getDate()).padStart(2, "0");
  return `${dt.getFullYear()}-${m}-${day}`;
}

function dayLabel(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  if (key === keyOf(today)) return "Today";
  if (key === keyOf(tomorrow)) return "Tomorrow";
  return dt.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
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

// Only the ~95 mapped recurring releases are clickable (deep-link to a FRED
// series page). Unmapped rows — Fed speeches, CFTC COT, ISM, OPEC, … —
// render as plain text rather than a generic Google search, which was rarely
// useful.
function eventLink(event: string | null): string | null {
  return lookupFredUrl(event);
}

function EconomicRowItem({ r, rank }: { r: EconomicRow; rank: number }) {
  const { day, time } = fmtWhen(r.date);
  const href = eventLink(r.event);
  const inner = (
    <>
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
    </>
  );
  const style = {
    gridTemplateColumns: "64px 1fr auto",
    borderTop: rank === 0 ? "none" : "1px solid var(--border)",
  };
  if (href) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className="grid items-start gap-3 py-2.5 hover:bg-panel-2"
        style={{ ...style, color: "var(--text)", textDecoration: "none" }}
      >
        {inner}
      </a>
    );
  }
  return (
    <div className="grid items-start gap-3 py-2.5" style={style}>
      {inner}
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
  // Group by local day (rows arrive sorted ascending, so insertion order is
  // chronological). Paginate one day per page, defaulting to today.
  const groups = useMemo(() => {
    const map = new Map<string, EconomicRow[]>();
    for (const r of rows) {
      const k = localKey(r.date);
      const bucket = map.get(k);
      if (bucket) bucket.push(r);
      else map.set(k, [r]);
    }
    return [...map.entries()].map(([key, items]) => ({ key, items }));
  }, [rows]);

  const [activeKey, setActiveKey] = useState<string | null>(null);
  const keys = groups.map((g) => g.key);
  const todayKey = keyOf(new Date());
  const defaultKey = keys.includes(todayKey) ? todayKey : keys[0];
  const currentKey =
    activeKey && keys.includes(activeKey) ? activeKey : defaultKey;
  const idx = keys.indexOf(currentKey);
  const group = idx >= 0 ? groups[idx] : null;

  const body =
    !group ? (
      <p className="text-[13px]" style={{ color: "var(--mute)" }}>
        No major releases this week.
      </p>
    ) : (
      <>
        <div>
          {group.items.map((r, i) => (
            <EconomicRowItem key={`${r.date}-${r.event}-${i}`} r={r} rank={i} />
          ))}
        </div>
        <CardPager
          label={`${dayLabel(currentKey)} · ${group.items.length} ${
            group.items.length === 1 ? "event" : "events"
          }`}
          canPrev={idx > 0}
          canNext={idx < groups.length - 1}
          onPrev={() => setActiveKey(keys[idx - 1])}
          onNext={() => setActiveKey(keys[idx + 1])}
        />
      </>
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
