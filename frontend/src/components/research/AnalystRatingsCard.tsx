import { useState } from "react";

import type { AnalystRatingRow } from "../../types";
import { CardPager } from "../discover/CardPager";

const PAGE_SIZE = 8;

// "MM/DD/YYYY" -> "Mon DD '26"; defensive against missing/odd inputs.
function fmtDate(d: string | null, showYear = true): string {
  if (!d) return "—";
  // Tipranks returns dates as "MM/DD/YYYY".
  const parts = d.split("/").map((s) => Number(s));
  if (parts.length === 3 && parts.every((n) => Number.isFinite(n))) {
    const [m, day, y] = parts;
    const base = new Date(y, m - 1, day).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
    return showYear ? `${base} '${String(y).slice(-2)}` : base;
  }
  return d;
}

function recColor(rec: string | null): string {
  if (!rec) return "var(--mute)";
  const r = rec.toLowerCase();
  if (r === "buy" || r === "strongbuy" || r === "strong buy") return "var(--pos)";
  if (r === "sell" || r === "strongsell" || r === "strong sell") return "var(--neg)";
  return "var(--mute)";
}

function RowItem({
  r,
  rank,
  dense,
}: {
  r: AnalystRatingRow;
  rank: number;
  dense: boolean;
}) {
  return (
    <div
      className="grid items-center gap-2.5 py-2"
      style={{
        gridTemplateColumns: dense
          ? "1fr auto 64px"
          : "1fr 140px auto 72px",
        borderTop: rank === 0 ? "none" : "1px solid var(--border)",
      }}
    >
      <span
        className="text-[13px] font-semibold min-w-0 truncate"
        title={r.analyst_name || ""}
      >
        {r.analyst_name || "—"}
      </span>
      {!dense && (
        <span
          className="text-[12px] min-w-0 truncate"
          style={{ color: "var(--mute)" }}
          title={r.firm_name || ""}
        >
          {r.firm_name || ""}
        </span>
      )}
      <span
        className="text-[12px] tabular-nums text-right"
        style={{ color: recColor(r.recommendation) }}
        title="Recommendation"
      >
        {r.recommendation || "—"}
      </span>
      <span
        className="text-[11px] font-mono tabular-nums text-right"
        style={{ color: "var(--mute)" }}
      >
        {fmtDate(r.recommendation_date, !dense)}
      </span>
    </div>
  );
}

export function AnalystRatingsCard({
  rows,
  bare = false,
  dense = false,
}: {
  rows: AnalystRatingRow[];
  bare?: boolean;
  dense?: boolean;
}) {
  const [page, setPage] = useState(0);
  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const start = safePage * PAGE_SIZE;
  const visible = rows.slice(start, start + PAGE_SIZE);

  const body =
    rows.length === 0 ? (
      <p className="text-[13px]" style={{ color: "var(--mute)" }}>
        No analyst ratings available.
      </p>
    ) : (
      <>
        <div>
          {visible.map((r, i) => (
            <RowItem
              key={`${r.expert_uid ?? r.analyst_name}-${i}`}
              r={r}
              rank={i}
              dense={dense}
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

export function AnalystRatingsCardSkeleton({ bare = false }: { bare?: boolean } = {}) {
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
