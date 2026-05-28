import { useRef } from "react";

import {
  useAddToCryptoWatchlist,
  useAddToWatchlist,
  useBarsBatch,
  useCryptoWatchlist,
  useFxcmDisplayNames,
  useFxcmWatchlistAdd,
  useFxcmWatchlistQuery,
  useFxcmWatchlistRemove,
  useRemoveFromCryptoWatchlist,
  useRemoveFromWatchlist,
  useSnapshots,
  useWatchlist,
} from "../data/hooks";
import { useLiveQuotes } from "../data/useLiveQuotes";
import { useContainerNarrow, useContainerTall } from "../hooks/useContainerNarrow";
import { cfdDigits, fmtCryptoPrice, fmtSpread, pct } from "../lib/format";
import type { Snapshot } from "../types";
import { AssetSearch } from "./AssetSearch";
import { SparkCard, SparkCardSkeleton } from "./discover/SparkCard";
import { coinLabel, fmtPrice } from "./discover/util";

// Width threshold below which we collapse to a tight 2-col grid of dense
// SparkCards. Without this, the auto-fill grid falls to 1-col at ~280px and
// the widget reads as a single tall card per scroll.
const NARROW_W = 280;
// Between narrow and full: keep the sparkline but use a shorter card height.
const COMPACT_W = 420;
const GRID = "repeat(auto-fill, minmax(150px, 1fr))";
const GRID_COMPACT = "repeat(auto-fill, minmax(110px, 1fr))";
const GRID_NARROW = "repeat(2, minmax(0, 1fr))";
// In auto mode, fall back to the row List when the panel is short — even one
// row of cards eats most of the vertical space, so a stack of dense rows
// surfaces more tickers in the same dock.
const SHORT_H = 320;

export type WatchlistMode = "auto" | "cards" | "list";

/**
 * Silo watchlist — live spark cards (or compact rows) over `/api/watchlist`,
 * with add (AssetSearch) and hover-remove. Location-agnostic: takes
 * `assetClass`, the active `selected` symbol for highlighting, an `onSelect`
 * for clicks, and an optional view `mode`. `auto` (default) picks Cards or
 * List from the container's width + height. Reuses the Discover SparkCard
 * + watchlist hooks.
 */
export default function Watchlist({
  assetClass,
  selected,
  onSelect,
  mode = "auto",
  onModeChange,
}: {
  assetClass: "stocks" | "crypto" | "cfd";
  selected?: string;
  onSelect: (symbol: string) => void;
  mode?: WatchlistMode;
  onModeChange?: (m: WatchlistMode) => void;
}) {
  if (assetClass === "cfd") {
    return <CfdWatchlist selected={selected} onSelect={onSelect} />;
  }
  return (
    <AlpacaWatchlist
      assetClass={assetClass}
      selected={selected}
      onSelect={onSelect}
      mode={mode}
      onModeChange={onModeChange}
    />
  );
}

