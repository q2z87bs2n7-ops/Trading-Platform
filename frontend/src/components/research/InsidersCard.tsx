import { useState } from "react";

import { compact, money } from "../../lib/format";
import type { InsidersRow, InsiderTransaction } from "../../types";
import { CardPager } from "../discover/CardPager";

const PAGE_SIZE = 6;

function signedColor(n: number | null): string {
  if (n == null || n === 0) return "var(--mute)";
  return n > 0 ? "var(--pos)" : "var(--neg)";
}

// Tipranks insider transaction dates are DD/MM/YYYY (UK style). Parse
// defensively — fall back to raw string on anything unexpected.
function fmtInsiderDate(d: string | null): string {
  if (!d) return "—";
  const parts = d.split("/").map((s) => Number(s));
  if (parts.length === 3 && parts.every(Number.isFinite)) {
    const [day, month, year] = parts;
    // Sanity check — day > 12 confirms DD/MM; if day <= 12 we keep this
    // assumption rather than guessing (Tipranks is consistent per-endpoint).
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return new Date(year, month - 1, day).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "2-digit",
      });
    }
  }
  return d;
}

function txnColor(t: string | null): string {
  if (!t) return "var(--mute)";
  const lc = t.toLowerCase();
  if (lc.includes("buy")) return "var(--pos)";
  if (lc.includes("sell")) return "var(--neg)";
  return "var(--mute)";
}

function MonthlyBar({
  buy,
  sell,
}: {
  buy: number | null;
  sell: number | null;
}) {
  const b = buy ?? 0;
  const s = sell ?? 0;
  const total = b + s || 1;
  return (
    <div
      className="flex h-1.5 w-full overflow-hidden rounded"
      style={{ background: "var(--panel-2)" }}
    >
      <div
        style={{ width: `${(b / total) * 100}%`, background: "var(--pos)" }}
      />
      <div
        style={{ width: `${(s / total) * 100}%`, background: "var(--neg)" }}
      />
    </div>
  );
}

function MonthShortLabel({ m, y }: { m: number | null; y: number | null }) {
  if (m == null || y == null) return <>—</>;
  const names = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  const idx = m - 1;
  const name = idx >= 0 && idx < 12 ? names[idx] : `${m}`;
  return <>{name} {String(y).slice(-2)}</>;
}

function TxnRow({
  t,
  rank,
  dense,
}: {
  t: InsiderTransaction;
  rank: number;
  dense: boolean;
}) {
  return (
    <div
      className="grid items-center gap-2.5 py-2"
      style={{
        gridTemplateColumns: dense
          ? "1fr auto 72px"
          : "1fr 100px auto 72px",
        borderTop: rank === 0 ? "none" : "1px solid var(--border)",
      }}
    >
      <span
        className="text-[12.5px] font-semibold min-w-0 truncate"
        title={t.insider_name || ""}
      >
        {t.insider_name || "—"}
      </span>
      {!dense && (
        <span
          className="text-[11px] min-w-0 truncate"
          style={{ color: "var(--mute)" }}
          title={t.position || ""}
        >
          {t.position || ""}
        </span>
      )}
      <span
        className="font-mono text-[12px] tabular-nums text-right"
        style={{ color: txnColor(t.transaction) }}
        title={t.transaction || ""}
      >
        {t.amount != null ? money(t.amount) : "—"}
      </span>
      <span
        className="text-[11px] font-mono tabular-nums text-right"
        style={{ color: "var(--mute)" }}
      >
        {fmtInsiderDate(t.date)}
      </span>
    </div>
  );
}

