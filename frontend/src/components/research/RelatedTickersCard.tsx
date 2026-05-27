import { useState } from "react";

import { compact, pct } from "../../lib/format";
import type { RelatedTickerRow, RelatedTickersRow } from "../../types";
import { CardPager } from "../discover/CardPager";

const PAGE_SIZE = 8;

type Cohort = "all" | "youngest" | "mid_range" | "eldest";

const COHORT_LABEL: Record<Cohort, string> = {
  all: "All",
  youngest: "Young",
  mid_range: "Mid",
  eldest: "Eldest",
};

function sentimentColor(s: string | null): string {
  if (!s) return "var(--mute)";
  const lc = s.toLowerCase();
  if (lc.startsWith("positive") || lc.includes("bullish")) return "var(--pos)";
  if (lc.startsWith("negative") || lc.includes("bearish")) return "var(--neg)";
  return "var(--mute)";
}

function signedColor(n: number | null): string {
  if (n == null || n === 0) return "var(--mute)";
  return n > 0 ? "var(--pos)" : "var(--neg)";
}

function RowItem({
  r,
  rank,
  dense,
  narrow,
  onSelect,
}: {
  r: RelatedTickerRow;
  rank: number;
  dense: boolean;
  narrow: boolean;
  onSelect?: (s: string) => void;
}) {
  const [hover, setHover] = useState(false);
  const inner = (
    <>
      <div className="font-semibold text-[13px] min-w-0 truncate">
        {r.ticker}
      </div>
      {!dense && (
        <span
          className="text-[12px] min-w-0 truncate"
          style={{ color: "var(--mute)" }}
          title={r.company_name || ""}
        >
          {r.company_name || ""}
        </span>
      )}
      <span
        className="text-[11px] tabular-nums text-right"
        style={{ color: sentimentColor(r.sentiment) }}
        title="Investor sentiment"
      >
        {r.sentiment || "—"}
      </span>
      {!narrow && (
        <span
          className="font-mono text-[11px] tabular-nums text-right"
          style={{ color: signedColor(r.last_thirty_day_change) }}
          title="30-day portfolio-holding change"
        >
          {r.last_thirty_day_change != null
            ? pct(r.last_thirty_day_change)
            : "—"}
        </span>
      )}
      {!dense && (
        <span
          className="font-mono text-[11px] tabular-nums text-right"
          style={{ color: "var(--mute)" }}
          title="Market cap"
        >
          {r.market_cap != null ? compact(r.market_cap) : "—"}
        </span>
      )}
    </>
  );

  const cls =
    "w-full text-left grid items-center gap-2 py-1.5 border-0 bg-transparent";
  const cols = narrow
    ? "48px auto"
    : dense
      ? "48px auto 56px"
      : "48px 1fr auto 56px 60px";
  const style = {
    gridTemplateColumns: cols,
    borderTop: rank === 0 ? "none" : "1px solid var(--hairline)",
  } as const;

  return onSelect ? (
    <button
      type="button"
      onClick={() => onSelect(r.ticker)}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className={`${cls} cursor-pointer`}
      style={{
        ...style,
        transition: "background .12s",
        padding: hover ? "7px 6px" : undefined,
        margin: hover ? "0 -6px" : undefined,
        borderRadius: hover ? 6 : undefined,
        background: hover ? "var(--panel-2)" : undefined,
      }}
    >
      {inner}
    </button>
  ) : (
    <div
      className={cls}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        ...style,
        transition: "background .12s",
        padding: hover ? "7px 6px" : undefined,
        margin: hover ? "0 -6px" : undefined,
        borderRadius: hover ? 6 : undefined,
        background: hover ? "var(--panel-2)" : undefined,
      }}
    >
      {inner}
    </div>
  );
}

export function RelatedTickersCard({
  row,
  bare = false,
  dense = false,
  narrow = false,
  onSelect,
}: {
  row: RelatedTickersRow | null;
  bare?: boolean;
  dense?: boolean;
  narrow?: boolean;
  onSelect?: (s: string) => void;
}) {
  const [cohort, setCohort] = useState<Cohort>("all");
  const [page, setPage] = useState(0);

  const rows: RelatedTickerRow[] = row
    ? cohort === "all"
      ? row.all
      : cohort === "youngest"
        ? row.youngest
        : cohort === "mid_range"
          ? row.mid_range
          : row.eldest
    : [];
  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const start = safePage * PAGE_SIZE;
  const visible = rows.slice(start, start + PAGE_SIZE);

  // Hide cohorts with zero rows from the selector — InvestorSentiment can
  // return empty per-cohort lists for thinly-covered names.
  const availableCohorts: Cohort[] = row
    ? (["all", "youngest", "mid_range", "eldest"] as Cohort[]).filter(
        (c) =>
          (c === "all"
            ? row.all
            : c === "youngest"
              ? row.youngest
              : c === "mid_range"
                ? row.mid_range
                : row.eldest
          ).length > 0,
      )
    : ["all"];

  const body =
    row == null ? (
      <p className="text-[13px]" style={{ color: "var(--mute)" }}>
        No related tickers available for this symbol.
      </p>
    ) : (
      <div className="flex flex-col gap-2">
        {/* Cohort selector — rail-style segmented control, only shown if more than 1 */}
        {availableCohorts.length > 1 && (
          <div
            className="inline-flex"
            style={{
              gap: 2,
              padding: 2,
              background: "var(--panel-2)",
              borderRadius: 8,
              alignSelf: "flex-start",
            }}
          >
            {availableCohorts.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => { setCohort(c); setPage(0); }}
                className="cursor-pointer border-0"
                style={{
                  fontSize: 11,
                  padding: "4px 10px",
                  borderRadius: 6,
                  background: cohort === c ? "var(--panel)" : "transparent",
                  color: cohort === c ? "var(--text)" : "var(--text-2)",
                  boxShadow: cohort === c ? "0 0 0 1px var(--border)" : "none",
                  fontWeight: cohort === c ? 600 : 500,
                }}
              >
                {COHORT_LABEL[c]}
              </button>
            ))}
          </div>
        )}

        {rows.length === 0 ? (
          <p className="text-[12px]" style={{ color: "var(--mute)" }}>
            No related tickers in this cohort.
          </p>
        ) : (
          <>
            <div>
              {visible.map((r, i) => (
                <RowItem
                  key={r.ticker}
                  r={r}
                  rank={i}
                  dense={dense}
                  narrow={narrow}
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
        )}
      </div>
    );

  if (bare) return body;

  return (
    <div
      style={{
        padding: "16px 18px",
        background: "var(--panel)",
        border: "1px solid var(--border)",
        borderRadius: "var(--r-lg)",
        boxShadow: "0 0 0 1px var(--hairline), 0 1px 1px rgba(0,0,0,0.25)",
      }}
    >
      {body}
    </div>
  );
}

export function RelatedTickersCardSkeleton({
  bare = false,
}: { bare?: boolean } = {}) {
  const body = (
    <div className="animate-pulse">
      {Array.from({ length: 5 }).map((_, i) => (
        <div
          key={i}
          className="h-6 w-full rounded mt-1.5"
          style={{ background: "var(--panel-2)" }}
        />
      ))}
    </div>
  );
  if (bare) return body;
  return (
    <div
      style={{
        padding: "16px 18px",
        background: "var(--panel)",
        border: "1px solid var(--border)",
        borderRadius: "var(--r-lg)",
        boxShadow: "0 0 0 1px var(--hairline), 0 1px 1px rgba(0,0,0,0.25)",
      }}
    >
      {body}
    </div>
  );
}
