import { useMemo, useState } from "react";

import { useCloseAllPositions, useFxcmPositions, usePositions } from "../data/hooks";
import { useMobile } from "../hooks/useMobile";
import { isCryptoPosition } from "../lib/asset-class";
import { fmtCryptoPrice } from "../lib/format";
import { showToast } from "../lib/toast";
import type { FxcmPosition, Position } from "../types";
import ErrorBanner from "./ErrorBanner";
import ClosePositionCard from "./trade/ClosePositionCard";
import ConfirmCard from "./trade/ConfirmCard";
import FxcmClosePositionCard from "./trade/FxcmClosePositionCard";
import OrderSheet from "./trade/OrderSheet";

const money = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD" });
const pct = (n: number) => `${(n * 100).toFixed(2)}%`;
const signed = (n: number) => (n >= 0 ? "var(--pos)" : "var(--neg)");

const TH =
  "px-2 py-1 text-right font-medium text-[11px] uppercase tracking-wide text-mute border-b border-border whitespace-nowrap";
const TD = "px-2 py-1 text-right border-b border-hairline whitespace-nowrap";
const TD_SKEL = "px-2 py-1 border-b border-hairline";

function SkeletonRow({ cols }: { cols: number }) {
  return (
    <tr>
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className={TD_SKEL}>
          <div
            className="h-3 rounded animate-pulse"
            style={{ background: "var(--panel-2)" }}
          />
        </td>
      ))}
    </tr>
  );
}

function SkeletonCard({ bare = false }: { bare?: boolean }) {
  return (
    <div
      className="p-[14px_18px] animate-pulse"
      style={{
        background: bare ? "transparent" : "var(--panel)",
        border: bare ? "none" : "1px solid var(--border)",
        borderBottom: bare ? "1px solid var(--hairline)" : undefined,
        borderRadius: bare ? 0 : "var(--r)",
      }}
    >
      <div
        className="h-4 w-1/3 rounded"
        style={{ background: "var(--panel-2)" }}
      />
    </div>
  );
}

function StripRow({
  p,
  onSelect,
  onCloseClick,
  bare = false,
}: {
  p: Position;
  onSelect?: (s: string) => void;
  onCloseClick: (p: Position) => void;
  bare?: boolean;
}) {
  const dayUp = p.change_today >= 0;
  const plUp = p.unrealized_pl >= 0;
  return (
    <div
      role={onSelect ? "button" : undefined}
      onClick={onSelect ? () => onSelect(p.symbol) : undefined}
      className="grid items-center gap-3 p-[14px_18px] transition-colors"
      style={{
        gridTemplateColumns: "1fr 80px 1fr 1fr 1fr auto",
        background: bare ? "transparent" : "var(--panel)",
        border: bare ? "none" : "1px solid var(--border)",
        borderBottom: bare ? "1px solid var(--hairline)" : undefined,
        borderRadius: bare ? 0 : "var(--r)",
        cursor: onSelect ? "pointer" : "default",
      }}
    >
      <div className="flex flex-col min-w-0">
        <span className="font-semibold">{p.symbol}</span>
        <span
          className="text-[11px]"
          style={{ color: "var(--mute)" }}
        >
          {p.side?.toLowerCase().includes("short") ? "SHORT" : "Long"}
        </span>
      </div>
      <span
        className="font-mono text-[13px] tabular-nums"
        style={{ color: "var(--text-2)" }}
      >
        {p.qty} {isCryptoPosition(p) ? "units" : "shares"}
      </span>
      <div className="text-right">
        <div className="font-mono text-[14px] tabular-nums">
          {isCryptoPosition(p) ? fmtCryptoPrice(p.current_price) : money(p.current_price)}
        </div>
        <div
          className="font-mono text-[11px] tabular-nums"
          style={{ color: signed(p.change_today) }}
        >
          {dayUp ? "+" : ""}
          {pct(p.change_today)}
        </div>
      </div>
      <div className="text-right">
        <div className="font-mono text-[14px] tabular-nums">
          {money(p.market_value)}
        </div>
        <div
          className="font-mono text-[11px] tabular-nums"
          style={{ color: "var(--mute)" }}
        >
          avg {isCryptoPosition(p) ? fmtCryptoPrice(p.avg_entry_price) : money(p.avg_entry_price)}
        </div>
      </div>
      <div className="text-right">
        <div
          className="font-mono text-[14px] tabular-nums"
          style={{ color: signed(p.unrealized_pl) }}
        >
          {plUp ? "+" : ""}
          {money(p.unrealized_pl)}
        </div>
        <div
          className="font-mono text-[11px] tabular-nums"
          style={{ color: signed(p.unrealized_pl) }}
        >
          {plUp ? "+" : ""}
          {pct(p.unrealized_plpc)}
        </div>
      </div>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onCloseClick(p);
        }}
        className="btn btn-mini"
      >
        Close
      </button>
    </div>
  );
}