function AlpacaWatchlist({
  assetClass,
  selected,
  onSelect,
  mode = "auto",
  onModeChange,
}: {
  assetClass: "stocks" | "crypto";
  selected?: string;
  onSelect: (symbol: string) => void;
  mode?: WatchlistMode;
  onModeChange?: (m: WatchlistMode) => void;
}) {
  const isCrypto = assetClass === "crypto";
  const stockWl = useWatchlist();
  const cryptoWl = useCryptoWatchlist();
  const wl = isCrypto ? cryptoWl : stockWl;
  const symbols = wl.data?.symbols ?? [];

  const addStock = useAddToWatchlist();
  const removeStock = useRemoveFromWatchlist();
  const addCrypto = useAddToCryptoWatchlist();
  const removeCrypto = useRemoveFromCryptoWatchlist();
  const add = isCrypto ? addCrypto : addStock;
  const remove = isCrypto ? removeCrypto : removeStock;

  const snaps = useSnapshots(symbols);
  const { quotes: live } = useLiveQuotes(symbols);
  const barsBatch = useBarsBatch(symbols);
  const snapMap: Record<string, Snapshot> = {};
  for (const s of snaps.data?.snapshots ?? []) snapMap[s.symbol] = s;
  const barsMap = barsBatch.data?.bars ?? {};

  const ref = useRef<HTMLDivElement>(null);
  const narrow = useContainerNarrow(ref, NARROW_W);
  const compact = useContainerNarrow(ref, COMPACT_W) && !narrow;
  const tall = useContainerTall(ref, SHORT_H);
  const resolvedMode: "cards" | "list" =
    mode === "auto" ? (!tall || narrow ? "list" : "cards") : mode;
  const gridCols = narrow ? GRID_NARROW : compact ? GRID_COMPACT : GRID;

  return (
    <div ref={ref} className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <div className="flex-1 min-w-0">
          <AssetSearch
            assetClass={isCrypto ? "crypto" : "us_equity"}
            align="left"
            fluid
            disabled={add.isPending}
            onChoose={(v) => add.mutate(v, { onSuccess: () => onSelect(v) })}
          />
        </div>
        {onModeChange && <ModeToggle mode={mode} onChange={onModeChange} />}
      </div>

      {wl.isPending ? (
        resolvedMode === "list" ? (
          <div className="flex flex-col gap-1">
            {Array.from({ length: 6 }).map((_, i) => (
              <RowSkeleton key={i} />
            ))}
          </div>
        ) : (
          <div className="grid gap-2" style={{ gridTemplateColumns: gridCols }}>
            {Array.from({ length: 6 }).map((_, i) => (
              <SparkCardSkeleton key={i} />
            ))}
          </div>
        )
      ) : symbols.length === 0 ? (
        <div className="text-[12px] p-2" style={{ color: "var(--mute)" }}>
          {isCrypto
            ? "No pairs. Add one above (e.g. BTC/USD)."
            : "No symbols. Add one above."}
        </div>
      ) : resolvedMode === "list" ? (
        <div className="flex flex-col gap-1">
          {symbols.map((sym) => {
            const snap = snapMap[sym];
            const price = live[sym]?.mid ?? snap?.last_price ?? 0;
            const prev = snap?.prev_close ?? 0;
            const changePct = prev ? (price - prev) / prev : 0;
            return (
              <WatchlistRow
                key={sym}
                symbol={isCrypto ? coinLabel(sym) : sym}
                price={price}
                changePct={changePct}
                selected={sym === selected}
                onSelect={() => onSelect(sym)}
                onRemove={() => remove.mutate(sym)}
                isCrypto={isCrypto}
              />
            );
          })}
        </div>
      ) : (
        <div className="grid gap-2" style={{ gridTemplateColumns: gridCols }}>
          {symbols.map((sym) => {
            const snap = snapMap[sym];
            const price = live[sym]?.mid ?? snap?.last_price ?? 0;
            const prev = snap?.prev_close ?? 0;
            const changePct = prev ? (price - prev) / prev : 0;
            return (
              <SparkCard
                key={sym}
                symbol={isCrypto ? coinLabel(sym) : sym}
                name=""
                price={price}
                changePct={changePct}
                selected={sym === selected}
                onSelect={() => onSelect(sym)}
                onRemove={() => remove.mutate(sym)}
                isCrypto={isCrypto}
                dense={narrow}
                compact={compact}
                closes={barsMap[sym]?.map((b) => b.close)}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

// CFD silo watchlist — the FXCM Endpoints-suite list, enriched with live
// bid/ask by the 3 s poll. List-only for v1: the SparkCard grid needs
// per-instrument daily bars (deferred — see docs/cfd-workspace-integration.md).
// Add via the FXCM instrument search (DB-backed); hover-✕ removes. Shows the
// mid price (per-instrument `digits`) and the live spread in points.
function CfdWatchlist({
  selected,
  onSelect,
}: {
  selected?: string;
  onSelect: (symbol: string) => void;
}) {
  const wl = useFxcmWatchlistQuery(true);
  const add = useFxcmWatchlistAdd();
  const remove = useFxcmWatchlistRemove();
  const dn = useFxcmDisplayNames();
  const rows = wl.data ?? [];

  return (
    <div className="flex flex-col gap-2">
      <AssetSearch
        assetClass="us_equity"
        source="fxcm"
        align="left"
        fluid
        disabled={add.isPending}
        onChoose={(v) => add.mutate(v, { onSuccess: () => onSelect(v) })}
      />

      {wl.isPending ? (
        <div className="flex flex-col gap-1">
          {Array.from({ length: 6 }).map((_, i) => (
            <RowSkeleton key={i} />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="text-[12px] p-2" style={{ color: "var(--mute)" }}>
          No instruments. Add one above (e.g. EUR/USD).
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          {rows.map((p) => {
            const bid = p.bid ?? 0;
            const ask = p.ask ?? 0;
            const mid = bid && ask ? (bid + ask) / 2 : bid || ask;
            const digits = p.digits ?? cfdDigits(p.instrument);
            return (
              <CfdWatchlistRow
                key={p.instrument}
                label={dn(p.instrument)}
                price={mid}
                digits={digits}
                spread={fmtSpread(bid, ask, p.point_size)}
                selected={p.instrument === selected}
                onSelect={() => onSelect(p.instrument)}
                onRemove={() => remove.mutate(p.instrument)}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

function CfdWatchlistRow({
  label,
  price,
  digits,
  spread,
  selected,
  onSelect,
  onRemove,
}: {
  label: string;
  price: number;
  digits: number;
  spread: string;
  selected: boolean;
  onSelect: () => void;
  onRemove?: () => void;
}) {
  return (
    <div
      role="button"
      onClick={onSelect}
      className="group relative cursor-pointer flex items-center justify-between bg-panel"
      style={{
        padding: "6px 10px",
        border: `1px solid ${selected ? "var(--accent)" : "var(--border)"}`,
        borderRadius: "var(--r)",
        boxShadow: selected ? "0 0 0 2px var(--accent-bg)" : "none",
        minHeight: 30,
      }}
    >
      <div
        className="font-semibold font-mono tabular-nums truncate"
        style={{ fontSize: 12, letterSpacing: "-0.01em" }}
      >
        {label}
      </div>
      <div className="flex items-baseline gap-3 shrink-0">
        <span
          className="font-mono tabular-nums"
          style={{ fontSize: 12, color: "var(--text)" }}
        >
          {price ? price.toFixed(digits) : "—"}
        </span>
        <span
          className="font-mono tabular-nums text-right"
          style={{ fontSize: 11, color: "var(--mute)", minWidth: 52 }}
        >
          {spread}
        </span>
      </div>
      {onRemove && (
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          aria-label={`Remove ${label} from watchlist`}
          className="absolute top-1/2 -translate-y-1/2 right-1 cursor-pointer border-0 text-[11px] leading-none w-5 h-5 grid place-items-center opacity-0 group-hover:opacity-100 transition-opacity"
          style={{
            background: "var(--panel-2)",
            color: "var(--mute)",
            borderRadius: 4,
          }}
        >
          ✕
        </button>
      )}
    </div>
  );
}

function WatchlistRow({
  symbol,
  price,
  changePct,
  selected,
  onSelect,
  onRemove,
  isCrypto,
}: {
  symbol: string;
  price: number;
  changePct: number;
  selected: boolean;
  onSelect: () => void;
  onRemove?: () => void;
  isCrypto?: boolean;
}) {
  const up = changePct >= 0;
  const stroke = up ? "var(--pos)" : "var(--neg)";
  return (
    <div
      role="button"
      onClick={onSelect}
      className="group relative cursor-pointer flex items-center justify-between bg-panel"
      style={{
        padding: "6px 10px",
        border: `1px solid ${selected ? "var(--accent)" : "var(--border)"}`,
        borderRadius: "var(--r)",
        boxShadow: selected ? "0 0 0 2px var(--accent-bg)" : "none",
        minHeight: 30,
      }}
    >
      <div
        className="font-semibold font-mono tabular-nums truncate"
        style={{ fontSize: 12, letterSpacing: "-0.01em" }}
      >
        {symbol}
      </div>
      <div className="flex items-baseline gap-3 shrink-0">
        <span
          className="font-mono tabular-nums"
          style={{ fontSize: 12, color: "var(--text)" }}
        >
          {isCrypto ? fmtCryptoPrice(price) : fmtPrice(price)}
        </span>
        <span
          className="font-mono tabular-nums text-right"
          style={{ fontSize: 11, color: stroke, minWidth: 52 }}
        >
          {pct(changePct)}
        </span>
      </div>
      {onRemove && (
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          aria-label={`Remove ${symbol} from watchlist`}
          className="absolute top-1/2 -translate-y-1/2 right-1 cursor-pointer border-0 text-[11px] leading-none w-5 h-5 grid place-items-center opacity-0 group-hover:opacity-100 transition-opacity"
          style={{
            background: "var(--panel-2)",
            color: "var(--mute)",
            borderRadius: 4,
          }}
        >
          ✕
        </button>
      )}
    </div>
  );
}

function RowSkeleton() {
  return (
    <div
      className="animate-pulse"
      style={{
        height: 30,
        background: "var(--panel)",
        border: "1px solid var(--border)",
        borderRadius: "var(--r)",
      }}
    />
  );
}

function ModeToggle({
  mode,
  onChange,
}: {
  mode: WatchlistMode;
  onChange: (m: WatchlistMode) => void;
}) {
  // Three states cycled with a single tap: auto → cards → list → auto.
  // The dot above the active glyph signals which side wins right now;
  // a hollow dot means "auto" and the resolved side is whichever the
  // panel size has chosen.
  const opts: { id: WatchlistMode; label: string; glyph: string }[] = [
    { id: "auto", label: "Auto", glyph: "A" },
    { id: "cards", label: "Cards", glyph: "▦" },
    { id: "list", label: "List", glyph: "≡" },
  ];
  return (
    <div
      className="flex items-center shrink-0"
      style={{
        border: "1px solid var(--border)",
        borderRadius: "var(--r)",
        padding: 1,
        gap: 1,
      }}
    >
      {opts.map((o) => {
        const active = mode === o.id;
        return (
          <button
            key={o.id}
            type="button"
            title={`View: ${o.label}`}
            aria-label={`Watchlist view: ${o.label}`}
            onClick={() => onChange(o.id)}
            className="cursor-pointer border-0 leading-none"
            style={{
              fontSize: 11,
              padding: "3px 6px",
              borderRadius: 3,
              background: active ? "var(--panel-2)" : "transparent",
              color: active ? "var(--text)" : "var(--mute)",
              fontFamily:
                o.id === "auto"
                  ? "var(--font-mono, ui-monospace, monospace)"
                  : "inherit",
              fontWeight: o.id === "auto" ? 600 : 400,
            }}
          >
            {o.glyph}
          </button>
        );
      })}
    </div>
  );
}
