import { useEffect, useMemo, useRef, useState } from "react";

import * as api from "../api";
import {
  useFxcmAccount,
  useFxcmDisplayNames,
  useFxcmSubmitOrder,
  useFxcmUnderlyingUnit,
  useFxcmWatchlistQuery,
} from "../data/hooks";
import { useFxcmView } from "../lib/fxcm-view";
import { cfdDigits, fmtCfdPrice, fmtSpread, money } from "../lib/format";
import { showToast } from "../lib/toast";
import type { FxcmPosition, FxcmPrice } from "../types";
import CfdPriceChart from "./CfdPriceChart";

// ─────────────────────────────────────────────────────────────────────────────
// CFD scalping mode — a traditional forex-broker rapid-trade surface.
//
// FOUNDATION / MOCK. This is deliberately a self-contained first cut for design
// to iterate on, not a finished surface. Live ticks are simulated by a fast
// (1 s) /api/fxcm/prices poll — the real per-tick push from the FCLite bridge
// is still backlogged (subscribeBars is a no-op today), so the "flashing
// lights" fire on each poll delta rather than true streaming ticks. One-click
// orders submit market (OM) orders at the selected lot size; SL/TP is a visual
// stub (the bridge params are untested from here, so we don't send them yet).
// ─────────────────────────────────────────────────────────────────────────────

const POLL_INTERVAL_MS = 1000;

// Lot presets in base units (FX pairs trade in 1,000-unit lots; non-FX
// instruments clamp to their own base_unit_size at submit time).
const LOT_PRESETS = [1_000, 10_000, 50_000, 100_000];

function lotLabel(units: number): string {
  if (units >= 1_000_000) return `${units / 1_000_000}M`;
  if (units >= 1_000) return `${units / 1_000}K`;
  return String(units);
}

// Split a formatted price into big-figure / pips / fractional-pip so the tile
// can render the broker-style emphasis (small handle, big pips, tiny tenth).
function splitBigFig(s: string): { big: string; pips: string; frac: string } {
  if (!s || s === "—" || s.length < 3) return { big: s, pips: "", frac: "" };
  return { big: s.slice(0, -3), pips: s.slice(-3, -1), frac: s.slice(-1) };
}

// Flip an up/down flash for ~400ms whenever the tracked value changes.
function useTickFlash(value: number | undefined): "up" | "down" | null {
  const prev = useRef<number | undefined>(value);
  const [dir, setDir] = useState<"up" | "down" | null>(null);
  useEffect(() => {
    if (value == null) return;
    if (prev.current != null && value !== prev.current) {
      setDir(value > prev.current ? "up" : "down");
      prev.current = value;
      const t = setTimeout(() => setDir(null), 400);
      return () => clearTimeout(t);
    }
    prev.current = value;
  }, [value]);
  return dir;
}

function BigFig({ value, digits }: { value: number | undefined; digits: number }) {
  const { big, pips, frac } = splitBigFig(fmtCfdPrice(value, digits));
  return (
    <span className="tabular-nums leading-none">
      <span style={{ fontSize: 15, opacity: 0.7 }}>{big}</span>
      <span style={{ fontSize: 26, fontWeight: 700 }}>{pips}</span>
      <span style={{ fontSize: 13, verticalAlign: "super", opacity: 0.85 }}>{frac}</span>
    </span>
  );
}

// ── One half of a rate tile (the SELL bid or BUY ask one-click button) ──────────

