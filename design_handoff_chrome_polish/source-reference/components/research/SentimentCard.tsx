import { compact, pct } from "../../lib/format";
import type { SentimentRow } from "../../types";

// Combined sentiment surface — bloggerConsensus + newsSentiment +
// InvestorSentiment fanned into one Tipranks widget. Each block reads
// independently, so a partial outage just thins the card.

function Section({
  label,
  children,
  empty,
}: {
  label: string;
  children: React.ReactNode;
  empty?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span
        className="text-[10px] font-medium uppercase"
        style={{ color: "var(--mute)", letterSpacing: "0.04em" }}
      >
        {label}
      </span>
      {empty ? (
        <span className="text-[12px]" style={{ color: "var(--mute)" }}>
          —
        </span>
      ) : (
        children
      )}
    </div>
  );
}

// Three-segment horizontal bar (pos/neu/neg). Widths sum to 100%; falls back
// to a flat mute bar when all three are null.
function SentimentBar({
  pos,
  neu,
  neg,
}: {
  pos: number | null;
  neu: number | null;
  neg: number | null;
}) {
  if (pos == null && neu == null && neg == null) {
    return (
      <div
        className="h-2 w-full rounded"
        style={{ background: "var(--panel-2)" }}
      />
    );
  }
  const p = pos ?? 0;
  const n = neg ?? 0;
  const e = neu ?? Math.max(0, 1 - p - n);
  const total = p + e + n || 1;
  const sty = (frac: number, color: string) => ({
    width: `${(frac / total) * 100}%`,
    background: color,
  });
  return (
    <div
      className="flex h-2 w-full overflow-hidden rounded"
      style={{ background: "var(--panel-2)" }}
    >
      <div style={sty(p, "var(--pos)")} />
      <div style={sty(e, "var(--mute)")} />
      <div style={sty(n, "var(--neg)")} />
    </div>
  );
}

function StatRow({
  label,
  value,
  tone,
}: {
  label: string;
  value: React.ReactNode;
  tone?: string;
}) {
  return (
    <div className="flex items-center justify-between text-[12px]">
      <span style={{ color: "var(--mute)" }}>{label}</span>
      <span
        className="font-mono tabular-nums"
        style={{ color: tone ?? "var(--text)" }}
      >
        {value}
      </span>
    </div>
  );
}

function signedColor(n: number | null): string {
  if (n == null || n === 0) return "var(--mute)";
  return n > 0 ? "var(--pos)" : "var(--neg)";
}