export function InsidersCard({
  row,
  bare = false,
  dense = false,
}: {
  row: InsidersRow | null;
  bare?: boolean;
  dense?: boolean;
}) {
  const [page, setPage] = useState(0);
  const txns = row?.transactions ?? [];
  const pageCount = Math.max(1, Math.ceil(txns.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const start = safePage * PAGE_SIZE;
  const visible = txns.slice(start, start + PAGE_SIZE);

  // Last 6 months of bucketed activity (chronological).
  const monthly = (row?.monthly ?? []).slice(-6);

  const body =
    row == null ? (
      <p className="text-[13px]" style={{ color: "var(--mute)" }}>
        No insider data available for this symbol.
      </p>
    ) : (
      <div className="flex flex-col gap-3">
        {/* Confidence signal */}
        <div className="flex items-baseline gap-3">
          <div className="flex flex-col gap-0.5">
            <span
              className="text-[10px] uppercase"
              style={{ color: "var(--mute)", letterSpacing: "0.04em" }}
            >
              Insider trend
            </span>
            <span
              className="font-mono text-[15px] tabular-nums"
              style={{ color: signedColor(row.trend) }}
            >
              {row.trend != null ? row.trend.toFixed(2) : "—"}
            </span>
          </div>
          {row.confidence_signal.stock_score != null && (
            <div className="flex flex-col gap-0.5 ml-auto text-right">
              <span
                className="text-[10px] uppercase"
                style={{ color: "var(--mute)", letterSpacing: "0.04em" }}
              >
                Stock · sector
              </span>
              <span className="font-mono text-[12px] tabular-nums">
                {row.confidence_signal.stock_score.toFixed(2)} ·{" "}
                {row.confidence_signal.sector_score != null
                  ? row.confidence_signal.sector_score.toFixed(2)
                  : "—"}
              </span>
            </div>
          )}
        </div>

        {/* Transaction type counts */}
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-0.5">
            <span
              className="text-[10px] uppercase"
              style={{ color: "var(--mute)", letterSpacing: "0.04em" }}
            >
              Discretionary
            </span>
            <span className="font-mono text-[13px] tabular-nums">
              {row.discretionary_transactions ?? 0}
            </span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span
              className="text-[10px] uppercase"
              style={{ color: "var(--mute)", letterSpacing: "0.04em" }}
            >
              Uninformative
            </span>
            <span
              className="font-mono text-[13px] tabular-nums"
              style={{ color: "var(--mute)" }}
            >
              {row.uninformative_transactions ?? 0}
            </span>
          </div>
        </div>

        {/* Monthly buy/sell bars */}
        {monthly.length > 0 && (
          <div className="flex flex-col gap-1">
            <span
              className="text-[10px] uppercase"
              style={{ color: "var(--mute)", letterSpacing: "0.04em" }}
            >
              Last 6 months (buys vs sells)
            </span>
            <div className="grid grid-cols-6 gap-2">
              {monthly.map((m) => (
                <div
                  key={`${m.year}-${m.month}`}
                  className="flex flex-col gap-0.5"
                  title={`Buy $${compact(m.buy_amount ?? 0)} · Sell $${compact(m.sell_amount ?? 0)}`}
                >
                  <MonthlyBar buy={m.buy_amount} sell={m.sell_amount} />
                  <span
                    className="text-[9.5px] text-center"
                    style={{ color: "var(--mute)" }}
                  >
                    <MonthShortLabel m={m.month} y={m.year} />
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recent transactions list */}
        {txns.length > 0 && (
          <div className="flex flex-col gap-0.5">
            <span
              className="text-[10px] uppercase"
              style={{ color: "var(--mute)", letterSpacing: "0.04em" }}
            >
              Recent transactions
            </span>
            {visible.map((t, i) => (
              <TxnRow
                key={`${t.expert_uid ?? t.insider_name}-${start + i}`}
                t={t}
                rank={i}
                dense={dense}
              />
            ))}
            {txns.length > PAGE_SIZE && (
              <CardPager
                label={`${start + 1}–${start + visible.length} of ${txns.length}`}
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

export function InsidersCardSkeleton({ bare = false }: { bare?: boolean } = {}) {
  const body = (
    <div className="animate-pulse flex flex-col gap-3">
      <div
        className="h-6 w-20 rounded"
        style={{ background: "var(--panel-2)" }}
      />
      <div className="grid grid-cols-6 gap-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="h-3 rounded"
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
