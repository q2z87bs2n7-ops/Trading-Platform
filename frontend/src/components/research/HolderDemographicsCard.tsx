import { pct } from "../../lib/format";
import type {
  HolderCohort,
  HolderDemographicsRow,
} from "../../types";

// 3-cohort behavioural profile (eldest / midRange / youngest). At full
// width: 3 columns side-by-side. Dense / narrow: cohorts stack vertically.

const COHORT_LABELS: { key: keyof HolderDemographicsRow; label: string }[] = [
  { key: "youngest", label: "Young" },
  { key: "mid_range", label: "Mid" },
  { key: "eldest", label: "Eldest" },
];

const ROWS: {
  key: keyof HolderCohort;
  label: string;
  fmt: (n: number | null) => string;
  signed?: boolean;
  hint?: string;
}[] = [
  {
    key: "percent_holders",
    label: "Holders",
    fmt: (n) => (n != null ? pct(n) : "—"),
    hint: "Share of all Tipranks portfolios in this cohort that hold the stock",
  },
  {
    key: "last_7_days_change",
    label: "7d Δ",
    fmt: (n) => (n != null ? pct(n) : "—"),
    signed: true,
  },
  {
    key: "last_30_days_change",
    label: "30d Δ",
    fmt: (n) => (n != null ? pct(n) : "—"),
    signed: true,
  },
  {
    key: "average_beta",
    label: "Avg β",
    fmt: (n) => (n != null ? n.toFixed(2) : "—"),
    hint: "Average portfolio beta in this cohort",
  },
  {
    key: "average_monthly_return",
    label: "Mo. return",
    fmt: (n) => (n != null ? pct(n / 100) : "—"),
    signed: true,
    hint: "Average monthly return of portfolios in this cohort",
  },
  {
    key: "dividend_yield",
    label: "Div. yield",
    fmt: (n) => (n != null ? pct(n) : "—"),
  },
  {
    key: "average_pe_ratio",
    label: "Avg P/E",
    fmt: (n) => (n != null ? n.toFixed(1) : "—"),
  },
];

function signedColor(n: number | null): string {
  if (n == null || n === 0) return "var(--mute)";
  return n > 0 ? "var(--pos)" : "var(--neg)";
}

function signedArrow(n: number | null): string {
  if (n == null || n === 0) return "";
  return n > 0 ? "▴ " : "▾ ";
}

function CohortColumn({
  cohort,
  label,
}: {
  cohort: HolderCohort;
  label: string;
}) {
  const getBorderColor = (lbl: string) => {
    if (lbl === "Young") return "color-mix(in oklch, var(--accent) 80%, transparent)";
    if (lbl === "Eldest") return "color-mix(in oklch, var(--amber) 80%, transparent)";
    return "color-mix(in oklch, var(--mute) 100%, transparent)";
  };

  return (
    <div className="flex flex-col gap-1 min-w-0">
      <span
        className="uppercase"
        style={{
          fontSize: 10.5,
          color: "color-mix(in oklab, var(--mute) 70%, var(--text-2))",
          letterSpacing: "0.06em",
          fontWeight: 500,
        }}
      >
        {label}
      </span>
      <div
        style={{
          height: 2,
          borderRadius: 1,
          marginBottom: 4,
          background: getBorderColor(label),
        }}
        aria-hidden
      />
      <div className="flex flex-col gap-0.5">
        {ROWS.map((r) => {
          const v = cohort[r.key];
          const tone = r.signed ? signedColor(v) : "var(--text)";
          return (
            <div key={r.key} className="flex items-center justify-between text-[11.5px]">
              <span style={{ color: "var(--mute)" }} title={r.hint}>
                {r.label}
              </span>
              <span
                className="font-mono tabular-nums"
                style={{ color: tone }}
              >
                {r.signed && (
                  <span style={{ fontSize: 9, marginRight: 2, opacity: 0.75 }}>
                    {signedArrow(v)}
                  </span>
                )}
                {r.fmt(v)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function HolderDemographicsCard({
  row,
  bare = false,
  narrow = false,
}: {
  row: HolderDemographicsRow | null;
  bare?: boolean;
  /** When true, cohorts stack vertically instead of side-by-side. */
  narrow?: boolean;
}) {
  const body =
    row == null ? (
      <p className="text-[13px]" style={{ color: "var(--mute)" }}>
        No holder demographic data available for this symbol.
      </p>
    ) : (
      <div className="flex flex-col gap-3">
        <div
          className="grid gap-3"
          style={{
            gridTemplateColumns: narrow ? "1fr" : "repeat(3, minmax(0, 1fr))",
          }}
        >
          {COHORT_LABELS.map((c) => (
            <CohortColumn
              key={c.key as string}
              cohort={row[c.key] as HolderCohort}
              label={c.label}
            />
          ))}
        </div>

        {/* Footer: sector + best-investor benchmark */}
        <div
          className="flex flex-wrap gap-x-4 gap-y-1 pt-2"
          style={{ borderTop: "1px solid var(--hairline)" }}
        >
          <div className="flex flex-col">
            <span
              className="uppercase"
              style={{
                fontSize: 10.5,
                color: "color-mix(in oklab, var(--mute) 70%, var(--text-2))",
                letterSpacing: "0.06em",
                fontWeight: 500,
              }}
            >
              Sector
            </span>
            <span className="font-mono text-[12px] tabular-nums">
              {row.sector_average_score != null
                ? row.sector_average_score.toFixed(2)
                : "—"}
              {row.sector_average_sentiment ? (
                <span style={{ color: "var(--mute)" }}>
                  {" "}
                  · {row.sector_average_sentiment}
                </span>
              ) : null}
            </span>
          </div>
          <div className="flex flex-col">
            <span
              className="uppercase"
              style={{
                fontSize: 10.5,
                color: "color-mix(in oklab, var(--mute) 70%, var(--text-2))",
                letterSpacing: "0.06em",
                fontWeight: 500,
              }}
            >
              Best investors
            </span>
            <span className="font-mono text-[12px] tabular-nums">
              {row.best_investors_holding != null
                ? `${row.best_investors_holding.toLocaleString()} holding`
                : "—"}
              {row.best_investors_allocation != null ? (
                <span style={{ color: "var(--mute)" }}>
                  {" "}
                  · {pct(row.best_investors_allocation)} alloc
                </span>
              ) : null}
            </span>
          </div>
        </div>
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

export function HolderDemographicsCardSkeleton({
  bare = false,
}: { bare?: boolean } = {}) {
  const body = (
    <div className="animate-pulse flex flex-col gap-3">
      <div className="grid grid-cols-3 gap-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex flex-col gap-1">
            <div
              className="h-3 w-12 rounded"
              style={{ background: "var(--panel-2)" }}
            />
            {Array.from({ length: 7 }).map((__, j) => (
              <div
                key={j}
                className="h-4 w-full rounded"
                style={{ background: "var(--panel-2)" }}
              />
            ))}
          </div>
        ))}
      </div>
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
