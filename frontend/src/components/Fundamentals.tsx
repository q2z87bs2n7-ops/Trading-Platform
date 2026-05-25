import { useAssetProfile } from "../data/hooks";
import { pct } from "../lib/format";
import type { AssetProfile, FinancialsYear } from "../types";

// Annual fundamentals surface for stocks (FMP, Starter tier = annual-only).
// Deliberately disjoint from the Profile widget: no market cap / beta / sector /
// description here — only statement-derived figures (revenue & net-income trend,
// valuation, margins, growth, dividend). Location-agnostic: the Workspace
// Fundamentals widget wraps it. Crypto has no income statement, so this is
// stocks-only.

function fmtUsd(n: number): string {
  const a = Math.abs(n);
  const s = n < 0 ? "-" : "";
  if (a >= 1e12) return `${s}$${(a / 1e12).toFixed(2)}T`;
  if (a >= 1e9) return `${s}$${(a / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `${s}$${(a / 1e6).toFixed(1)}M`;
  if (a >= 1e3) return `${s}$${(a / 1e3).toFixed(0)}K`;
  return `${s}$${a.toLocaleString("en-US")}`;
}

const fmtPct = (n: number) => `${(n * 100).toFixed(1)}%`;
const fmtMult = (n: number) => `${n.toFixed(n >= 100 ? 0 : 1)}×`;

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[13px] p-1" style={{ color: "var(--mute)" }}>
      {children}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: React.ReactNode; tone?: string }) {
  return (
    <div className="flex flex-col gap-0.5 min-w-0">
      <span
        className="text-[10px] font-medium uppercase"
        style={{ color: "var(--mute)", letterSpacing: "0.04em" }}
      >
        {label}
      </span>
      <span
        className="font-mono text-[12.5px] tabular-nums truncate"
        style={{ color: tone ?? "var(--text)" }}
      >
        {value}
      </span>
    </div>
  );
}

function Group({
  title,
  children,
  cols,
}: {
  title: string;
  children: React.ReactNode;
  cols: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span
        className="text-[10px] font-semibold uppercase"
        style={{ color: "var(--mute)", letterSpacing: "0.06em", opacity: 0.7 }}
      >
        {title}
      </span>
      <div className={`grid ${cols} gap-x-4 gap-y-2.5`}>{children}</div>
    </div>
  );
}

// Grouped revenue + net-income bars, oldest→newest. One shared scale (max abs)
// so the two series are comparable; net income drops below the zero line when
// negative.
function TrendChart({ rows }: { rows: FinancialsYear[] }) {
  const data = rows
    .filter((r) => r.revenue != null || r.net_income != null)
    .slice()
    .reverse();
  if (data.length < 2) return null;

  const vals = data.flatMap((d) => [d.revenue ?? 0, d.net_income ?? 0]);
  const max = Math.max(...vals, 0);
  const min = Math.min(...vals, 0);
  const span = max - min || 1;

  const W = 300;
  const H = 72;
  const padB = 16; // year labels
  const plotH = H - padB;
  const zeroY = (max / span) * plotH;
  const slot = W / data.length;
  const barW = Math.min(14, slot * 0.32);

  const y = (v: number) => (max - v) / span * plotH;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img" aria-label="Revenue and net income trend">
      <line x1={0} y1={zeroY} x2={W} y2={zeroY} stroke="var(--hairline)" strokeWidth={1} />
      {data.map((d, i) => {
        const cx = i * slot + slot / 2;
        const rev = d.revenue ?? 0;
        const ni = d.net_income ?? 0;
        const revTop = y(Math.max(rev, 0));
        const niTop = y(Math.max(ni, 0));
        const niBot = y(Math.min(ni, 0));
        return (
          <g key={d.year}>
            <rect
              x={cx - barW - 1}
              y={revTop}
              width={barW}
              height={Math.max(1, zeroY - revTop)}
              rx={1.5}
              fill="var(--accent)"
              opacity={0.85}
            />
            <rect
              x={cx + 1}
              y={ni >= 0 ? niTop : zeroY}
              width={barW}
              height={Math.max(1, ni >= 0 ? zeroY - niTop : niBot - zeroY)}
              rx={1.5}
              fill={ni >= 0 ? "var(--pos)" : "var(--neg)"}
              opacity={0.85}
            />
            <text
              x={cx}
              y={H - 4}
              textAnchor="middle"
              className="font-mono"
              style={{ fontSize: 9, fill: "var(--mute)" }}
            >
              {`'${String(d.year).slice(2)}`}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function hasFundamentals(p: AssetProfile): boolean {
  return (
    !!p.fundamentals_enriched_at ||
    !!(p.financials_annual && p.financials_annual.length) ||
    p.pe_ratio != null ||
    p.net_margin != null
  );
}