// Stacked card variant used at ≤640px in place of the 6-col strip grid.
function StripRowMobile({
  p,
  onSelect,
  onCloseClick,
  bare = false,
  compact = false,
}: {
  p: Position;
  onSelect?: (s: string) => void;
  onCloseClick: (p: Position) => void;
  bare?: boolean;
  // Tighter padding + gap for tall+narrow docks where many rows compete
  // for vertical space.
  compact?: boolean;
}) {
  const dayUp = p.change_today >= 0;
  const plUp = p.unrealized_pl >= 0;
  return (
    <div
      role={onSelect ? "button" : undefined}
      onClick={onSelect ? () => onSelect(p.symbol) : undefined}
      style={{
        background: bare ? "transparent" : "var(--panel)",
        border: bare ? "none" : "1px solid var(--border)",
        borderBottom: bare ? "1px solid var(--hairline)" : undefined,
        borderRadius: bare ? 0 : "var(--mob-card-radius)",
        padding: compact ? "8px 12px" : "14px 16px",
        boxShadow: bare ? "none" : "var(--shadow-sm)",
        display: "flex",
        flexDirection: "column",
        gap: compact ? 6 : 10,
        cursor: onSelect ? "pointer" : "default",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
        }}
      >
        <div>
          <span style={{ fontSize: 16, fontWeight: 700 }}>{p.symbol}</span>
          <span
            className="tabular-nums"
            style={{
              fontSize: 11,
              marginLeft: 8,
              color: "var(--mute)",
              fontFamily: "var(--font-mono)",
            }}
          >
            {p.qty} {isCryptoPosition(p) ? "units" : "sh"}
          </span>
          {p.side?.toLowerCase().includes("short") && (
            <span style={{ fontSize: 10, marginLeft: 6, color: "var(--mute)" }}>
              SHORT
            </span>
          )}
        </div>
        <div
          className="tabular-nums font-mono"
          style={{ fontSize: 14, fontWeight: 600 }}
        >
          {money(p.market_value)}
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
        <StripStat
          k="Mark"
          v={isCryptoPosition(p) ? fmtCryptoPrice(p.current_price) : money(p.current_price)}
          sub={pct(p.change_today)}
          tone={dayUp ? "pos" : "neg"}
        />
        <StripStat k="Avg" v={isCryptoPosition(p) ? fmtCryptoPrice(p.avg_entry_price) : money(p.avg_entry_price)} sub="cost" />
        <StripStat
          k="P/L"
          v={(plUp ? "+" : "") + money(p.unrealized_pl)}
          sub={pct(p.unrealized_plpc)}
          tone={plUp ? "pos" : "neg"}
        />
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onCloseClick(p);
          }}
          style={{
            minHeight: "var(--mob-tap)",
            padding: "6px 16px",
            background: "var(--panel-2)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            fontSize: 12.5,
            fontWeight: 500,
          }}
        >
          Close
        </button>
      </div>
    </div>
  );
}

