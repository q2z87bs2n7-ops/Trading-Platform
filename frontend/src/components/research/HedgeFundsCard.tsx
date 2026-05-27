import { useState } from "react";

import { compact } from "../../lib/format";
import type { HedgeFundsRow, HedgeFundRow } from "../../types";
import { CardPager } from "../discover/CardPager";

const PAGE_SIZE = 6;

function signedColor(n: number | null): string {
  if (n == null || n === 0) return "var(--mute)";
  return n > 0 ? "var(--pos)" : "var(--neg)";
}

function signedCompact(n: number | null): string {
  if (n == null) return "—";
  const sign = n < 0 ? "−" : n > 0 ? "+" : "";
  return `${sign}${compact(Math.abs(n))}`;
}

// "Very Negative" / "Negative" / "Neutral" / "Positive" / "Very Positive"
function ratingColor(r: string | null): string {
  if (!r) return "var(--mute)";
  const lc = r.toLowerCase();
  if (lc.includes("very positive") || lc === "positive sentiment" || lc === "positive")
    return "var(--pos)";
  if (lc.includes("very negative") || lc === "negative sentiment" || lc === "negative")
    return "var(--neg)";
  return "var(--mute)";
}

// "YYYY-MM-DD" -> "Q3 2024" approximation. Defensive on input.
function fmtQuarter(d: string | null): string {
  if (!d) return "—";
  const m = d.match(/^(\d{4})-(\d{2})/);
  if (!m) return d;
  const year = m[1];
  const month = parseInt(m[2], 10);
  const q = Math.ceil(month / 3);
  return `Q${q} '${year.slice(-2)}`;
}

function FundRow({
  f,
  rank,
  dense,
}: {
  f: HedgeFundRow;
  rank: number;
  dense: boolean;
}) {
  const pct =
    f.percentage_of_portfolio != null
      ? Math.min(100, Math.max(0, f.percentage_of_portfolio))
      : 0;
  return (
    <div
      className="grid items-center gap-2 py-2"
      style={{
        gridTemplateColumns: dense
          ? "1fr auto auto 64px"
          : "1fr 130px auto auto 64px 64px",
        borderTop: rank === 0 ? "none" : "1px solid var(--hairline)",
      }}
    >
      <span
        className="text-[12.5px] font-semibold min-w-0 truncate"
        title={f.manager_name || ""}
      >
        {f.manager_name || "—"}
      </span>
      {!dense && (
        <span
          className="text-[11px] min-w-0 truncate"
          style={{ color: "var(--mute)" }}
          title={f.institution_name || ""}
        >
          {f.institution_name || ""}
        </span>
      )}
      {f.action && (
        <span
          className="uppercase"
          style={{
            fontSize: 10,
            fontWeight: 600,
            letterSpacing: "0.05em",
            padding: "2px 7px",
            borderRadius: 999,
            color: actionColor(f.action),
            background: "color-mix(in oklch, currentColor 14%, transparent)",
            border: "1px solid color-mix(in oklch, currentColor 35%, transparent)",
            whiteSpace: "nowrap",
          }}
          title={f.action}
        >
          {f.action === "New Position"
            ? "New"
            : f.action === "Closed Position"
              ? "Closed"
              : f.action}
        </span>
      )}
      <span
        className="font-mono text-[12px] tabular-nums text-right"
        style={{ color: signedColor(f.shares_traded) }}
        title="Net shares traded last quarter"
      >
        {signedCompact(f.shares_traded)}
      </span>
      <div
        className="flex flex-col items-end"
        title={`${f.percentage_of_portfolio?.toFixed(2) ?? "?"}% of fund's portfolio`}
      >
        <span
          className="font-mono text-[10.5px] tabular-nums"
          style={{ color: "var(--mute)" }}
        >
          {f.percentage_of_portfolio != null
            ? `${f.percentage_of_portfolio.toFixed(2)}%`
            : "—"}
        </span>
        <div
          className="rounded"
          style={{
            width: 48,
            height: 3,
            background: "var(--panel-2)",
            position: "relative",
          }}
        >
          <div
            style={{
              width: `${Math.min(pct * 10, 100)}%`,
              height: "100%",
              background:
                pct >= 5
                  ? "var(--pos)"
                  : pct >= 1
                    ? "var(--text)"
                    : "var(--mute)",
              borderRadius: 2,
            }}
          />
        </div>
      </div>
      {!dense && (
        <span
          className="font-mono text-[11px] tabular-nums text-right"
          style={{ color: "var(--mute)" }}
          title="Reported $ value of position"
        >
          {f.reported_value != null && f.reported_value > 0
            ? "$" + compact(f.reported_value)
            : "—"}
        </span>
      )}
    </div>
  );
}

function actionColor(a: string | null): string {
  if (!a) return "var(--mute)";
  if (a === "New Position" || a === "Added") return "var(--pos)";
  if (a === "Closed Position" || a === "Reduced") return "var(--neg)";
  return "var(--mute)";
}