function RateButton({
  side,
  price,
  digits,
  busy,
  onClick,
}: {
  side: "B" | "S";
  price: number | undefined;
  digits: number;
  busy: boolean;
  onClick: () => void;
}) {
  const flash = useTickFlash(price);
  const isBuy = side === "B";
  const base = isBuy ? "var(--pos)" : "var(--neg)";
  const flashBg =
    flash === "up"
      ? "var(--pos-bg)"
      : flash === "down"
        ? "var(--neg-bg)"
        : "transparent";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy || price == null}
      className="flex-1 flex flex-col items-center justify-center py-2.5 px-2 cursor-pointer border-0 transition-colors"
      style={{
        background: flashBg,
        opacity: busy ? 0.5 : 1,
        borderRadius: 8,
      }}
      title={isBuy ? "Buy at ask (one click)" : "Sell at bid (one click)"}
    >
      <span
        className="text-[10px] font-semibold uppercase mb-0.5"
        style={{ color: base, letterSpacing: "0.06em" }}
      >
        {isBuy ? "Buy" : "Sell"}
      </span>
      <span style={{ color: "var(--text)" }}>
        <BigFig value={price} digits={digits} />
      </span>
    </button>
  );
}

function ScalpRateTile({
  price,
  displayName,
  net,
  selected,
  busyBuy,
  busySell,
  onSelect,
  onBuy,
  onSell,
}: {
  price: FxcmPrice;
  displayName: string;
  net: { units: number; pl: number } | undefined;
  selected: boolean;
  busyBuy: boolean;
  busySell: boolean;
  onSelect: () => void;
  onBuy: () => void;
  onSell: () => void;
}) {
  const digits = price.digits ?? cfdDigits(price.instrument);
  return (
    <div
      onClick={onSelect}
      className="rounded-card-lg overflow-hidden cursor-pointer"
      style={{
        background: "var(--panel)",
        border: `1px solid ${selected ? "var(--accent)" : "var(--border)"}`,
        boxShadow: selected
          ? "0 0 0 1px var(--accent), var(--shadow-sm)"
          : "var(--shadow-sm)",
      }}
    >
      <div
        className="flex items-center justify-between px-3 py-2"
        style={{ borderBottom: "1px solid var(--hairline)" }}
      >
        <span className="text-[13px] font-semibold truncate">{displayName}</span>
        <span
          className="text-[10.5px] font-medium tabular-nums px-1.5 py-0.5 rounded"
          style={{ background: "var(--panel-2)", color: "var(--mute)" }}
        >
          {fmtSpread(price.bid, price.ask, price.point_size)}
        </span>
      </div>
      <div
        className="flex items-stretch gap-1 p-1"
        onClick={(e) => e.stopPropagation()}
      >
        <RateButton side="S" price={price.bid} digits={digits} busy={busySell} onClick={onSell} />
        <RateButton side="B" price={price.ask} digits={digits} busy={busyBuy} onClick={onBuy} />
      </div>
      {net && net.units !== 0 && (
        <div
          className="flex items-center justify-between px-3 py-1.5 text-[11px] tabular-nums"
          style={{ borderTop: "1px solid var(--hairline)", background: "var(--panel-2)" }}
        >
          <span style={{ color: "var(--mute)" }}>
            {net.units > 0 ? "Long" : "Short"} {Math.abs(net.units).toLocaleString()}
          </span>
          <span style={{ color: net.pl >= 0 ? "var(--pos)" : "var(--neg)", fontWeight: 600 }}>
            {net.pl >= 0 ? "+" : ""}
            {money(net.pl)}
          </span>
        </div>
      )}
    </div>
  );
}

// ── Page ────────────────────────────────────────────────────────────────────

interface Props {
  selected?: string;
  onSelectSymbol?: (symbol: string) => void;
  onOpenChart?: () => void;
}