function StripStat({
  k,
  v,
  sub,
  tone,
}: {
  k: string;
  v: string;
  sub: string;
  tone?: "pos" | "neg";
}) {
  const valColor =
    tone === "pos" ? "var(--pos)" : tone === "neg" ? "var(--neg)" : "var(--text)";
  const subColor =
    tone === "pos" ? "var(--pos)" : tone === "neg" ? "var(--neg)" : "var(--mute)";
  return (
    <div>
      <div
        style={{
          fontSize: 10.5,
          color: "var(--mute)",
          textTransform: "uppercase",
          letterSpacing: "0.02em",
        }}
      >
        {k}
      </div>
      <div
        className="font-mono tabular-nums"
        style={{ fontSize: 13, fontWeight: 600, color: valColor }}
      >
        {v}
      </div>
      <div className="font-mono" style={{ fontSize: 10.5, color: subColor }}>
        {sub}
      </div>
    </div>
  );
}

export default function Positions({
  variant = "strip",
  onSelect,
  assetClass,
  symbol,
  dense = false,
  compact = false,
  bare = false,
}: {
  variant?: "strip" | "table";
  onSelect?: (symbol: string) => void;
  assetClass?: "stocks" | "crypto" | "forex";
  symbol?: string;
  dense?: boolean;
  // Only meaningful with `dense`/mobile (i.e. card layout). Tightens row
  // padding + gap for tall-but-narrow Workspace docks.
  compact?: boolean;
  bare?: boolean;
} = {}) {
  if (assetClass === "forex") {
    return (
      <ForexPositions
        variant={variant}
        onSelect={onSelect}
        symbol={symbol}
        dense={dense}
        compact={compact}
        bare={bare}
      />
    );
  }
  return (
    <AlpacaPositions
      variant={variant}
      onSelect={onSelect}
      assetClass={assetClass}
      symbol={symbol}
      dense={dense}
      compact={compact}
      bare={bare}
    />
  );
}

