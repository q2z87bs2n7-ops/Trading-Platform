import { compact, money, pct } from "../../lib/format";
import type { SmartScoreRow } from "../../types";

// Tipranks composite score (1–10) + the six component signals. Hides the
// fundamentals_* fields (they collide with the Fundamentals widget — FMP is
// the higher-fidelity source); the AI still gets them via get_smart_score.

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

function Signal({
  label,
  value,
  tone,
  hint,
}: {
  label: string;
  value: React.ReactNode;
  tone?: string;
  hint?: string;
}) {
  return (
    <div
      className="flex items-center justify-between py-1.5"
      style={{ borderTop: "1px solid var(--border)" }}
    >
      <span
        className="text-[12px]"
        style={{ color: "var(--mute)" }}
        title={hint}
      >
        {label}
      </span>
      <span
        className="font-mono text-[13px] tabular-nums"
        style={{ color: tone ?? "var(--text)" }}
      >
        {value}
      </span>
    </div>
  );
}

// Bipolar number: positive=green, negative=red, zero=mute.
function signedColor(n: number | null): string {
  if (n == null || n === 0) return "var(--mute)";
  return n > 0 ? "var(--pos)" : "var(--neg)";
}

// Render a count of shares (the hedge-fund trend value / insider sum), with a
// thousand-friendly compact format so a -1,209,112 reads as -1.21M.
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
        {/* Composite headline */}
        <div className="flex items-baseline gap-3">
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
            className="text-[13px] ml-auto"
            style={{ color: scoreColor(row.smart_score) }}
          >
            {scoreLabel(row.smart_score)}
          </span>
        </div>

        {/* Tipranks price target (NOT unified with trending's avg PT) */}
        <Signal
          label="Price Target"
          value={row.price_target != null ? money(row.price_target) : "—"}
          hint="Tipranks composite price target"
        />

        {/* Analyst-driven signals */}
        <Signal
          label="Bloggers (bullish)"
          value={
            row.blogger_bullish_sentiment != null
              ? pct(row.blogger_bullish_sentiment)
              : "—"
          }
          hint={
            row.blogger_sector_avg != null
              ? `Sector avg ${pct(row.blogger_sector_avg)}`
              : undefined
          }
        />
        <Signal
          label="News (bullish · bearish)"
          value={
            row.news_sentiments_bullish_percent != null &&
            row.news_sentiments_bearish_percent != null
              ? `${pct(row.news_sentiments_bullish_percent)} · ${pct(row.news_sentiments_bearish_percent)}`
              : "—"
          }
        />

        {/* Flow signals */}
        <Signal
          label="Hedge fund flow (last Q)"
          value={fmtShares(row.hedge_fund_trend_value)}
          tone={signedColor(row.hedge_fund_trend_value)}
          hint="Net shares traded by hedge funds in the most recent quarter"
        />
        <Signal
          label="Insider activity (3mo)"
          value={fmtShares(row.insiders_last_3_months_sum)}
          tone={signedColor(row.insiders_last_3_months_sum)}
          hint="Net insider transactions over the last 3 months"
        />

        {/* Investor sentiment deltas */}
        <Signal
          label="Investors (7d Δ)"
          value={
            row.investor_holding_change_last_7_days != null
              ? pct(row.investor_holding_change_last_7_days)
              : "—"
          }
          tone={signedColor(row.investor_holding_change_last_7_days)}
        />
        <Signal
          label="Investors (30d Δ)"
          value={
            row.investor_holding_change_last_30_days != null
              ? pct(row.investor_holding_change_last_30_days)
              : "—"
          }
          tone={signedColor(row.investor_holding_change_last_30_days)}
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
