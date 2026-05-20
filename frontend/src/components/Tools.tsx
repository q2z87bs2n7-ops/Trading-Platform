import { useState } from "react";

import { useIndices, useMostActives, useMovers, usePositions } from "../data/hooks";
import type { IndexData, Mover, MostActiveStock, Position } from "../types";
import ErrorBanner from "./ErrorBanner";
import News from "./News";

// ── Formatters ────────────────────────────────────────────────────────────────

const pct = (n: number) => `${n >= 0 ? "+" : ""}${(n * 100).toFixed(2)}%`;

const money = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD" });

const compactNum = (n: number) =>
  n.toLocaleString("en-US", { notation: "compact", maximumFractionDigits: 1 });

function fmtPrice(n: number): string {
  if (n >= 10_000) return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
  if (n >= 100) return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ── Shared panel shell ────────────────────────────────────────────────────────

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-panel border border-border rounded-lg p-3">
      <h2 className="text-[13px] uppercase tracking-wide text-muted m-0 mb-2">
        {title}
      </h2>
      {children}
    </div>
  );
}

// ── Mover / active rows (unchanged) ──────────────────────────────────────────

function MoverRow({ m, onSelect, selected }: { m: Mover; onSelect: (s: string) => void; selected: string }) {
  const up = m.percent_change >= 0;
  return (
    <button
      type="button"
      onClick={() => onSelect(m.symbol)}
      className={`w-full flex justify-between py-1 text-[13px] bg-transparent border-0 p-0 cursor-pointer text-left${selected === m.symbol ? " text-accent" : ""}`}
    >
      <span className="text-text font-semibold">{m.symbol}</span>
      <span className="flex gap-3 tabular-nums">
        <span className="text-muted">{money(m.price)}</span>
        <span style={{ color: up ? "var(--green)" : "var(--red)" }} className="min-w-[70px] text-right">
          {pct(m.percent_change)}
        </span>
      </span>
    </button>
  );
}

function ActiveRow({ a, onSelect, selected }: { a: MostActiveStock; onSelect: (s: string) => void; selected: string }) {
  return (
    <button
      type="button"
      onClick={() => onSelect(a.symbol)}
      className={`w-full flex justify-between py-1 text-[13px] bg-transparent border-0 p-0 cursor-pointer text-left${selected === a.symbol ? " text-accent" : ""}`}
    >
      <span className="text-text font-semibold">{a.symbol}</span>
      <span className="flex gap-3 tabular-nums text-muted">
        <span>vol {compactNum(a.volume)}</span>
        <span>{compactNum(a.trade_count)} trades</span>
      </span>
    </button>
  );
}

// ── Indices ticker ────────────────────────────────────────────────────────────

const REGION_ORDER: IndexData["region"][] = ["US", "Europe", "Asia"];

function IndexChip({ idx }: { idx: IndexData }) {
  const up = idx.change >= 0;
  const color = up ? "var(--pos)" : "var(--neg)";
  const arrow = up ? "▲" : "▼";
  return (
    <span className="flex items-center gap-2 px-4 border-r border-border whitespace-nowrap">
      <span className="text-muted text-[11px] font-medium">{idx.name}</span>
      <span className="text-text text-[13px] font-semibold tabular-nums">{fmtPrice(idx.price)}</span>
      <span className="text-[12px] tabular-nums font-medium" style={{ color }}>
        {arrow} {pct(idx.change_pct)}
      </span>
    </span>
  );
}