export default function Fundamentals({
  symbol,
  assetClass,
  dense,
}: {
  symbol: string;
  assetClass: "stocks" | "crypto";
  dense?: boolean;
}) {
  const { data: p, isLoading } = useAssetProfile(symbol);
  const isCrypto = p ? p.asset_class === "crypto" : assetClass === "crypto";

  if (!symbol) return <Notice>Pick an instrument to see its fundamentals.</Notice>;
  if (isCrypto) return <Notice>Fundamentals are available for stocks only.</Notice>;
  if (isLoading && !p) return <Notice>Loading fundamentals…</Notice>;
  if (!p) return <Notice>No data for {symbol}.</Notice>;
  if (!hasFundamentals(p))
    return <Notice>No fundamentals for {p.symbol} yet — not in the enriched set.</Notice>;

  const cols = dense ? "grid-cols-1" : "grid-cols-2";
  const cur = p.reported_currency && p.reported_currency !== "USD" ? ` · ${p.reported_currency}` : "";
  const pe = p.pe_ratio;
  const growthTone = (n?: number) =>
    n == null ? undefined : n >= 0 ? "var(--pos)" : "var(--neg)";

  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex items-baseline justify-between gap-2">
        <div className="text-[13px] font-semibold truncate" title={p.name}>
          {p.symbol}
        </div>
        {p.latest_fiscal_year != null && (
          <div className="text-[10.5px] font-mono" style={{ color: "var(--mute)" }}>
            FY{p.latest_fiscal_year}
            {cur}
          </div>
        )}
      </div>

      {p.financials_annual && p.financials_annual.length >= 2 && (
        <div className="flex flex-col gap-1">
          <div
            className="flex items-center gap-3 text-[10px] uppercase"
            style={{ color: "var(--mute)", letterSpacing: "0.04em" }}
          >
            <span className="flex items-center gap-1">
              <span className="inline-block w-2 h-2 rounded-sm" style={{ background: "var(--accent)" }} />
              Revenue
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block w-2 h-2 rounded-sm" style={{ background: "var(--pos)" }} />
              Net income
            </span>
          </div>
          <TrendChart rows={p.financials_annual} />
        </div>
      )}

      <Group title="Valuation" cols={cols}>
        {pe != null && <Stat label="P/E" value={fmtMult(pe)} />}
        {p.ps_ratio != null && <Stat label="P/S" value={fmtMult(p.ps_ratio)} />}
        {p.pb_ratio != null && <Stat label="P/B" value={fmtMult(p.pb_ratio)} />}
        {p.ev_to_ebitda != null && <Stat label="EV/EBITDA" value={fmtMult(p.ev_to_ebitda)} />}
        {p.peg_ratio != null && <Stat label="PEG" value={p.peg_ratio.toFixed(2)} />}
      </Group>

      <Group title="Profitability" cols={cols}>
        {p.gross_margin != null && <Stat label="Gross margin" value={fmtPct(p.gross_margin)} />}
        {p.operating_margin != null && (
          <Stat label="Operating margin" value={fmtPct(p.operating_margin)} />
        )}
        {p.net_margin != null && <Stat label="Net margin" value={fmtPct(p.net_margin)} />}
        {p.roe != null && <Stat label="ROE" value={fmtPct(p.roe)} />}
        {p.roic != null && <Stat label="ROIC" value={fmtPct(p.roic)} />}
      </Group>

      {(p.revenue_growth_yoy != null || p.eps_growth_yoy != null) && (
        <Group title="Growth (YoY)" cols={cols}>
          {p.revenue_growth_yoy != null && (
            <Stat label="Revenue" value={pct(p.revenue_growth_yoy)} tone={growthTone(p.revenue_growth_yoy)} />
          )}
          {p.eps_growth_yoy != null && (
            <Stat label="EPS" value={pct(p.eps_growth_yoy)} tone={growthTone(p.eps_growth_yoy)} />
          )}
        </Group>
      )}

      <Group title="Health" cols={cols}>
        {p.debt_to_equity != null && <Stat label="Debt / equity" value={p.debt_to_equity.toFixed(2)} />}
        {p.current_ratio != null && <Stat label="Current ratio" value={p.current_ratio.toFixed(2)} />}
        {p.eps_diluted != null && <Stat label="EPS (diluted)" value={`$${p.eps_diluted.toFixed(2)}`} />}
        {p.free_cash_flow != null && <Stat label="Free cash flow" value={fmtUsd(p.free_cash_flow)} />}
      </Group>

      {(p.dividend_yield != null || p.payout_ratio != null) && (
        <Group title="Dividend" cols={cols}>
          {p.dividend_yield != null && <Stat label="Yield" value={fmtPct(p.dividend_yield)} />}
          {p.payout_ratio != null && <Stat label="Payout" value={fmtPct(p.payout_ratio)} />}
        </Group>
      )}
    </div>
  );
}