export function HedgeFundsCard({
  row,
  bare = false,
  dense = false,
  narrow = false,
}: {
  row: HedgeFundsRow | null;
  bare?: boolean;
  dense?: boolean;
  narrow?: boolean;
}) {
  const [page, setPage] = useState(0);

  const fundRows = (row?.institutional_holdings ?? [])
    .filter((f) => f.shares_traded != null && f.shares_traded !== 0)
    .sort(
      (a, b) =>
        Math.abs(b.shares_traded ?? 0) - Math.abs(a.shares_traded ?? 0),
    );
  const pageCount = Math.max(1, Math.ceil(fundRows.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const start = safePage * PAGE_SIZE;
  const visible = fundRows.slice(start, start + PAGE_SIZE);

  const body =
    row == null ? (
      <p className="text-[13px]" style={{ color: "var(--mute)" }}>
        No hedge fund data available for this symbol.
      </p>
    ) : (
      <div className="flex flex-col gap-3">
        {/* Signal headline */}
        <div className="flex items-baseline gap-2">
          <span
            className="font-semibold"
            style={{
              color: ratingColor(row.signal.rating),
              fontSize: 19,
              letterSpacing: "-0.01em",
            }}
          >
            {row.signal.rating ?? "—"}
          </span>
          {row.signal.confidence && (
            <span
              className="text-[11px]"
              style={{ color: "var(--mute)" }}
              title="Confidence"
            >
              · {row.signal.confidence}
            </span>
          )}
        </div>

        {/* Top stats grid — 3-col by default, single column at narrow widths
            (cells get cramped below ~340px panel width). */}
        <div
          className={`grid gap-3 ${narrow ? "grid-cols-1" : "grid-cols-3"}`}
        >
          <div className="flex flex-col gap-0.5">
            <span
              className="uppercase"
              style={{
                fontSize: 10.5,
                color: "color-mix(in oklab, var(--mute) 70%, var(--text-2))",
                letterSpacing: "0.06em",
                fontWeight: 500,
              }}
            >
              Last Q net
            </span>
            <span
              className="font-mono text-[13px] tabular-nums"
              style={{ color: signedColor(row.last_q_shares_traded) }}
            >
              {signedCompact(row.last_q_shares_traded)}
            </span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span
              className="uppercase"
              style={{
                fontSize: 10.5,
                color: "color-mix(in oklab, var(--mute) 70%, var(--text-2))",
                letterSpacing: "0.06em",
                fontWeight: 500,
              }}
            >
              Funds covered
            </span>
            <span className="font-mono text-[13px] tabular-nums">
              {row.signal.based_on_num_hedge_funds ?? "—"}
            </span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span
              className="uppercase"
              style={{
                fontSize: 10.5,
                color: "color-mix(in oklab, var(--mute) 70%, var(--text-2))",
                letterSpacing: "0.06em",
                fontWeight: 500,
              }}
            >
              Total holders
            </span>
            <span className="font-mono text-[13px] tabular-nums">
              {row.total_hedge_funds ?? "—"}
            </span>
          </div>
        </div>

        {/* Quarterly holdings history — vertical bars chart. Last 4 quarters at
            full width, last 2 at narrow widths so bars stay readable. */}
        {row.holdings_history.length > 0 && (() => {
          const maxNet = Math.max(...row.holdings_history.map(h => Math.abs(h.net_shares_change ?? 0)));
          return (
            <div className="flex flex-col gap-1">
              <span
                className="uppercase"
                style={{
                  fontSize: 10.5,
                  color: "color-mix(in oklab, var(--mute) 70%, var(--text-2))",
                  letterSpacing: "0.06em",
                  fontWeight: 500,
                }}
              >
                Quarterly net Δ
              </span>
              <div
                style={{
                  display: "flex",
                  gap: 8,
                  alignItems: "flex-end",
                  height: 56,
                  marginTop: 4,
                }}
              >
                {row.holdings_history.slice(narrow ? -2 : -4).map((h) => {
                  const v = h.net_shares_change ?? 0;
                  const heightPct = maxNet > 0 ? (Math.abs(v) / maxNet) * 100 : 0;
                  return (
                    <div
                      key={h.date}
                      style={{
                        flex: 1,
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        gap: 4,
                        minWidth: 0,
                      }}
                    >
                      <span
                        className="font-mono tabular-nums truncate"
                        style={{ fontSize: 10.5, color: signedColor(v) }}
                      >
                        {signedCompact(v)}
                      </span>
                      <div
                        style={{
                          width: "100%",
                          height: 36,
                          background: "var(--panel-2)",
                          borderRadius: "3px 3px 0 0",
                          display: "flex",
                          flexDirection: "column",
                          justifyContent: "flex-end",
                          overflow: "hidden",
                        }}
                      >
                        <div
                          style={{
                            height: `${heightPct}%`,
                            background: v < 0 ? "var(--neg)" : "var(--pos)",
                            opacity: 0.85,
                            borderRadius: "3px 3px 0 0",
                          }}
                        />
                      </div>
                      <span style={{ fontSize: 10, color: "var(--mute)" }}>
                        {fmtQuarter(h.date)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}

        {/* Top moving funds list */}
        {fundRows.length > 0 && (
          <div className="flex flex-col gap-0.5">
            <span
              className="uppercase"
              style={{
                fontSize: 10.5,
                color: "color-mix(in oklab, var(--mute) 70%, var(--text-2))",
                letterSpacing: "0.06em",
                fontWeight: 500,
              }}
            >
              Largest movers (last Q)
            </span>
            {visible.map((f, i) => (
              <FundRow
                key={f.expert_uid ?? f.manager_name ?? i}
                f={f}
                rank={i}
                dense={dense}
              />
            ))}
            {fundRows.length > PAGE_SIZE && (
              <CardPager
                label={`${start + 1}–${start + visible.length} of ${fundRows.length}`}
                canPrev={safePage > 0}
                canNext={safePage < pageCount - 1}
                onPrev={() => setPage(safePage - 1)}
                onNext={() => setPage(safePage + 1)}
              />
            )}
          </div>
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

export function HedgeFundsCardSkeleton({ bare = false }: { bare?: boolean } = {}) {
  const body = (
    <div className="animate-pulse flex flex-col gap-3">
      <div
        className="h-5 w-32 rounded"
        style={{ background: "var(--panel-2)" }}
      />
      <div className="grid grid-cols-3 gap-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="h-8 rounded"
            style={{ background: "var(--panel-2)" }}
          />
        ))}
      </div>
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className="h-6 w-full rounded"
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