export default function CfdScalpPage({ selected: selectedProp, onSelectSymbol, onOpenChart }: Props) {
  const [bridgeOk, setBridgeOk] = useState<boolean | null>(null);
  const [prices, setPrices] = useState<FxcmPrice[]>([]);
  const [positions, setPositions] = useState<FxcmPosition[]>([]);
  const [selected, setSelected] = useState<string>(selectedProp || "");
  const [lot, setLot] = useState<number>(LOT_PRESETS[0]);
  const [pending, setPending] = useState<Set<string>>(new Set());

  const dn = useFxcmDisplayNames();
  const unit = useFxcmUnderlyingUnit();
  const account = useFxcmAccount(!!bridgeOk).data ?? null;
  const watchlist = useFxcmWatchlistQuery(!!bridgeOk);
  const submit = useFxcmSubmitOrder();

  const wlSymbols = useMemo(
    () => (watchlist.data ?? []).map((p) => p.instrument),
    [watchlist.data],
  );
  // Subscribe the watchlist instruments so the bridge pushes live bid/ask
  // (status T). The 1 s poll below then reads fresh quotes for the flashes.
  useFxcmView(wlSymbols, !!bridgeOk);

  // Bridge health gate.
  useEffect(() => {
    let cancelled = false;
    api
      .getFxcmHealth()
      .then(() => !cancelled && setBridgeOk(true))
      .catch(() => !cancelled && setBridgeOk(false));
    return () => {
      cancelled = true;
    };
  }, []);

  // Fast prices + positions poll — the scalp surface wants a tighter cadence
  // than Discover's 3 s so the flashing rate tiles feel live.
  useEffect(() => {
    if (!bridgeOk) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const [pr, pos] = await Promise.all([
          api.getFxcmPrices(),
          api.getFxcmPositions(),
        ]);
        if (!cancelled) {
          setPrices(pr);
          setPositions(pos);
        }
      } catch {
        /* bridge blip — keep last frame on screen */
      }
    };
    tick();
    const id = setInterval(tick, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [bridgeOk]);

  const priceMap = useMemo(() => {
    const m = new Map<string, FxcmPrice>();
    for (const p of prices) m.set(p.instrument, p);
    return m;
  }, [prices]);

  // Net exposure + P&L per instrument (B units positive, S negative).
  const netByInstrument = useMemo(() => {
    const m = new Map<string, { units: number; pl: number }>();
    for (const pos of positions) {
      const sym = String(pos.instrument ?? "");
      if (!sym) continue;
      const signed = (pos.buy_sell === "B" ? 1 : -1) * Number(pos.amount ?? 0);
      const pl = typeof pos.pl === "number" ? pos.pl : Number(pos.gross_pl ?? 0);
      const cur = m.get(sym) ?? { units: 0, pl: 0 };
      m.set(sym, { units: cur.units + signed, pl: cur.pl + pl });
    }
    return m;
  }, [positions]);

  const netPl = useMemo(
    () =>
      positions.reduce(
        (sum, p) => sum + (typeof p.pl === "number" ? p.pl : Number(p.gross_pl ?? 0)),
        0,
      ),
    [positions],
  );

  // Seed the selection from the watchlist once it loads.
  useEffect(() => {
    if (!selected && wlSymbols.length > 0) {
      setSelected(wlSymbols[0]);
      onSelectSymbol?.(wlSymbols[0]);
    }
  }, [wlSymbols, selected]);

  function handleSelect(instrument: string) {
    setSelected(instrument);
    onSelectSymbol?.(instrument);
  }

  async function refreshPositions() {
    try {
      setPositions(await api.getFxcmPositions());
    } catch {
      /* leave stale */
    }
  }

  async function placeOrder(instrument: string, side: "B" | "S") {
    const price = priceMap.get(instrument);
    const isFx = (price?.instrument_type ?? 1) === 1;
    const step = isFx ? 1000 : price?.base_unit_size ?? 1;
    const amount = Math.max(step, Math.round(lot / step) * step);
    const key = `${instrument}:${side}`;
    setPending((p) => new Set(p).add(key));
    try {
      await submit.mutateAsync({ instrument, buy_sell: side, amount, order_type: "OM" });
      showToast(
        `${side === "B" ? "Bought" : "Sold"} ${amount.toLocaleString()} ${dn(instrument)}`,
        "success",
      );
      await refreshPositions();
    } catch (e) {
      showToast(`Order failed: ${(e as Error).message}`, "error");
    } finally {
      setPending((p) => {
        const n = new Set(p);
        n.delete(key);
        return n;
      });
    }
  }

  async function closePosition(tradeId: string | number) {
    try {
      await api.closeFxcmPosition(tradeId);
      await refreshPositions();
    } catch (e) {
      showToast(`Close failed: ${(e as Error).message}`, "error");
    }
  }

  async function closeAll() {
    await Promise.allSettled(
      positions.map((p) => api.closeFxcmPosition(String(p.trade_id ?? ""))),
    );
    await refreshPositions();
    showToast("Closed all positions", "info");
  }

  if (bridgeOk === false) {
    return (
      <div className="max-w-[1280px] mx-auto px-4 pt-4">
        <div
          className="rounded-card p-4 text-[12.5px]"
          style={{
            background: "var(--neg-bg)",
            border: "1px solid color-mix(in oklch, var(--neg) 30%, transparent)",
            color: "var(--neg)",
          }}
        >
          <strong>Bridge offline.</strong> The FXCM FCLite bridge isn't responding —
          scalp mode needs the live price feed. Refresh in a minute.
        </div>
      </div>
    );
  }

  const selectedPrice = priceMap.get(selected);
  const selDigits = selectedPrice?.digits ?? cfdDigits(selected);
  const selectedPositions = positions.filter((p) => String(p.instrument) === selected);

  return (
    <div className="max-w-[1440px] mx-auto px-4 pt-4 pb-24">
      {/* Account + controls strip */}
      <div
        className="flex items-center gap-5 flex-wrap rounded-card-lg px-4 py-3 mb-4"
        style={{ background: "var(--panel)", border: "1px solid var(--border)", boxShadow: "var(--shadow-sm)" }}
      >
        <span className="inline-flex items-center gap-2">
          <span
            className="w-2 h-2 rounded-full animate-pulse"
            style={{ background: "var(--accent)" }}
            aria-hidden
          />
          <span className="text-[11px] font-semibold uppercase" style={{ color: "var(--accent)", letterSpacing: "0.08em" }}>
            Scalp · Live
          </span>
        </span>
        <Stat label="Equity" value={money(account?.equity ?? account?.balance ?? 0)} />
        <Stat
          label="Day P/L"
          value={`${(account?.day_pl ?? 0) >= 0 ? "+" : ""}${money(account?.day_pl ?? 0)}`}
          color={(account?.day_pl ?? 0) >= 0 ? "var(--pos)" : "var(--neg)"}
        />
        <Stat label="Free margin" value={money(Math.max(0, (account?.equity ?? 0) - (account?.usedmargin ?? 0)))} />
        <Stat
          label="Open P/L"
          value={`${netPl >= 0 ? "+" : ""}${money(netPl)}`}
          color={netPl >= 0 ? "var(--pos)" : "var(--neg)"}
        />

        {/* Lot size presets */}
        <div className="flex items-center gap-2 ml-auto">
          <span className="text-[11px]" style={{ color: "var(--mute)" }}>Lot</span>
          <div className="flex items-center gap-1">
            {LOT_PRESETS.map((u) => (
              <button
                key={u}
                type="button"
                onClick={() => setLot(u)}
                className="text-[11.5px] font-semibold px-2 py-1 rounded cursor-pointer border transition-colors"
                style={{
                  background: lot === u ? "var(--accent-bg)" : "var(--panel-2)",
                  borderColor: lot === u ? "var(--accent)" : "var(--border)",
                  color: lot === u ? "var(--accent)" : "var(--text-2)",
                }}
              >
                {lotLabel(u)}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_360px] items-start">
        {/* Rate matrix */}
        <div>
          {watchlist.isPending ? (
            <div className="text-[13px] py-10 text-center" style={{ color: "var(--mute)" }}>
              Loading instruments…
            </div>
          ) : wlSymbols.length === 0 ? (
            <div className="text-[13px] py-10 text-center" style={{ color: "var(--mute)" }}>
              Your CFD watchlist is empty — add instruments from Discover to trade them here.
            </div>
          ) : (
            <div
              className="grid gap-3"
              style={{ gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))" }}
            >
              {wlSymbols.map((sym) => {
                const price = priceMap.get(sym);
                if (!price) return null;
                return (
                  <ScalpRateTile
                    key={sym}
                    price={price}
                    displayName={dn(sym)}
                    net={netByInstrument.get(sym)}
                    selected={sym === selected}
                    busyBuy={pending.has(`${sym}:B`)}
                    busySell={pending.has(`${sym}:S`)}
                    onSelect={() => handleSelect(sym)}
                    onBuy={() => placeOrder(sym, "B")}
                    onSell={() => placeOrder(sym, "S")}
                  />
                );
              })}
            </div>
          )}
        </div>

        {/* Focus column — selected instrument deal ticket + chart */}
        <aside className="flex flex-col gap-4" style={{ position: "sticky", top: 16 }}>
          {selected && selectedPrice ? (
            <>
              <div
                className="rounded-card-lg p-4 flex flex-col gap-3"
                style={{ background: "var(--panel)", border: "1px solid var(--border)", boxShadow: "var(--shadow-sm)" }}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[15px] font-semibold">{dn(selected)}</span>
                  <span className="text-[11px] tabular-nums" style={{ color: "var(--mute)" }}>
                    Spread {fmtSpread(selectedPrice.bid, selectedPrice.ask, selectedPrice.point_size)}
                  </span>
                </div>
                <div className="flex items-stretch gap-2">
                  <DealButton
                    side="S"
                    label="Sell"
                    price={selectedPrice.bid}
                    digits={selDigits}
                    busy={pending.has(`${selected}:S`)}
                    onClick={() => placeOrder(selected, "S")}
                  />
                  <DealButton
                    side="B"
                    label="Buy"
                    price={selectedPrice.ask}
                    digits={selDigits}
                    busy={pending.has(`${selected}:B`)}
                    onClick={() => placeOrder(selected, "B")}
                  />
                </div>
                <div className="text-[11px] flex items-center justify-between" style={{ color: "var(--mute)" }}>
                  <span>{lot.toLocaleString()} {unit(selected)}</span>
                  {/* SL/TP is a design stub — not wired to the bridge yet. */}
                  <span style={{ opacity: 0.6 }}>SL / TP · coming soon</span>
                </div>
              </div>

              {/* Mini chart — reuses the Discover CFD chart (m1 available in its
                  own timeframe pills) so scalpers get a small-frame view. */}
              <div
                className="rounded-card-lg p-2 flex"
                style={{ background: "var(--panel)", border: "1px solid var(--border)", boxShadow: "var(--shadow-sm)", minHeight: 320 }}
              >
                <CfdPriceChart instrument={selected} livePrice={selectedPrice} onOpenChart={onOpenChart} />
              </div>

              {/* Positions for the selected instrument */}
              {selectedPositions.length > 0 && (
                <div
                  className="rounded-card-lg overflow-hidden"
                  style={{ background: "var(--panel)", border: "1px solid var(--border)", boxShadow: "var(--shadow-sm)" }}
                >
                  {selectedPositions.map((pos) => (
                    <PositionRow
                      key={String(pos.trade_id)}
                      pos={pos}
                      digits={selDigits}
                      onClose={() => closePosition(String(pos.trade_id ?? ""))}
                    />
                  ))}
                </div>
              )}
            </>
          ) : (
            <div
              className="rounded-card-lg p-6 text-[13px] text-center"
              style={{ background: "var(--panel)", border: "1px solid var(--border)", color: "var(--mute)" }}
            >
              Pick an instrument tile to open the deal ticket.
            </div>
          )}
        </aside>
      </div>

      {/* Open-positions blotter */}
      {positions.length > 0 && (
        <div
          className="rounded-card-lg overflow-hidden mt-6"
          style={{ background: "var(--panel)", border: "1px solid var(--border)", boxShadow: "var(--shadow-sm)" }}
        >
          <div
            className="flex items-center justify-between px-4 py-2.5"
            style={{ borderBottom: "1px solid var(--hairline)" }}
          >
            <span className="text-[13px] font-semibold">
              Open positions
              <span className="ml-2 text-[11px] font-normal" style={{ color: "var(--mute)" }}>
                {positions.length} · net {netPl >= 0 ? "+" : ""}{money(netPl)}
              </span>
            </span>
            <button
              type="button"
              onClick={closeAll}
              className="text-[11.5px] font-medium px-2.5 py-1 rounded border cursor-pointer"
              style={{
                background: "var(--neg-bg)",
                borderColor: "color-mix(in oklch, var(--neg) 30%, transparent)",
                color: "var(--neg)",
              }}
            >
              Close all
            </button>
          </div>
          {positions.map((pos) => (
            <PositionRow
              key={String(pos.trade_id)}
              pos={pos}
              digits={(priceMap.get(String(pos.instrument))?.digits) ?? cfdDigits(String(pos.instrument))}
              showInstrument
              onClose={() => closePosition(String(pos.trade_id ?? ""))}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Small presentational helpers ────────────────────────────────────────────

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-[10.5px] uppercase" style={{ color: "var(--mute)", letterSpacing: "0.05em" }}>{label}</span>
      <span className="text-[15px] font-semibold tabular-nums" style={{ color: color ?? "var(--text)" }}>{value}</span>
    </div>
  );
}

function DealButton({
  side,
  label,
  price,
  digits,
  busy,
  onClick,
}: {
  side: "B" | "S";
  label: string;
  price: number | undefined;
  digits: number;
  busy: boolean;
  onClick: () => void;
}) {
  const flash = useTickFlash(price);
  const accent = side === "B" ? "var(--pos)" : "var(--neg)";
  const bg = side === "B" ? "var(--pos-bg)" : "var(--neg-bg)";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy || price == null}
      className="flex-1 flex flex-col items-center justify-center py-3 rounded-card border-0 cursor-pointer transition-colors"
      style={{
        background: bg,
        boxShadow: flash ? `inset 0 0 0 2px ${accent}` : "none",
        opacity: busy ? 0.5 : 1,
      }}
    >
      <span className="text-[11px] font-bold uppercase" style={{ color: accent, letterSpacing: "0.06em" }}>
        {busy ? "…" : label}
      </span>
      <span style={{ color: "var(--text)" }}>
        <BigFig value={price} digits={digits} />
      </span>
    </button>
  );
}

function PositionRow({
  pos,
  digits,
  showInstrument,
  onClose,
}: {
  pos: FxcmPosition;
  digits: number;
  showInstrument?: boolean;
  onClose: () => void;
}) {
  const dn = useFxcmDisplayNames();
  const pl = typeof pos.pl === "number" ? pos.pl : Number(pos.gross_pl ?? 0);
  const openRate = pos.open ?? pos.open_rate;
  return (
    <div
      className="flex items-center px-4 py-2.5 gap-3"
      style={{ borderBottom: "1px solid var(--hairline)" }}
    >
      <div className="flex flex-col min-w-0 flex-1">
        {showInstrument && (
          <span className="text-[12.5px] font-semibold truncate">{dn(String(pos.instrument))}</span>
        )}
        <span className="text-[11px]" style={{ color: "var(--mute)" }}>
          {pos.buy_sell === "B" ? "Buy" : "Sell"} {Number(pos.amount ?? 0).toLocaleString()} @{" "}
          {fmtCfdPrice(typeof openRate === "number" ? openRate : undefined, digits)}
        </span>
      </div>
      <span
        className="text-[12.5px] font-semibold tabular-nums"
        style={{ color: pl >= 0 ? "var(--pos)" : "var(--neg)" }}
      >
        {pl >= 0 ? "+" : ""}
        {money(pl)}
      </span>
      <button
        type="button"
        onClick={onClose}
        className="text-[11px] font-medium px-2 py-1 rounded border cursor-pointer"
        style={{
          background: "var(--panel-2)",
          borderColor: "var(--border)",
          color: "var(--text-2)",
        }}
      >
        Close
      </button>
    </div>
  );
}
