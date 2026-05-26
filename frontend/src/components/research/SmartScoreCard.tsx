import { compact, money, pct } from "../../lib/format";
import type { SmartScoreRow } from "../../types";

// Tipranks composite score (1–10) + companion text labels for each component.
// After Phase 2 dedup verdict: drop the raw numerics for components that have
// dedicated owning widgets (Sentiment owns blogger/news/investor magnitudes;
// HedgeFunds + Insiders own those flows); keep only the categorical text
// labels as one-line verdicts so this card stays a TRUE composite summary.
// Numerics retained only for the technicals row (no other widget owns it)
// and for the hedge-fund / insider flow rows where the share count is the
// quickest read alongside the text label.

function scoreColor(score: number | null): string {
  if (score == null) return "var(--mute)";
  if (score >= 8) return "var(--pos)";
  if (score >= 5) return "var(--text)";
  if (score >= 3) return "var(--mute)";
  return "var(--neg)";
}

function scoreLabel(score: number | null): string {
  if (score == null) return "—";
  if (score >= 9) return "Very Bullish";
  if (score >= 7) return "Bullish";
  if (score >= 5) return "Neutral";
  if (score >= 3) return "Bearish";
  return "Very Bearish";
}

// Tipranks text-label sentiment → color. Matches the underlying numeric
// component's tone so the row's label visually reinforces the signal.
function labelColor(s: string | null): string {
  if (!s || s === "-" || s.toLowerCase() === "neutral") return "var(--mute)";
  const lc = s.toLowerCase();
  if (
    lc.includes("positive") ||
    lc.includes("bullish") ||
    lc === "buy" ||
    lc === "strongbuy" ||
    lc === "increased" ||
    lc === "buying"
  ) {
    return "var(--pos)";
  }
  if (
    lc.includes("negative") ||
    lc.includes("bearish") ||
    lc === "sell" ||
    lc === "strongsell" ||
    lc === "decreased" ||
    lc === "selling"
  ) {
    return "var(--neg)";
  }
  return "var(--mute)";
}

function Row({
  label,
  value,
  status,
  hint,
}: {
  label: string;
  /** Optional left-side numeric (kept only where it's a one-glance read). */
  value?: React.ReactNode;
  /** Right-side categorical label from Tipranks. */
  status: string | null;
  hint?: string;
}) {
  return (
    <div
      className="flex items-center justify-between gap-2 py-1.5"
      style={{ borderTop: "1px solid var(--border)" }}
    >
      <span
        className="text-[12px] flex-shrink-0"
        style={{ color: "var(--mute)" }}
        title={hint}
      >
        {label}
      </span>
      <div className="flex items-center gap-2 min-w-0">
        {value !== undefined && (
          <span
            className="font-mono text-[12px] tabular-nums"
            style={{ color: "var(--mute)" }}
          >
            {value}
          </span>
        )}
        <span
          className="text-[12px] truncate"
          style={{ color: labelColor(status) }}
        >
          {status || "—"}
        </span>
      </div>
    </div>
  );
}

function fmtShares(n: number | null): string {
  if (n == null) return "—";
  const sign = n < 0 ? "−" : n > 0 ? "+" : "";
  return `${sign}${compact(Math.abs(n))}`;
}

export function SmartScoreCard({
  row,
  bare = false,
}: {
  row: SmartScoreRow | null;
  bare?: boolean;
}) {
  const body =
    row == null || row.smart_score == null ? (
      <p className="text-[13px]" style={{ color: "var(--mute)" }}>
        No SmartScore available for this symbol.
      </p>
    ) : (
      <div className="flex flex-col gap-2">
        {/* Headline: composite score + label + Tipranks PT inline */}
        <div className="flex items-baseline gap-3 flex-wrap">
          <span
            className="font-mono tabular-nums leading-none"
            style={{
              color: scoreColor(row.smart_score),
              fontSize: 40,
              fontWeight: 600,
            }}
          >
            {row.smart_score}
          </span>
          <span className="text-[11px]" style={{ color: "var(--mute)" }}>
            / 10
          </span>
          <span
            className="text-[13px]"
            style={{ color: scoreColor(row.smart_score) }}
          >
            {scoreLabel(row.smart_score)}
          </span>
          {row.price_target != null && (
            <span
              className="font-mono text-[12px] tabular-nums ml-auto"
              style={{ color: "var(--text)" }}
              title="Tipranks composite price target"
            >
              PT {money(row.price_target)}
            </span>
          )}
        </div>

        {/* Technicals — no other widget owns this, keep numeric + SMA label */}
        <Row
          label="12M momentum"
          value={
            row.technicals_twelve_months_momentum != null
              ? pct(row.technicals_twelve_months_momentum)
              : undefined
          }
          status={row.sma}
          hint="12-month price momentum + Simple Moving Average signal"
        />

        {/* Hedge fund flow — keep numeric (share count is the quick read) */}
        <Row
          label="Hedge funds"
          value={fmtShares(row.hedge_fund_trend_value)}
          status={row.hedge_fund_trend}
          hint="Net shares traded by hedge funds (last quarter)"
        />

        {/* Insider 3-month — keep numeric (Insiders widget reframes as $ flow) */}
        <Row
          label="Insiders (3mo)"
          value={fmtShares(row.insiders_last_3_months_sum)}
          status={row.insider_trend}
          hint="Net insider transactions over the last 3 months"
        />

        {/* Sentiment-family rows — text label ONLY (Sentiment widget owns
            the bars and ratios; SmartScore stays a summary).               */}
        <Row
          label="Bloggers"
          status={row.blogger_consensus}
          hint="Blogger consensus (see Sentiment widget for ratios + per-source breakdown)"
        />
        <Row
          label="News"
          status={row.news_sentiment}
          hint="News sentiment (see Sentiment widget for stock vs sector breakdown)"
        />
        <Row
          label="Investors"
          status={row.investor_sentiment}
          hint="Tipranks-investor sentiment (see Sentiment widget for 7d/30d deltas + holder demographics)"
        />
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

export function SmartScoreCardSkeleton({ bare = false }: { bare?: boolean } = {}) {
  const body = (
    <div className="animate-pulse flex flex-col gap-2">
      <div
        className="h-10 w-24 rounded"
        style={{ background: "var(--panel-2)" }}
      />
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="h-5 w-full rounded mt-1.5"
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