function IndicesTicker({ indices }: { indices: IndexData[] }) {
  const sorted = REGION_ORDER.flatMap((r) => indices.filter((i) => i.region === r));
  if (sorted.length === 0) return null;

  return (
    <div className="bg-panel border border-border rounded-lg overflow-hidden">
      <div className="flex items-center">
        <span className="text-[11px] uppercase tracking-widest text-muted font-semibold px-3 py-2 border-r border-border whitespace-nowrap">
          Markets
        </span>
        <div className="ticker-wrap overflow-hidden flex-1" style={{ height: 36 }}>
          <div className="ticker-track h-full items-center">
            {[...sorted, ...sorted].map((idx, i) => (
              <IndexChip key={i} idx={idx} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Holdings donut chart ──────────────────────────────────────────────────────

const SLICE_COLORS = [
  "#3b82f6", "#10b981", "#f59e0b", "#8b5cf6",
  "#06b6d4", "#f97316", "#84cc16", "#ec4899",
  "#6366f1", "#14b8a6",
];

interface SliceData {
  symbol: string;
  value: number;
  color: string;
  plpc: number;
}

function buildPath(
  cx: number, cy: number, outerR: number, innerR: number,
  startAngle: number, endAngle: number,
): string {
  const cos = Math.cos, sin = Math.sin;
  const x1 = cx + outerR * cos(startAngle), y1 = cy + outerR * sin(startAngle);
  const x2 = cx + outerR * cos(endAngle),   y2 = cy + outerR * sin(endAngle);
  const x3 = cx + innerR * cos(endAngle),   y3 = cy + innerR * sin(endAngle);
  const x4 = cx + innerR * cos(startAngle), y4 = cy + innerR * sin(startAngle);
  const large = endAngle - startAngle > Math.PI ? 1 : 0;
  return [
    `M ${x1} ${y1}`,
    `A ${outerR} ${outerR} 0 ${large} 1 ${x2} ${y2}`,
    `L ${x3} ${y3}`,
    `A ${innerR} ${innerR} 0 ${large} 0 ${x4} ${y4}`,
    "Z",
  ].join(" ");
}

function HoldingsPie({ positions }: { positions: Position[] }) {
  const [hovered, setHovered] = useState<string | null>(null);

  const open = positions.filter((p) => p.market_value > 0);
  if (open.length === 0) {
    return <p className="text-xs text-muted text-center py-6">No open positions</p>;
  }

  const total = open.reduce((s, p) => s + p.market_value, 0);
  const slices: SliceData[] = open.map((p, i) => ({
    symbol: p.symbol,
    value: p.market_value,
    color: SLICE_COLORS[i % SLICE_COLORS.length],
    plpc: p.unrealized_plpc,
  }));

  const cx = 75, cy = 75, outerR = 66, innerR = 42;
  let angle = -Math.PI / 2;
  const paths: Array<{ slice: SliceData; d: string }> = slices.map((slice) => {
    const sweep = (slice.value / total) * 2 * Math.PI;
    const start = angle;
    angle += sweep;
    return { slice, d: buildPath(cx, cy, outerR, innerR, start, angle) };
  });

  const hov = hovered ? slices.find((s) => s.symbol === hovered) : null;

  return (
    <div className="flex flex-col items-center gap-3">
      {/* Chart */}
      <div className="relative">
        <svg
          viewBox="0 0 150 150"
          width={150}
          height={150}
          style={{ overflow: "visible" }}
        >
          {paths.map(({ slice, d }) => (
            <path
              key={slice.symbol}
              d={d}
              fill={slice.color}
              opacity={hovered && hovered !== slice.symbol ? 0.35 : 1}
              style={{ transition: "opacity 0.15s", cursor: "pointer" }}
              onMouseEnter={() => setHovered(slice.symbol)}
              onMouseLeave={() => setHovered(null)}
            />
          ))}
        </svg>
        {/* Centre label */}
        <div
          className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none"
          style={{ top: 0 }}
        >
          {hov ? (
            <>
              <span className="text-[11px] font-bold text-text">{hov.symbol}</span>
              <span className="text-[10px] text-muted">{((hov.value / total) * 100).toFixed(1)}%</span>
              <span
                className="text-[10px] font-semibold"
                style={{ color: hov.plpc >= 0 ? "var(--pos)" : "var(--neg)" }}
              >
                {pct(hov.plpc)}
              </span>
            </>
          ) : (
            <>
              <span className="text-[10px] text-muted">Portfolio</span>
              <span className="text-[12px] font-bold text-text">{money(total)}</span>
            </>
          )}
        </div>
      </div>

      {/* Legend */}
      <div className="w-full flex flex-col gap-[3px]">
        {slices.map((s) => (
          <button
            key={s.symbol}
            type="button"
            className="w-full flex items-center justify-between text-[12px] bg-transparent border-0 p-0 cursor-pointer rounded"
            style={{ opacity: hovered && hovered !== s.symbol ? 0.45 : 1 }}
            onMouseEnter={() => setHovered(s.symbol)}
            onMouseLeave={() => setHovered(null)}
          >
            <span className="flex items-center gap-1.5">
              <span
                className="w-2 h-2 rounded-sm flex-shrink-0"
                style={{ background: s.color }}
              />
              <span className="text-text font-semibold">{s.symbol}</span>
            </span>
            <span className="flex gap-2 tabular-nums">
              <span className="text-muted">{((s.value / total) * 100).toFixed(1)}%</span>
              <span style={{ color: s.plpc >= 0 ? "var(--pos)" : "var(--neg)" }}>
                {pct(s.plpc)}
              </span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

export default function Tools({
  selected,
  onSelect,
}: {
  selected: string;
  onSelect: (symbol: string) => void;
}) {
  const [activeBy, setActiveBy] = useState<"volume" | "trades">("volume");
  const movers  = useMovers(10);
  const actives = useMostActives(10, activeBy);
  const indices = useIndices();
  const positions = usePositions();

  return (
    <div className="grid gap-4 mt-4" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>

      {/* Row 1 — Indices ticker (full width) */}
      <div style={{ gridColumn: "1 / -1" }}>
        {indices.isPending && (
          <div className="bg-panel border border-border rounded-lg px-4 py-2 text-xs text-muted">
            Loading market data…
          </div>
        )}
        {indices.data && <IndicesTicker indices={indices.data.indices} />}
      </div>

      {/* Row 2 col 1 — Holdings pie */}
      <Panel title="Holdings">
        {positions.error && <ErrorBanner message={positions.error.message} />}
        {positions.isPending && !positions.error && (
          <p className="text-xs text-muted">Loading…</p>
        )}
        {positions.data && (
          <HoldingsPie positions={positions.data.positions} />
        )}
      </Panel>

      {/* Row 2 col 2 — Gainers */}
      <Panel title="Top Gainers">
        {movers.error && <ErrorBanner message={movers.error.message} />}
        {!movers.error && movers.isPending && <div className="text-xs text-muted">Loading…</div>}
        {movers.data?.gainers.map((m) => (
          <MoverRow key={m.symbol} m={m} onSelect={onSelect} selected={selected} />
        ))}
      </Panel>

      {/* Row 2 col 3 — Losers */}
      <Panel title="Top Losers">
        {movers.error && <ErrorBanner message={movers.error.message} />}
        {!movers.error && movers.isPending && <div className="text-xs text-muted">Loading…</div>}
        {movers.data?.losers.map((m) => (
          <MoverRow key={m.symbol} m={m} onSelect={onSelect} selected={selected} />
        ))}
      </Panel>

      {/* Row 3 col 1 — Most Active */}
      <Panel title="Most Active">
        <div className="flex gap-1 mb-2">
          <button
            type="button"
            onClick={() => setActiveBy("volume")}
            className={`btn btn-mini${activeBy === "volume" ? " active" : ""}`}
            style={{ opacity: activeBy === "volume" ? 1 : 0.6 }}
          >
            Volume
          </button>
          <button
            type="button"
            onClick={() => setActiveBy("trades")}
            className={`btn btn-mini${activeBy === "trades" ? " active" : ""}`}
            style={{ opacity: activeBy === "trades" ? 1 : 0.6 }}
          >
            Trades
          </button>
        </div>
        {actives.error && <ErrorBanner message={actives.error.message} />}
        {!actives.error && actives.isPending && <div className="text-xs text-muted">Loading…</div>}
        {actives.data?.most_actives.map((a) => (
          <ActiveRow key={a.symbol} a={a} onSelect={onSelect} selected={selected} />
        ))}
      </Panel>

      {/* Row 3 cols 2–3 — News */}
      <div style={{ gridColumn: "2 / 4" }}>
        <News symbol={selected} />
      </div>

    </div>
  );
}