export function SentimentCard({
  row,
  bare = false,
}: {
  row: SentimentRow | null;
  bare?: boolean;
}) {
  const body =
    row == null ? (
      <p className="text-[13px]" style={{ color: "var(--mute)" }}>
        No sentiment data available for this symbol.
      </p>
    ) : (
      <div className="flex flex-col gap-3">
        {/* News sentiment — stock vs sector + score header + buzz chip */}
        <Section
          label="News"
          empty={
            row.news.stock.positive == null &&
            row.news.stock.negative == null
          }
        >
          {/* Header row: news score vs sector + buzz chip on the right */}
          {(row.news.score.stock_score || row.news.buzz.buzz != null) && (
            <div className="flex items-center justify-between mb-1">
              {row.news.score.stock_score && (
                <span
                  className="text-[11px]"
                  style={{ color: "var(--text)" }}
                >
                  {row.news.score.stock_score}
                  {row.news.score.sector_score != null && (
                    <span style={{ color: "var(--mute)" }}>
                      {" "}
                      · vs sector {row.news.score.sector_score.toFixed(2)}
                    </span>
                  )}
                </span>
              )}
              {row.news.buzz.buzz != null && (
                <span
                  className="text-[10.5px] tabular-nums"
                  style={{ color: "var(--mute)" }}
                  title={
                    row.news.buzz.weekly_average != null
                      ? `${row.news.buzz.this_week ?? "?"} this week · ${row.news.buzz.weekly_average.toFixed(0)} avg`
                      : "News article volume vs trailing average"
                  }
                >
                  Buzz {row.news.buzz.buzz.toFixed(2)}×
                </span>
              )}
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2">
              <span
                className="text-[11px] w-12"
                style={{ color: "var(--mute)" }}
              >
                Stock
              </span>
              <SentimentBar
                pos={row.news.stock.positive}
                neu={row.news.stock.neutral}
                neg={row.news.stock.negative}
              />
              <span
                className="text-[11px] font-mono tabular-nums w-10 text-right"
                style={{ color: "var(--pos)" }}
              >
                {row.news.stock.positive != null
                  ? pct(row.news.stock.positive)
                  : "—"}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span
                className="text-[11px] w-12"
                style={{ color: "var(--mute)" }}
              >
                Sector
              </span>
              <SentimentBar
                pos={row.news.sector.positive}
                neu={row.news.sector.neutral}
                neg={row.news.sector.negative}
              />
              <span
                className="text-[11px] font-mono tabular-nums w-10 text-right"
                style={{ color: "var(--pos)" }}
              >
                {row.news.sector.positive != null
                  ? pct(row.news.sector.positive)
                  : "—"}
              </span>
            </div>
          </div>
          {/* Word cloud — top phrases from recent news (capped at 6 upstream) */}
          {row.news.word_cloud.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              {row.news.word_cloud.slice(0, 6).map((w, i) => (
                <span
                  key={i}
                  className="text-[10.5px] px-1.5 py-0.5 rounded"
                  style={{
                    background: "var(--panel-2)",
                    color: "var(--mute)",
                  }}
                  title="Phrase extracted from recent news"
                >
                  {w}
                </span>
              ))}
            </div>
          )}
        </Section>

        {/* Blogger consensus */}
        <Section
          label="Bloggers"
          empty={row.blogger.bullish_ratio == null}
        >
          <div className="flex flex-col gap-1">
            <StatRow
              label="Bullish"
              value={
                row.blogger.bullish_ratio != null
                  ? pct(row.blogger.bullish_ratio)
                  : "—"
              }
              tone="var(--pos)"
            />
            <StatRow
              label="Bearish"
              value={
                row.blogger.bearish_ratio != null
                  ? pct(row.blogger.bearish_ratio)
                  : "—"
              }
              tone="var(--neg)"
            />
            {row.blogger.sector_bull_ratio != null && (
              <StatRow
                label="Sector bullish (avg)"
                value={pct(row.blogger.sector_bull_ratio)}
              />
            )}
            {row.blogger.blogs_distribution.length > 0 && (
              <div
                className="flex flex-col gap-0.5 mt-1 pt-1"
                style={{ borderTop: "1px solid var(--border)" }}
              >
                <span
                  className="text-[10px]"
                  style={{ color: "var(--mute)" }}
                >
                  Sources
                </span>
                {row.blogger.blogs_distribution.slice(0, 4).map((b) => (
                  <StatRow
                    key={b.site}
                    label={b.site}
                    value={b.percentage != null ? pct(b.percentage) : "—"}
                  />
                ))}
              </div>
            )}
          </div>
        </Section>

        {/* Investor sentiment (Tipranks portfolios) */}
        <Section
          label="Investors"
          empty={
            row.investor.portfolios_holding_stock == null ||
            row.investor.portfolios_holding_stock === 0
          }
        >
          {/* Header: investor score + sector benchmark + sentiment label */}
          {(row.investor.investor_score != null ||
            row.investor.sentiment) && (
            <div
              className="flex items-center gap-2 mb-1 text-[11px]"
            >
              {row.investor.investor_score != null && (
                <span style={{ color: "var(--text)" }}>
                  Score {row.investor.investor_score.toFixed(2)}
                </span>
              )}
              {row.investor.sector_average_score != null && (
                <span style={{ color: "var(--mute)" }}>
                  · vs sector {row.investor.sector_average_score.toFixed(2)}
                </span>
              )}
              {row.investor.sentiment && (
                <span
                  className="ml-auto"
                  style={{
                    color:
                      row.investor.sentiment.toLowerCase().includes("positive")
                        ? "var(--pos)"
                        : row.investor.sentiment.toLowerCase().includes("negative")
                          ? "var(--neg)"
                          : "var(--mute)",
                  }}
                >
                  {row.investor.sentiment}
                </span>
              )}
            </div>
          )}
          <div className="flex flex-col gap-1">
            <StatRow
              label="Portfolios holding"
              value={
                row.investor.portfolios_holding_stock != null
                  ? compact(row.investor.portfolios_holding_stock)
                  : "—"
              }
            />
            <StatRow
              label="Avg allocation"
              value={
                row.investor.average_allocation != null
                  ? pct(row.investor.average_allocation)
                  : "—"
              }
            />
            <StatRow
              label="7d change"
              value={
                row.investor.percent_over_last_7_days != null
                  ? pct(row.investor.percent_over_last_7_days)
                  : "—"
              }
              tone={signedColor(row.investor.percent_over_last_7_days)}
            />
            <StatRow
              label="30d change"
              value={
                row.investor.percent_over_last_30_days != null
                  ? pct(row.investor.percent_over_last_30_days)
                  : "—"
              }
              tone={signedColor(row.investor.percent_over_last_30_days)}
            />
            {/* Best investors subset — Tipranks-ranked top performers only */}
            {row.investor.best &&
              row.investor.best.portfolios_holding_stock != null &&
              row.investor.best.portfolios_holding_stock > 0 && (
                <div
                  className="flex flex-col gap-0.5 mt-1 pt-1"
                  style={{ borderTop: "1px solid var(--border)" }}
                >
                  <span
                    className="text-[10px] uppercase"
                    style={{ color: "var(--mute)", letterSpacing: "0.04em" }}
                  >
                    Best investors
                  </span>
                  {row.investor.best.investor_score != null && (
                    <StatRow
                      label="Score"
                      value={row.investor.best.investor_score.toFixed(2)}
                    />
                  )}
                  <StatRow
                    label="Allocation"
                    value={
                      row.investor.best.average_allocation != null
                        ? pct(row.investor.best.average_allocation)
                        : "—"
                    }
                  />
                  <StatRow
                    label="7d change"
                    value={
                      row.investor.best.percent_over_last_7_days != null
                        ? pct(row.investor.best.percent_over_last_7_days)
                        : "—"
                    }
                    tone={signedColor(
                      row.investor.best.percent_over_last_7_days,
                    )}
                  />
                  <StatRow
                    label="30d change"
                    value={
                      row.investor.best.percent_over_last_30_days != null
                        ? pct(row.investor.best.percent_over_last_30_days)
                        : "—"
                    }
                    tone={signedColor(
                      row.investor.best.percent_over_last_30_days,
                    )}
                  />
                </div>
              )}
          </div>
        </Section>
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

export function SentimentCardSkeleton({ bare = false }: { bare?: boolean } = {}) {
  const body = (
    <div className="animate-pulse flex flex-col gap-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="flex flex-col gap-1.5">
          <div
            className="h-3 w-16 rounded"
            style={{ background: "var(--panel-2)" }}
          />
          <div
            className="h-2 w-full rounded"
            style={{ background: "var(--panel-2)" }}
          />
          <div
            className="h-2 w-full rounded"
            style={{ background: "var(--panel-2)" }}
          />
        </div>
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
