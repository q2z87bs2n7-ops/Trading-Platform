import { useState } from "react";

import { pct } from "../../lib/format";
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

// Action chip color — upgraded is the most newsworthy, downgraded next, etc.
function actionColor(a: string | null): string {
  if (!a) return "var(--mute)";
  const lc = a.toLowerCase();
  if (lc.startsWith("upgrad")) return "var(--pos)";
  if (lc.startsWith("downgrad")) return "var(--neg)";
  if (lc.startsWith("initiat")) return "var(--accent, var(--text))";
  return "var(--mute)";
}

function ActionBadge({ action }: { action: string | null }) {
  if (!action) return null;
  const color = actionColor(action);
  return (
    <span
      className="text-[10px] uppercase font-medium tracking-wide px-1 py-0.5 rounded"
      style={{
        color,
        background: "color-mix(in oklab, currentColor 12%, transparent)",
      }}
      title={action}
    >
      {action.length > 10 ? action.slice(0, 8) + "…" : action}
    </span>
  );
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
  const ptLabel =
    r.price_target != null
      ? `${r.price_target_currency_code && r.price_target_currency_code !== "USD" ? r.price_target_currency_code + " " : ""}$${r.price_target.toFixed(0)}`
      : null;
  const stockHit =
    r.stock_success_rate != null ? pct(r.stock_success_rate) : null;

  // Row click opens the analyst's article URL in a new tab (when available).
  const onClick = r.url
    ? () => window.open(r.url!, "_blank", "noopener,noreferrer")
    : undefined;

  return (
    <div
      className="py-2 cursor-default"
      style={{
        borderTop: rank === 0 ? "none" : "1px solid var(--border)",
        cursor: onClick ? "pointer" : "default",
      }}
      onClick={onClick}
    >
      {/* Line 1: name (+ firm) on the left, action badge + recommendation on the right */}
      <div className="flex items-center gap-2">
        <div className="flex flex-col min-w-0 flex-1">
          <span
            className="text-[13px] font-semibold truncate"
            title={r.analyst_name || ""}
          >
            {r.analyst_name || "—"}
          </span>
          {!dense && r.firm_name && (
            <span
              className="text-[11px] truncate"
              style={{ color: "var(--mute)" }}
            >
              {r.firm_name}
            </span>
          )}
        </div>
        <ActionBadge action={r.analyst_action} />
        <span
          className="text-[12px] tabular-nums font-semibold"
          style={{ color: recColor(r.recommendation) }}
          title="Recommendation"
        >
          {r.recommendation || "—"}
        </span>
      </div>

      {/* Line 2: PT · this-stock hit rate · date */}
      <div className="flex items-center gap-2 mt-0.5">
        {ptLabel && (
          <span
            className="text-[11px] font-mono tabular-nums"
            style={{ color: "var(--text)" }}
            title="Analyst price target"
          >
            PT {ptLabel}
          </span>
        )}
        {!dense && stockHit && (
          <span
            className="text-[11px] tabular-nums"
            style={{
              color:
                r.stock_success_rate != null && r.stock_success_rate >= 0.55
                  ? "var(--pos)"
                  : r.stock_success_rate != null && r.stock_success_rate <= 0.45
                    ? "var(--neg)"
                    : "var(--mute)",
            }}
            title={
              r.stock_total_recommendations != null
                ? `${r.stock_good_recommendations ?? 0} of ${r.stock_total_recommendations} calls on this stock`
                : "Track record on this stock"
            }
          >
            {stockHit} hit
            {r.stock_avg_return != null && (
              <span style={{ color: "var(--mute)" }}>
                {" "}
                · {r.stock_avg_return > 0 ? "+" : ""}
                {r.stock_avg_return.toFixed(1)}% avg
              </span>
            )}
          </span>
        )}
        <span
          className="text-[11px] font-mono tabular-nums ml-auto"
          style={{ color: "var(--mute)" }}
        >
          {fmtDate(r.recommendation_date, !dense)}
        </span>
      </div>
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