function AlpacaPositions({
  variant = "strip",
  onSelect,
  assetClass,
  symbol,
  dense = false,
  compact = false,
  bare = false,
}: {
  variant?: "strip" | "table";
  onSelect?: (symbol: string) => void;
  assetClass?: "stocks" | "crypto";
  symbol?: string;
  dense?: boolean;
  compact?: boolean;
  bare?: boolean;
}) {
  const { data, error, isPending } = usePositions();
  const closeAll = useCloseAllPositions();
  const rows = data?.positions.filter((p: Position) => {
    if (assetClass) {
      const crypto = isCryptoPosition(p);
      if (assetClass === "crypto" ? !crypto : crypto) return false;
    }
    if (symbol && p.symbol.toUpperCase() !== symbol.toUpperCase()) return false;
    return true;
  });

  // Both cards open from the strip variant. closingPos drives the
  // ClosePositionCard; customizingPos drives the follow-on OrderSheet
  // pre-filled at side=sell, qty=position.qty.
  const [closingPos, setClosingPos] = useState<Position | null>(null);
  const [customizingPos, setCustomizingPos] = useState<Position | null>(null);
  const [confirmCloseAll, setConfirmCloseAll] = useState(false);
  const isMobile = useMobile();

  if (variant === "strip") {
    const Row = isMobile || dense ? StripRowMobile : StripRow;
    return (
      <div className={bare ? "flex flex-col" : "flex flex-col gap-2"}>
        {error && <ErrorBanner message={error.message} />}
        {closeAll.error && (
          <ErrorBanner message={(closeAll.error as Error).message} />
        )}
        {isPending && (
          <>
            <SkeletonCard bare={bare} />
            <SkeletonCard bare={bare} />
            <SkeletonCard bare={bare} />
          </>
        )}
        {!isPending && rows && rows.length === 0 && (
          <div
            className="p-5 text-[13px]"
            style={{
              background: bare ? "transparent" : "var(--panel)",
              border: bare ? "none" : "1px solid var(--border)",
              borderRadius: bare ? 0 : "var(--r)",
              color: "var(--mute)",
            }}
          >
            No open positions — use the order ticket to enter one.
          </div>
        )}
        {!isPending &&
          rows &&
          rows.map((p) => (
            <Row
              key={p.symbol}
              p={p}
              onSelect={onSelect}
              onCloseClick={setClosingPos}
              bare={bare}
              compact={compact}
            />
          ))}
        {rows && rows.length > 1 && (
          <button
            type="button"
            disabled={closeAll.isPending}
            onClick={() => setConfirmCloseAll(true)}
            className="self-end btn btn-mini mt-1"
          >
            Close all
          </button>
        )}

        {closingPos && (
          <ClosePositionCard
            open
            position={closingPos}
            onClose={() => setClosingPos(null)}
            onCustomize={() => setCustomizingPos(closingPos)}
          />
        )}
        {customizingPos && (
          <OrderSheet
            open
            symbol={customizingPos.symbol}
            defaultSide="sell"
            defaultQty={customizingPos.qty}
            onClose={() => setCustomizingPos(null)}
          />
        )}
        {confirmCloseAll && (
          <ConfirmCard
            title="Close all open positions?"
            body={`This will submit a market sell for each of your ${rows?.length ?? 0} open positions.`}
            confirmLabel="Close all positions"
            destructive
            pending={closeAll.isPending}
            onConfirm={() => {
              closeAll.mutate(undefined, {
                onSuccess: () => {
                  setConfirmCloseAll(false);
                  showToast("All positions: sell submitted", "success");
                },
                onError: (e) =>
                  showToast(
                    `Couldn't close all: ${(e as Error).message}`,
                    "error",
                  ),
              });
            }}
            onCancel={() => setConfirmCloseAll(false)}
          />
        )}
      </div>
    );
  }

  // ── Compact table (Chart blotter) ──
  return (
    <div className="bg-panel border border-border rounded-card p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[13px] uppercase tracking-wide text-mute">
          Open Positions
        </span>
        {rows && rows.length > 0 && (
          <button
            className="btn btn-mini"
            type="button"
            disabled={closeAll.isPending}
            onClick={() => setConfirmCloseAll(true)}
          >
            close all
          </button>
        )}
      </div>
      {error && <ErrorBanner message={error.message} />}
      {!isPending && rows && rows.length === 0 && (
        <div className="text-xs text-mute">No open positions.</div>
      )}
      {(isPending || (rows && rows.length > 0)) && (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[13px] tabular-nums font-mono">
            <thead>
              <tr>
                <th className={`${TH} text-left`}>Symbol</th>
                <th className={TH}>Qty</th>
                <th className={TH}>Avg</th>
                <th className={TH}>Mark</th>
                <th className={TH}>Day</th>
                <th className={TH}>Value</th>
                <th className={TH}>Unreal P/L</th>
                <th className={`${TH} text-center`}></th>
              </tr>
            </thead>
            <tbody>
              {isPending && (
                <>
                  <SkeletonRow cols={8} />
                  <SkeletonRow cols={8} />
                  <SkeletonRow cols={8} />
                </>
              )}
              {!isPending &&
                rows &&
                rows.map((p) => {
                  const short = p.side?.toLowerCase().includes("short");
                  return (
                    <tr
                      key={p.symbol}
                      className="hover:bg-panel-2 cursor-pointer"
                      onClick={onSelect ? () => onSelect(p.symbol) : undefined}
                    >
                      <td className={`${TD} text-left font-sans`}>
                        <span className="text-text font-semibold">
                          {p.symbol}
                        </span>
                        {short && <span className="text-mute"> SHORT</span>}
                      </td>
                      <td className={TD}>{p.qty}</td>
                      <td className={TD}>{money(p.avg_entry_price)}</td>
                      <td className={TD}>{money(p.current_price)}</td>
                      <td className={TD} style={{ color: signed(p.change_today) }}>
                        {p.change_today >= 0 ? "+" : ""}
                        {pct(p.change_today)}
                      </td>
                      <td className={TD}>{money(p.market_value)}</td>
                      <td
                        className={TD}
                        style={{ color: signed(p.unrealized_pl) }}
                      >
                        {p.unrealized_pl >= 0 ? "+" : ""}
                        {money(p.unrealized_pl)} ({pct(p.unrealized_plpc)})
                      </td>
                      <td className={`${TD} text-center font-sans`}>
                        <button
                          className="btn btn-mini"
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setClosingPos(p);
                          }}
                        >
                          close
                        </button>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      )}

      {closingPos && (
        <ClosePositionCard
          open
          position={closingPos}
          onClose={() => setClosingPos(null)}
          onCustomize={() => setCustomizingPos(closingPos)}
        />
      )}
      {customizingPos && (
        <OrderSheet
          open
          symbol={customizingPos.symbol}
          defaultSide="sell"
          defaultQty={customizingPos.qty}
          onClose={() => setCustomizingPos(null)}
        />
      )}
      {confirmCloseAll && (
        <ConfirmCard
          title="Close all open positions?"
          body={`This will submit a market sell for each of your ${rows?.length ?? 0} open positions.`}
          confirmLabel="Close all positions"
          destructive
          pending={closeAll.isPending}
          onConfirm={() => {
            closeAll.mutate(undefined, {
              onSuccess: () => {
                setConfirmCloseAll(false);
                showToast("All positions: sell submitted", "success");
              },
              onError: (e) =>
                showToast(
                  `Couldn't close all: ${(e as Error).message}`,
                  "error",
                ),
            });
          }}
          onCancel={() => setConfirmCloseAll(false)}
        />
      )}
    </div>
  );
}

// ── Forex (FXCM) ────────────────────────────────────────────────────────────
// Netted per-instrument view: aggregate raw per-trade rows from
// /api/fxcm/positions into single rows that mirror Alpaca's layout.

interface NettedFxcmRow {
  instrument: string;
  side: "Long" | "Short";
  absQty: number;
  netQty: number; // signed
  avgOpen: number;
  mark: number;
  livePl: number;
  usedMargin: number;
  digits: number;
  tradeIds: string[];
  tradeAmounts: number[];
}

// Per-type digit defaults; FXCM mixes forex (5/3), metals (4), indices (1),
// stock-CFDs (2). Bridge sends `digits` per row when it can — these are the
// fallback when it doesn't.
function defaultDigits(instrument: string): number {
  if (/\.[a-z]{2,3}$/i.test(instrument)) return 2; // stock CFD (e.g. RBLX.us)
  if (instrument.includes("JPY")) return 3;
  if (/^XA[GU]\//.test(instrument)) return 4; // XAU/USD, XAG/USD
  if (instrument.includes("/")) return 5; // standard FX pair
  return 1; // index
}

function netFxcmPositions(rows: FxcmPosition[]): NettedFxcmRow[] {
  const groups = new Map<string, FxcmPosition[]>();
  for (const r of rows) {
    const k = String(r.instrument ?? "");
    if (!k) continue;
    const arr = groups.get(k) ?? [];
    arr.push(r);
    groups.set(k, arr);
  }

  const out: NettedFxcmRow[] = [];
  for (const [instrument, trades] of groups) {
    let buyQty = 0;
    let sellQty = 0;
    let weightedOpenNum = 0;
    let weightedOpenDen = 0;
    let livePlSum = 0;
    let plFallback = 0;
    let livePlComplete = true;
    let usedMargin = 0;
    let markPick: number | undefined;
    let digits: number | undefined;
    const tradeIds: string[] = [];
    const tradeAmounts: number[] = [];

    for (const t of trades) {
      const amt = Math.abs(Number(t.amount ?? 0));
      const isBuy = String(t.buy_sell ?? "B").toUpperCase() === "B";
      if (isBuy) buyQty += amt;
      else sellQty += amt;

      const open = Number(t.open_rate ?? (t as { open?: number }).open ?? 0);
      if (open > 0 && amt > 0) {
        weightedOpenNum += amt * open;
        weightedOpenDen += amt;
      }

      const close = Number((t as { close_rate?: number }).close_rate ?? (t as { close?: number }).close ?? 0);
      const mid = (t as { mid?: number }).mid;
      if (markPick == null) {
        if (typeof mid === "number") markPick = mid;
        else if (open > 0 && close > 0) markPick = (open + close) / 2;
        else if (close > 0) markPick = close;
      }

      const lp = (t as { live_pl?: number }).live_pl;
      if (typeof lp === "number") livePlSum += lp;
      else livePlComplete = false;

      const pl = Number(t.pl ?? t.gross_pl ?? 0);
      plFallback += pl;

      usedMargin += Number((t as { used_margin?: number; market_value?: number }).used_margin ??
        (t as { market_value?: number }).market_value ?? 0);

      if (digits == null && typeof (t as { digits?: number }).digits === "number") {
        digits = (t as { digits?: number }).digits;
      }

      const tid = t.trade_id != null ? String(t.trade_id) : "";
      if (tid) {
        tradeIds.push(tid);
        tradeAmounts.push(amt);
      }
    }

    const netQty = buyQty - sellQty;
    const absQty = Math.abs(netQty);
    if (absQty < 1) continue; // fully-hedged → render nothing

    out.push({
      instrument,
      side: netQty >= 0 ? "Long" : "Short",
      absQty,
      netQty,
      avgOpen: weightedOpenDen > 0 ? weightedOpenNum / weightedOpenDen : 0,
      mark: markPick ?? 0,
      livePl: livePlComplete ? livePlSum : plFallback,
      usedMargin,
      digits: digits ?? defaultDigits(instrument),
      tradeIds,
      tradeAmounts,
    });
  }
  return out;
}

function ForexPositions({
  variant,
  onSelect,
  symbol,
  dense,
  compact,
  bare,
}: {
  variant: "strip" | "table";
  onSelect?: (symbol: string) => void;
  symbol?: string;
  dense: boolean;
  compact: boolean;
  bare: boolean;
}) {
  const { data, error, isPending } = useFxcmPositions(true);
  const isMobile = useMobile();
  const [closing, setClosing] = useState<NettedFxcmRow | null>(null);

  const rows = useMemo(() => {
    const netted = netFxcmPositions(data ?? []);
    return symbol
      ? netted.filter((r) => r.instrument.toUpperCase() === symbol.toUpperCase())
      : netted;
  }, [data, symbol]);

  const useCards = isMobile || dense;

  const closeCard = closing && (
    <FxcmClosePositionCard
      instrument={closing.instrument}
      side={closing.side}
      netQty={closing.absQty}
      mark={closing.mark || undefined}
      livePl={closing.livePl}
      tradeIds={closing.tradeIds}
      tradeAmounts={closing.tradeAmounts}
      digits={closing.digits}
      onClose={() => setClosing(null)}
    />
  );

  if (variant === "strip") {
    return (
      <div className={bare ? "flex flex-col" : "flex flex-col gap-2"}>
        {error && <ErrorBanner message={error.message} />}
        {isPending && (
          <>
            <SkeletonCard bare={bare} />
            <SkeletonCard bare={bare} />
          </>
        )}
        {!isPending && rows.length === 0 && (
          <div
            className="p-5 text-[13px]"
            style={{
              background: bare ? "transparent" : "var(--panel)",
              border: bare ? "none" : "1px solid var(--border)",
              borderRadius: bare ? 0 : "var(--r)",
              color: "var(--mute)",
            }}
          >
            No open forex positions.
          </div>
        )}
        {!isPending &&
          rows.map((r) =>
            useCards ? (
              <FxcmStripCard
                key={r.instrument}
                row={r}
                onSelect={onSelect}
                onCloseClick={setClosing}
                bare={bare}
                compact={compact}
              />
            ) : (
              <FxcmStripRow
                key={r.instrument}
                row={r}
                onSelect={onSelect}
                onCloseClick={setClosing}
                bare={bare}
              />
            ),
          )}
        {closeCard}
      </div>
    );
  }

  return (
    <div className="bg-panel border border-border rounded-card p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[13px] uppercase tracking-wide text-mute">
          Open Positions
        </span>
      </div>
      {error && <ErrorBanner message={error.message} />}
      {!isPending && rows.length === 0 && (
        <div className="text-xs text-mute">No open positions.</div>
      )}
      {(isPending || rows.length > 0) && (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[13px] tabular-nums font-mono">
            <thead>
              <tr>
                <th className={`${TH} text-left`}>Instrument</th>
                <th className={TH}>Side</th>
                <th className={TH}>Qty</th>
                <th className={TH}>Open</th>
                <th className={TH}>Mark</th>
                <th className={TH}>P/L</th>
                <th className={TH}>Margin</th>
                <th className={`${TH} text-center`}></th>
              </tr>
            </thead>
            <tbody>
              {isPending && (
                <>
                  <SkeletonRow cols={8} />
                  <SkeletonRow cols={8} />
                </>
              )}
              {!isPending &&
                rows.map((r) => (
                  <tr
                    key={r.instrument}
                    className="hover:bg-panel-2 cursor-pointer"
                    onClick={onSelect ? () => onSelect(r.instrument) : undefined}
                  >
                    <td className={`${TD} text-left font-sans`}>
                      <span className="text-text font-semibold">
                        {r.instrument}
                      </span>
                    </td>
                    <td className={TD}>{r.side}</td>
                    <td className={TD}>{r.absQty.toLocaleString()}</td>
                    <td className={TD}>
                      {r.avgOpen > 0 ? r.avgOpen.toFixed(r.digits) : "—"}
                    </td>
                    <td className={TD}>
                      {r.mark > 0 ? r.mark.toFixed(r.digits) : "—"}
                    </td>
                    <td className={TD} style={{ color: signed(r.livePl) }}>
                      {r.livePl >= 0 ? "+" : ""}
                      {money(r.livePl)}
                    </td>
                    <td className={TD}>{money(r.usedMargin)}</td>
                    <td className={`${TD} text-center font-sans`}>
                      <button
                        className="btn btn-mini"
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setClosing(r);
                        }}
                      >
                        close
                      </button>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}
      {closeCard}
    </div>
  );
}

function FxcmStripRow({
  row,
  onSelect,
  onCloseClick,
  bare,
}: {
  row: NettedFxcmRow;
  onSelect?: (s: string) => void;
  onCloseClick: (r: NettedFxcmRow) => void;
  bare: boolean;
}) {
  const plUp = row.livePl >= 0;
  return (
    <div
      role={onSelect ? "button" : undefined}
      onClick={onSelect ? () => onSelect(row.instrument) : undefined}
      className="grid items-center gap-3 p-[14px_18px] transition-colors"
      style={{
        gridTemplateColumns: "1fr 80px 1fr 1fr 1fr 1fr auto",
        background: bare ? "transparent" : "var(--panel)",
        border: bare ? "none" : "1px solid var(--border)",
        borderBottom: bare ? "1px solid var(--hairline)" : undefined,
        borderRadius: bare ? 0 : "var(--r)",
        cursor: onSelect ? "pointer" : "default",
      }}
    >
      <div className="flex flex-col min-w-0">
        <span className="font-semibold">{row.instrument}</span>
        <span className="text-[11px]" style={{ color: "var(--mute)" }}>
          {row.side === "Short" ? "SHORT" : "Long"}
        </span>
      </div>
      <span
        className="font-mono text-[13px] tabular-nums"
        style={{ color: "var(--text-2)" }}
      >
        {row.absQty.toLocaleString()}
      </span>
      <div className="text-right">
        <div className="font-mono text-[14px] tabular-nums">
          {row.avgOpen > 0 ? row.avgOpen.toFixed(row.digits) : "—"}
        </div>
        <div
          className="font-mono text-[11px] tabular-nums"
          style={{ color: "var(--mute)" }}
        >
          open
        </div>
      </div>
      <div className="text-right">
        <div className="font-mono text-[14px] tabular-nums">
          {row.mark > 0 ? row.mark.toFixed(row.digits) : "—"}
        </div>
        <div
          className="font-mono text-[11px] tabular-nums"
          style={{ color: "var(--mute)" }}
        >
          mark
        </div>
      </div>
      <div className="text-right">
        <div
          className="font-mono text-[14px] tabular-nums"
          style={{ color: signed(row.livePl) }}
        >
          {plUp ? "+" : ""}
          {money(row.livePl)}
        </div>
        <div
          className="font-mono text-[11px] tabular-nums"
          style={{ color: "var(--mute)" }}
        >
          P/L
        </div>
      </div>
      <div className="text-right">
        <div className="font-mono text-[14px] tabular-nums">
          {money(row.usedMargin)}
        </div>
        <div
          className="font-mono text-[11px] tabular-nums"
          style={{ color: "var(--mute)" }}
        >
          margin
        </div>
      </div>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onCloseClick(row);
        }}
        className="btn btn-mini"
      >
        Close
      </button>
    </div>
  );
}

function FxcmStripCard({
  row,
  onSelect,
  onCloseClick,
  bare,
  compact,
}: {
  row: NettedFxcmRow;
  onSelect?: (s: string) => void;
  onCloseClick: (r: NettedFxcmRow) => void;
  bare: boolean;
  compact: boolean;
}) {
  const plUp = row.livePl >= 0;
  return (
    <div
      role={onSelect ? "button" : undefined}
      onClick={onSelect ? () => onSelect(row.instrument) : undefined}
      style={{
        background: bare ? "transparent" : "var(--panel)",
        border: bare ? "none" : "1px solid var(--border)",
        borderBottom: bare ? "1px solid var(--hairline)" : undefined,
        borderRadius: bare ? 0 : "var(--mob-card-radius)",
        padding: compact ? "8px 12px" : "14px 16px",
        boxShadow: bare ? "none" : "var(--shadow-sm)",
        display: "flex",
        flexDirection: "column",
        gap: compact ? 6 : 10,
        cursor: onSelect ? "pointer" : "default",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
        }}
      >
        <div>
          <span style={{ fontSize: 16, fontWeight: 700 }}>{row.instrument}</span>
          <span
            className="tabular-nums"
            style={{
              fontSize: 11,
              marginLeft: 8,
              color: "var(--mute)",
              fontFamily: "var(--font-mono)",
            }}
          >
            {row.side === "Short" ? "SHORT" : "Long"} · {row.absQty.toLocaleString()}
          </span>
        </div>
        <div
          className="tabular-nums font-mono"
          style={{
            fontSize: 14,
            fontWeight: 600,
            color: plUp ? "var(--pos)" : "var(--neg)",
          }}
        >
          {plUp ? "+" : ""}
          {money(row.livePl)}
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
        <StripStat
          k="Open"
          v={row.avgOpen > 0 ? row.avgOpen.toFixed(row.digits) : "—"}
          sub=""
        />
        <StripStat
          k="Mark"
          v={row.mark > 0 ? row.mark.toFixed(row.digits) : "—"}
          sub=""
        />
        <StripStat k="Margin" v={money(row.usedMargin)} sub="" />
      </div>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onCloseClick(row);
        }}
        style={{
          minHeight: "var(--mob-tap)",
          padding: "8px 16px",
          background: "var(--panel-2)",
          border: "1px solid var(--border)",
          borderRadius: 8,
          fontSize: 12.5,
          fontWeight: 500,
          width: "100%",
        }}
      >
        Close
      </button>
    </div>
  );
}
