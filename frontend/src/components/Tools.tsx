import { useMemo, useState } from "react";

import * as api from "../api";
import {
  useAccount,
  useAddToWatchlist,
  useIndices,
  useMarketNews,
  useMovers,
  usePositions,
  useRemoveFromWatchlist,
  useSnapshots,
  useWatchlist,
} from "../data/hooks";
import { showToast } from "../lib/toast";
import type {
  IndexData,
  MarketNewsArticle,
  Mover,
  Position,
  Snapshot,
} from "../types";
import ErrorBanner from "./ErrorBanner";
import MarketSummaryCard from "./MarketSummaryCard";
import PriceChart from "./PriceChart";
import SectionHeading from "./SectionHeading";
import { useMarketSummary } from "../hooks/useMarketSummary";

// ── Formatters ────────────────────────────────────────────────────────────────

const pct = (n: number) => `${n >= 0 ? "+" : ""}${(n * 100).toFixed(2)}%`;
const money = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD" });

function fmtPrice(n: number): string {
  if (n >= 10_000) return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
  return n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function relTime(ts: number): string {
  const diff = Math.max(0, Date.now() / 1000 - ts);
  if (diff < 60) return "now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

// ── Sparkline path generator ──────────────────────────────────────────────────
// Synthetic curve seeded by symbol + day-change. Matches the mock's approach
// while we wait on a real bars-per-symbol batch endpoint.

function sparkPath(
  symbol: string,
  dayChange: number,
  width = 100,
  height = 32,
): string {
  const n = 24;
  const seed = symbol.charCodeAt(0) + (symbol.length % 5);
  const arr: number[] = [];
  for (let k = 0; k < n; k++) {
    const sine = Math.sin(k * (symbol.length % 4 + 1) + seed) * 0.005;
    arr.push(1 + sine + (dayChange / n) * k);
  }
  const min = Math.min(...arr);
  const max = Math.max(...arr);
  const range = max - min || 1;
  const stepX = width / (n - 1);
  return arr
    .map((v, i) => {
      const x = i * stepX;
      const y = height - ((v - min) / range) * (height - 4) - 2;
      return `${i === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
}

// ── Hero · Total balance card ─────────────────────────────────────────────────

function BalanceCard({
  account,
  invested,
  unrealized,
  unrealizedPct,
}: {
  account: ReturnType<typeof useAccount>["data"];
  invested: number;
  unrealized: number;
  unrealizedPct: number;
}) {
  if (!account) {
    return (
      <div
        className="rounded-card-lg p-[22px] flex flex-col gap-3 animate-pulse"
        style={{
          background: "var(--panel)",
          border: "1px solid var(--border)",
          boxShadow: "var(--shadow-sm)",
          minHeight: 220,
        }}
      >
        <div className="h-3 w-24 rounded" style={{ background: "var(--panel-2)" }} />
        <div className="h-12 w-56 rounded" style={{ background: "var(--panel-2)" }} />
        <div className="h-4 w-72 rounded" style={{ background: "var(--panel-2)" }} />
      </div>
    );
  }

  const dayPl = account.equity - account.equity_at_market_open;
  const dayPlPct =
    account.equity_at_market_open > 0 ? dayPl / account.equity_at_market_open : 0;
  const dayUp = dayPl >= 0;
  const allUp = unrealized >= 0;

  return (
    <div
      className="rounded-card-lg p-[22px] flex flex-col gap-3"
      style={{
        background: "var(--panel)",
        border: "1px solid var(--border)",
        boxShadow: "var(--shadow-sm)",
      }}
    >
      <span
        className="text-[12px]"
        style={{ color: "var(--mute)", letterSpacing: "0.02em" }}
      >
        Total balance
      </span>
      <div
        className="font-semibold tabular-nums"
        style={{
          fontSize: "clamp(34px, 5.4vw, 48px)",
          letterSpacing: "-0.028em",
          lineHeight: 1,
        }}
      >
        {money(account.equity)}
      </div>
      <div className="flex gap-3.5 items-baseline flex-wrap">
        <span
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-[12.5px] font-medium tabular-nums"
          style={{
            background: dayUp ? "var(--pos-bg)" : "var(--neg-bg)",
            color: dayUp ? "var(--pos)" : "var(--neg)",
            letterSpacing: "-0.005em",
          }}
        >
          {dayUp ? "↑" : "↓"} {dayUp ? "+" : ""}
          {money(dayPl)} ({pct(dayPlPct)}) today
        </span>
        <span style={{ color: "var(--mute)" }} className="text-[12.5px] tabular-nums">
          All time {allUp ? "+" : ""}
          {money(unrealized)} ({pct(unrealizedPct)})
        </span>
      </div>
      <div className="flex gap-6 mt-1 flex-wrap">
        <div className="flex flex-col">
          <small className="text-[12px]" style={{ color: "var(--mute)" }}>
            Cash
          </small>
          <strong className="font-medium text-[16px] tabular-nums">
            {money(account.cash)}
          </strong>
        </div>
        <div className="flex flex-col">
          <small className="text-[12px]" style={{ color: "var(--mute)" }}>
            Invested
          </small>
          <strong className="font-medium text-[16px] tabular-nums">
            {money(invested)}
          </strong>
        </div>
        <div className="flex flex-col">
          <small className="text-[12px]" style={{ color: "var(--mute)" }}>
            Buying power
          </small>
          <strong className="font-medium text-[16px] tabular-nums">
            {money(account.buying_power)}
          </strong>
        </div>
      </div>
    </div>
  );
}

// ── Hero · Allocation donut ───────────────────────────────────────────────────

// 8 monochrome teal luminance steps (mirrors mock.html's palette).
const DONUT_COLORS = [
  "oklch(38% 0.07 200)",
  "oklch(48% 0.07 200)",
  "oklch(56% 0.07 200)",
  "oklch(64% 0.07 200)",
  "oklch(72% 0.06 200)",
  "oklch(78% 0.05 200)",
  "oklch(84% 0.04 200)",
  "oklch(90% 0.03 200)",
];

function buildArc(
  cx: number,
  cy: number,
  R: number,
  r: number,
  a0: number,
  a1: number,
): string {
  const x1 = cx + R * Math.cos(a0);
  const y1 = cy + R * Math.sin(a0);
  const x2 = cx + R * Math.cos(a1);
  const y2 = cy + R * Math.sin(a1);
  const x3 = cx + r * Math.cos(a1);
  const y3 = cy + r * Math.sin(a1);
  const x4 = cx + r * Math.cos(a0);
  const y4 = cy + r * Math.sin(a0);
  const large = a1 - a0 > Math.PI ? 1 : 0;
  return `M ${x1} ${y1} A ${R} ${R} 0 ${large} 1 ${x2} ${y2} L ${x3} ${y3} A ${r} ${r} 0 ${large} 0 ${x4} ${y4} Z`;
}

function AllocationCard({ positions }: { positions: Position[] | undefined }) {
  const [hovered, setHovered] = useState<string | null>(null);

  const open = (positions || []).filter((p) => p.market_value > 0);
  const total = open.reduce((s, p) => s + p.market_value, 0);

  const slices = useMemo(() => {
    if (total === 0) return [];
    let a = -Math.PI / 2;
    return open.map((p, i) => {
      const sweep = (p.market_value / total) * 2 * Math.PI;
      const a0 = a;
      const a1 = a + sweep;
      a = a1;
      return {
        symbol: p.symbol,
        share: p.market_value / total,
        color: DONUT_COLORS[i % DONUT_COLORS.length],
        d: buildArc(65, 65, 55, 36, a0, a1),
      };
    });
  }, [open, total]);

  return (
    <div
      className="rounded-card-lg p-[22px] flex flex-col gap-3"
      style={{
        background: "var(--panel)",
        border: "1px solid var(--border)",
        boxShadow: "var(--shadow-sm)",
      }}
    >
      <div className="flex items-center justify-between">
        <span
          className="text-[12px]"
          style={{ color: "var(--mute)", letterSpacing: "0.02em" }}
        >
          Allocation
        </span>
        <span className="text-[12px]" style={{ color: "var(--mute)" }}>
          {open.length} symbol{open.length === 1 ? "" : "s"}
        </span>
      </div>

      {open.length === 0 ? (
        <div className="flex items-center justify-center py-10">
          <p className="text-[13px]" style={{ color: "var(--mute)" }}>
            No open positions
          </p>
        </div>
      ) : (
        <div className="flex items-center gap-[18px]">
          <div className="relative shrink-0">
            <svg width={130} height={130} viewBox="0 0 130 130" className="block">
              {slices.map((s) => (
                <path
                  key={s.symbol}
                  d={s.d}
                  fill={s.color}
                  opacity={hovered && hovered !== s.symbol ? 0.35 : 1}
                  style={{ transition: "opacity 0.15s", cursor: "pointer" }}
                  onMouseEnter={() => setHovered(s.symbol)}
                  onMouseLeave={() => setHovered(null)}
                />
              ))}
            </svg>
          </div>
          <div
            className="flex flex-col gap-1 text-[12.5px] flex-1 min-w-0"
            style={{ maxHeight: 130, overflow: "auto" }}
          >
            {slices.map((s) => (
              <div
                key={s.symbol}
                className="flex items-center justify-between gap-2.5"
                onMouseEnter={() => setHovered(s.symbol)}
                onMouseLeave={() => setHovered(null)}
                style={{ opacity: hovered && hovered !== s.symbol ? 0.45 : 1 }}
              >
                <span className="flex items-center gap-1.5 min-w-0">
                  <span
                    className="w-2.5 h-2.5 rounded-sm shrink-0"
                    style={{ background: s.color }}
                  />
                  <strong className="font-semibold truncate">{s.symbol}</strong>
                </span>
                <span
                  className="tabular-nums"
                  style={{ color: "var(--mute)" }}
                >
                  {(s.share * 100).toFixed(1)}%
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Sparkline card (Markets & Watchlist) ─────────────────────────────────────

function SparkCard({
  symbol,
  name,
  price,
  changePct,
  selected,
  onSelect,
  onRemove,
}: {
  symbol: string;
  name: string;
  price: number;
  changePct: number;
  selected: boolean;
  onSelect: () => void;
  onRemove?: () => void;
}) {
  const up = changePct >= 0;
  const stroke = up ? "var(--pos)" : "var(--neg)";
  const path = sparkPath(symbol, changePct);
  return (
    <div
      role="button"
      onClick={onSelect}
      className="group text-left p-[13px_14px_10px] cursor-pointer transition-all relative overflow-hidden bg-panel"
      style={{
        border: `1px solid ${selected ? "var(--accent)" : "var(--border)"}`,
        borderRadius: "var(--r)",
        boxShadow: selected ? "0 0 0 2px var(--accent-bg)" : "none",
        scrollSnapAlign: "start",
      }}
    >
      {onRemove && (
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          aria-label={`Remove ${symbol} from watchlist`}
          className="absolute top-1.5 right-1.5 cursor-pointer border-0 text-[12px] leading-none w-5 h-5 grid place-items-center transition-opacity hover:opacity-100"
          style={{
            background: "var(--panel-2)",
            color: "var(--mute)",
            borderRadius: 4,
            opacity: 0.55,
          }}
        >
          ✕
        </button>
      )}
      <div className="font-semibold text-[15px]">{symbol}</div>
      <div
        className="text-[11px] mt-px truncate h-[14px]"
        style={{ color: "var(--mute)" }}
      >
        {name}
      </div>
      <div className="font-mono text-[16px] font-medium mt-2 tabular-nums">
        {fmtPrice(price)}
      </div>
      <div
        className="font-mono text-[12px] mt-px tabular-nums"
        style={{ color: stroke }}
      >
        {pct(changePct)}
      </div>
      <svg
        height={32}
        viewBox="0 0 100 32"
        preserveAspectRatio="none"
        className="block w-full mt-1.5"
      >
        <path d={path} fill="none" stroke={stroke} strokeWidth={1.5} />
      </svg>
    </div>
  );
}

// ── Markets marquee ───────────────────────────────────────────────────────────
// Auto-scrolling ticker across the top of Discover. Non-interactive on
// purpose — the index symbols are Yahoo Finance (^IXIC, ^DJI, …) and
// Alpaca can't chart them.

const REGION_ORDER: IndexData["region"][] = ["US", "Europe", "Asia"];

function IndexChip({ idx }: { idx: IndexData }) {
  const up = idx.change >= 0;
  const color = up ? "var(--pos)" : "var(--neg)";
  const arrow = up ? "▲" : "▼";
  const hasExt =
    idx.session &&
    idx.session !== "regular" &&
    idx.ext_price != null &&
    idx.ext_change_pct != null;
  const extUp = hasExt && idx.ext_change_pct! >= 0;
  return (
    <span
      className="flex items-center gap-2 px-4 whitespace-nowrap"
      style={{ borderRight: "1px solid var(--hairline)" }}
    >
      <span
        className="text-[11px] font-medium"
        style={{ color: "var(--mute)" }}
      >
        {idx.name}
      </span>
      <span className="text-[13px] font-semibold tabular-nums">
        {fmtPrice(idx.price)}
      </span>
      <span
        className="text-[12px] tabular-nums font-medium"
        style={{ color }}
      >
        {arrow} {pct(idx.change_pct)}
      </span>
      {hasExt && (
        <span
          className="flex items-center gap-1 pl-1"
          style={{ borderLeft: "1px solid var(--hairline)" }}
        >
          <span
            className="text-[10px] uppercase tracking-wide"
            style={{ color: "var(--mute)" }}
          >
            {idx.session}
          </span>
          <span
            className="text-[11px] tabular-nums font-medium"
            style={{ color: extUp ? "var(--pos)" : "var(--neg)" }}
          >
            {fmtPrice(idx.ext_price!)} ({pct(idx.ext_change_pct!)})
          </span>
        </span>
      )}
    </span>
  );
}

function IndicesTicker({ indices }: { indices: IndexData[] }) {
  const sorted = REGION_ORDER.flatMap((r) =>
    indices.filter((i) => i.region === r),
  );
  if (sorted.length === 0) return null;
  return (
    <div
      className="overflow-hidden mb-4"
      style={{
        background: "var(--panel)",
        border: "1px solid var(--border)",
        borderRadius: "var(--r-lg)",
        boxShadow: "var(--shadow-sm)",
      }}
    >
      <div className="flex items-center">
        <span
          className="text-[11px] uppercase font-semibold px-3 py-2 whitespace-nowrap"
          style={{
            color: "var(--mute)",
            letterSpacing: "0.06em",
            borderRight: "1px solid var(--border)",
          }}
        >
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

// ── Cards row (horizontal scroll) ─────────────────────────────────────────────

function CardsRow({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="grid gap-3 pb-3 overflow-x-auto"
      style={{
        gridAutoFlow: "column",
        gridAutoColumns: "minmax(180px, 1fr)",
        scrollSnapType: "x mandatory",
      }}
    >
      {children}
    </div>
  );
}

function SparkCardSkeleton() {
  return (
    <div
      className="animate-pulse p-[13px_14px_10px]"
      style={{
        background: "var(--panel)",
        border: "1px solid var(--border)",
        borderRadius: "var(--r)",
      }}
    >
      <div
        className="h-3 w-12 rounded mb-1.5"
        style={{ background: "var(--panel-2)" }}
      />
      <div
        className="h-2.5 w-20 rounded"
        style={{ background: "var(--panel-2)" }}
      />
      <div
        className="h-4 w-16 rounded mt-2"
        style={{ background: "var(--panel-2)" }}
      />
      <div
        className="h-8 w-full rounded mt-2"
        style={{ background: "var(--panel-2)" }}
      />
    </div>
  );
}

function MoversCardSkeleton() {
  return (
    <div
      className="p-[18px] animate-pulse"
      style={{
        background: "var(--panel)",
        border: "1px solid var(--border)",
        borderRadius: "var(--r-lg)",
      }}
    >
      <div
        className="h-4 w-28 rounded mb-3"
        style={{ background: "var(--panel-2)" }}
      />
      {Array.from({ length: 5 }).map((_, i) => (
        <div
          key={i}
          className="h-7 w-full rounded mt-1.5"
          style={{ background: "var(--panel-2)" }}
        />
      ))}
    </div>
  );
}

function NewsCardSkeleton() {
  return (
    <div
      className="p-[18px] animate-pulse"
      style={{
        background: "var(--panel)",
        border: "1px solid var(--border)",
        borderRadius: "var(--r-lg)",
      }}
    >
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className="flex gap-4 items-start py-3.5"
          style={{ borderTop: i === 0 ? "none" : "1px solid var(--hairline)" }}
        >
          <div
            className="h-3 w-10 rounded shrink-0"
            style={{ background: "var(--panel-2)" }}
          />
          <div className="flex-1 flex flex-col gap-1.5">
            <div
              className="h-2.5 w-16 rounded"
              style={{ background: "var(--panel-2)" }}
            />
            <div
              className="h-4 w-5/6 rounded"
              style={{ background: "var(--panel-2)" }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Movers list (inside a card) ───────────────────────────────────────────────

function MoversCard({
  title,
  movers,
  onSelect,
}: {
  title: string;
  movers: Mover[];
  onSelect: (s: string) => void;
}) {
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
      <div className="flex items-center justify-between mb-2.5">
        <strong className="text-[14px]">{title}</strong>
        <span
          className="text-[12px]"
          style={{ color: "var(--mute)", letterSpacing: "0.02em" }}
        >
          % change
        </span>
      </div>
      <div>
        {movers.map((m, i) => {
          const up = m.percent_change >= 0;
          return (
            <button
              key={m.symbol}
              type="button"
              onClick={() => onSelect(m.symbol)}
              className="w-full text-left grid items-center gap-2.5 py-2 cursor-pointer bg-transparent border-0"
              style={{
                gridTemplateColumns: "32px 1fr auto auto",
                borderTop: i === 0 ? "none" : "1px solid var(--border)",
              }}
            >
              <span
                className="font-mono text-[12px]"
                style={{ color: "var(--mute)" }}
              >
                {String(i + 1).padStart(2, "0")}
              </span>
              <div className="min-w-0">
                <div className="font-semibold text-[14px]">{m.symbol}</div>
              </div>
              <span className="font-mono text-[13px] tabular-nums">
                {money(m.price)}
              </span>
              <span
                className="font-mono text-[13px] tabular-nums text-right min-w-[64px]"
                style={{ color: up ? "var(--pos)" : "var(--neg)" }}
              >
                {pct(m.percent_change)}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── News card (inline list) ───────────────────────────────────────────────────

function NewsCard({ articles }: { articles: MarketNewsArticle[] }) {
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
      <div>
        {articles.length === 0 && (
          <p className="text-[13px]" style={{ color: "var(--mute)" }}>
            No headlines this hour.
          </p>
        )}
        {articles.map((a, i) => (
          <a
            key={`${a.pub_time}-${i}`}
            href={a.link}
            target="_blank"
            rel="noreferrer"
            className="flex gap-4 items-start no-underline"
            style={{
              padding: "14px 0",
              borderTop: i === 0 ? "none" : "1px solid var(--border)",
              color: "var(--text)",
            }}
          >
            <span
              className="font-mono text-[11px] min-w-[60px] pt-px"
              style={{ color: "var(--mute)" }}
            >
              {relTime(a.pub_time)}
            </span>
            <div className="flex-1">
              <div
                className="text-[11px] font-medium uppercase"
                style={{
                  color: "var(--accent-2)",
                  letterSpacing: "0.04em",
                }}
              >
                {a.source}
              </div>
              <div className="text-[15px] mt-0.5">{a.title}</div>
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}

// ── Inline chart card ─────────────────────────────────────────────────────────
// PriceChart owns its own header + TF tabs today; the Calm restyle of those
// internals lands later. Here we just supply the card shell.

function ChartCard({ symbol }: { symbol: string }) {
  return (
    <div
      className="mt-6 p-[20px_24px]"
      style={{
        background: "var(--panel)",
        border: "1px solid var(--border)",
        borderRadius: "var(--r-lg)",
        boxShadow: "var(--shadow-sm)",
      }}
    >
      {symbol ? (
        <PriceChart symbol={symbol} />
      ) : (
        <div
          className="grid place-items-center text-[13px]"
          style={{ color: "var(--mute)", height: 280 }}
        >
          Pick a symbol to chart it.
        </div>
      )}
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
  const positions = usePositions();
  const account = useAccount();
  const indices = useIndices();
  const movers = useMovers(8);
  const news = useMarketNews(8);
  const watchlist = useWatchlist();
  const addToWatchlist = useAddToWatchlist();
  const removeFromWatchlist = useRemoveFromWatchlist();
  const wlSymbols = watchlist.data?.symbols ?? [];
  const snaps = useSnapshots(wlSymbols);
  const marketSummary = useMarketSummary(wlSymbols);
  const [wlInput, setWlInput] = useState("");
  const [adding, setAdding] = useState(false);

  async function submitAddWatchlist(e: React.FormEvent) {
    e.preventDefault();
    const v = wlInput.trim().toUpperCase();
    if (!v || adding) return;
    if (wlSymbols.includes(v)) {
      showToast(`${v} is already on your watchlist`, "info");
      return;
    }
    setAdding(true);
    // Validate with Alpaca first so we never push a 404'd ticker into
    // the watchlist (the backend would still accept it; the symbol
    // would just never load quotes / bars).
    try {
      const asset = await api.getAsset(v);
      if (!asset.tradable) {
        showToast(`${v} is not tradable on Alpaca`, "error");
        setAdding(false);
        return;
      }
    } catch {
      showToast(`${v} not found on Alpaca`, "error");
      setAdding(false);
      return;
    }
    addToWatchlist.mutate(v, {
      onSuccess: () => {
        setWlInput("");
        setAdding(false);
        showToast(`${v} added to watchlist`, "success");
        onSelect(v);
      },
      onError: (err) => {
        setAdding(false);
        showToast(`Couldn't add ${v}: ${(err as Error).message}`, "error");
      },
    });
  }

  function removeWatchlistSymbol(sym: string) {
    removeFromWatchlist.mutate(sym, {
      onSuccess: () => showToast(`${sym} removed from watchlist`, "info"),
      onError: (err) =>
        showToast(`Couldn't remove ${sym}: ${(err as Error).message}`, "error"),
    });
  }

  const invested = (positions.data?.positions || []).reduce(
    (s: number, p: Position) => s + p.market_value,
    0,
  );
  const unrealized = (positions.data?.positions || []).reduce(
    (s: number, p: Position) => s + p.unrealized_pl,
    0,
  );
  const totalCostBasis = (positions.data?.positions || []).reduce(
    (s: number, p: Position) => s + p.cost_basis,
    0,
  );
  const unrealizedPct = totalCostBasis > 0 ? unrealized / totalCostBasis : 0;

  // Quote map drives watchlist sparkline cards.
  const quotes: Record<string, Snapshot> = {};
  (snaps.data?.snapshots || []).forEach((s: Snapshot) => {
    quotes[s.symbol] = s;
  });

  return (
    <div className="max-w-[1280px] mx-auto pt-2">
      {/* Markets marquee — Yahoo Finance indices, non-clickable for charting
         since Alpaca can't serve bars for ^IXIC / ^DJI / etc. */}
      {indices.data && <IndicesTicker indices={indices.data.indices} />}

      {/* Hero row */}
      <div className="grid gap-4 mb-6 grid-cols-1 lg:grid-cols-[1.4fr_1fr]">
        <BalanceCard
          account={account.data}
          invested={invested}
          unrealized={unrealized}
          unrealizedPct={unrealizedPct}
        />
        <AllocationCard positions={positions.data?.positions} />
      </div>

      {/* AI market summary — auto-generated per time window, dismissible */}
      <MarketSummaryCard
        cache={marketSummary.cache}
        isGenerating={marketSummary.isGenerating}
        windowLabel={marketSummary.windowLabel}
        onDismiss={marketSummary.dismiss}
      />

      {/* Watchlist */}
      <SectionHeading
        label="Watchlist"
        ctx={
          watchlist.isPending
            ? "loading…"
            : `${wlSymbols.length} symbol${wlSymbols.length === 1 ? "" : "s"}`
        }
        ctxRight={
          <form
            onSubmit={submitAddWatchlist}
            className="inline-flex items-center gap-1"
          >
            <input
              value={wlInput}
              onChange={(e) => setWlInput(e.target.value.toUpperCase())}
              placeholder="+ SYMBOL"
              aria-label="Add symbol to watchlist"
              className="font-mono text-[11.5px] tabular-nums"
              style={{
                background: "var(--panel-2)",
                border: "1px solid var(--border)",
                borderRadius: 6,
                color: "var(--text)",
                padding: "3px 8px",
                width: 110,
              }}
            />
            <button
              type="submit"
              disabled={!wlInput.trim() || adding}
              className="text-[12px] cursor-pointer"
              style={{
                background: "var(--accent-bg)",
                color: "var(--accent)",
                border: "1px solid var(--accent)",
                borderRadius: 6,
                padding: "3px 8px",
                opacity: wlInput.trim() && !adding ? 1 : 0.5,
              }}
            >
              {adding ? "…" : "Add"}
            </button>
          </form>
        }
      />
      {watchlist.isPending ? (
        <CardsRow>
          {Array.from({ length: 6 }).map((_, i) => (
            <SparkCardSkeleton key={i} />
          ))}
        </CardsRow>
      ) : wlSymbols.length === 0 ? (
        <div
          className="p-5 text-[13px]"
          style={{
            background: "var(--panel)",
            border: "1px solid var(--border)",
            borderRadius: "var(--r)",
            color: "var(--mute)",
          }}
        >
          Your watchlist is empty. Type a ticker above to add one.
        </div>
      ) : (
        <CardsRow>
          {wlSymbols.map((sym) => {
            const q = quotes[sym];
            const last = q?.last_price ?? 0;
            const dayChange =
              q?.prev_close && q?.last_price
                ? (q.last_price - q.prev_close) / q.prev_close
                : 0;
            const pos = (positions.data?.positions || []).find(
              (p: Position) => p.symbol === sym,
            );
            return (
              <SparkCard
                key={sym}
                symbol={sym}
                name={pos ? `${pos.qty} shares` : ""}
                price={last}
                changePct={dayChange}
                selected={sym === selected}
                onSelect={() => onSelect(sym)}
                onRemove={() => removeWatchlistSymbol(sym)}
              />
            );
          })}
        </CardsRow>
      )}

      {/* Inline chart */}
      <ChartCard symbol={selected} />

      {/* Movers */}
      <SectionHeading label="Movers" ctxRight="free IEX feed" />
      {movers.error && <ErrorBanner message={movers.error.message} />}
      {!movers.data && !movers.error && (
        <div className="grid gap-3 grid-cols-1 md:grid-cols-2">
          <MoversCardSkeleton />
          <MoversCardSkeleton />
        </div>
      )}
      {movers.data && (
        <div className="grid gap-3 grid-cols-1 md:grid-cols-2">
          <MoversCard
            title="Top gainers"
            movers={movers.data.gainers}
            onSelect={onSelect}
          />
          <MoversCard
            title="Top losers"
            movers={movers.data.losers}
            onSelect={onSelect}
          />
        </div>
      )}

      {/* News */}
      <SectionHeading label="News" ctx="market headlines" />
      {news.error && <ErrorBanner message={news.error.message} />}
      {!news.data && !news.error && <NewsCardSkeleton />}
      {news.data && <NewsCard articles={news.data.articles} />}
    </div>
  );
}
