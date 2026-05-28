import { useState } from "react";

import { useCloseAllPositions, usePositions } from "../data/hooks";
import { useMobile } from "../hooks/useMobile";
import { isCryptoPosition } from "../lib/asset-class";
import { fmtCryptoPrice } from "../lib/format";
import { showToast } from "../lib/toast";
import type { Position } from "../types";
import ErrorBanner from "./ErrorBanner";
import ClosePositionCard from "./trade/ClosePositionCard";
import ConfirmCard from "./trade/ConfirmCard";
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
