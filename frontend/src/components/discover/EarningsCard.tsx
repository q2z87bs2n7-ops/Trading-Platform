import { useState } from "react";

import { compact, money } from "../../lib/format";
import type { EarningsRow } from "../../types";
import { CardPager } from "./CardPager";

const PAGE_SIZE = 10;

// "2026-05-30" -> "May 30" (string split avoids UTC-vs-local date drift).
// With showYear, appends a 2-digit year ("May 30 '26") — used by the Workspace
// per-symbol view where rows span multiple quarters/years.
function fmtDay(d: string, showYear = false): string {
  const [y, m, day] = d.split("-").map(Number);
  if (!y || !m || !day) return d;
  const base = new Date(y, m - 1, day).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
  return showYear ? `${base} '${String(y).slice(-2)}` : base;
}

function EarningsRowItem({
  r,
  rank,
  dense,
  showYear,
  onSelect,
}: {
  r: EarningsRow;
  rank: number;
  dense: boolean;
  showYear: boolean;
  onSelect?: (s: string) => void;
}) {
  const reported = r.eps_actual != null;
  const beat =
    reported && r.eps_estimate != null ? r.eps_actual! >= r.eps_estimate! : null;
  const epsColor =
    beat == null ? "var(--text)" : beat ? "var(--pos)" : "var(--neg)";
  const revenue = r.revenue_actual ?? r.revenue_estimate;

  const inner = (
    <>
      <span className="font-mono text-[12px]" style={{ color: "var(--mute)" }}>
        {fmtDay(r.date, showYear)}
      </span>
      <div className="font-semibold text-[14px] min-w-0 truncate">{r.symbol}</div>
      <span
        className="font-mono text-[13px] tabular-nums text-right"
        style={{ color: epsColor }}
        title={reported ? "Reported EPS" : "Estimated EPS"}
      >
        {r.eps_actual != null
          ? money(r.eps_actual)
          : r.eps_estimate != null
            ? `est ${money(r.eps_estimate)}`
            : "—"}
      </span>
      {!dense && (
        <span
          className="font-mono text-[12px] tabular-nums text-right"
          style={{ color: "var(--mute)" }}
        >
          {revenue != null ? compact(revenue) : "—"}
        </span>
      )}
    </>
  );

  const cls =
    "w-full text-left grid items-center gap-2.5 py-2 border-0 bg-transparent";
  const dateCol = showYear ? "72px" : "48px";
  const style = {
    gridTemplateColumns: dense
      ? `${dateCol} 1fr auto`
      : `${dateCol} 1fr auto 72px`,
    borderTop: rank === 0 ? "none" : "1px solid var(--border)",
  } as const;

  return onSelect ? (
    <button
      type="button"
      onClick={() => onSelect(r.symbol)}
      className={`${cls} cursor-pointer`}
      style={style}
    >
      {inner}
    </button>
  ) : (
    <div className={cls} style={style}>
      {inner}
    </div>
  );
}

export function EarningsCard({
  rows,
  onSelect,
  bare = false,
  dense = false,
  showYear = false,
}: {
  rows: EarningsRow[];
  onSelect?: (s: string) => void;
  bare?: boolean;
  dense?: boolean;
  showYear?: boolean;
}) {
  const [page, setPage] = useState(0);
  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const start = safePage * PAGE_SIZE;
  const visible = rows.slice(start, start + PAGE_SIZE);

  const body =
    rows.length === 0 ? (
      <p className="text-[13px]" style={{ color: "var(--mute)" }}>
        No upcoming earnings.
      </p>
    ) : (
      <>
        <div>
          {visible.map((r, i) => (
            <EarningsRowItem
              key={`${r.symbol}-${r.date}`}
              r={r}
              rank={i}
              dense={dense}
              showYear={showYear}
              onSelect={onSelect}
            />
          ))}
        </div>
        {rows.length > PAGE_SIZE && (
          <CardPager
            label={`${start + 1}–${start + visible.length} of ${rows.length}`}
            canPrev={safePage > 0}
            canNext={safePage < pageCount - 1}
            onPrev={() => setPage(safePage - 1)}
            onNext={() => setPage(safePage + 1)}
          />
        )}
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

export function EarningsCardSkeleton({ bare = false }: { bare?: boolean } = {}) {
  const body = (
    <div className="animate-pulse">
      {Array.from({ length: 5 }).map((_, i) => (
        <div
          key={i}
          className="h-7 w-full rounded mt-1.5"
          style={{ background: "var(--panel-2)" }}
        />
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
      }}
    >
      {body}
    </div>
  );
}
