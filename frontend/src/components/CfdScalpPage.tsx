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

// ── Lot sizing ───────────────────────────────────────────────────────────────
// FX pairs (instrument_type 1) trade in 1,000-unit lots; every other type
// (indices, metals, stock CFDs, …) trades in multiples of its own
// base_unit_size (often 1 contract). A single "units" number can't span both,
// so the control stores a 0–3 *level* and each instrument resolves its own
// presets from its metadata.
const LOT_LEVELS = [0, 1, 2, 3] as const;
type LotLevel = (typeof LOT_LEVELS)[number];

function lotLabel(units: number): string {
  if (units >= 1_000_000) return `${units / 1_000_000}M`;
  if (units >= 1_000) return `${units / 1_000}K`;
  return String(units);
}

// Per-instrument lot presets, indexed by level. FX → 1K/10K/50K/100K units;
// non-FX → 1/5/10/25 × base_unit_size (shown as contract counts).
function lotPresetsFor(price: FxcmPrice | undefined): { label: string; units: number }[] {
  const isFx = (price?.instrument_type ?? 1) === 1;
  if (isFx) {
    return [1_000, 10_000, 50_000, 100_000].map((u) => ({ label: lotLabel(u), units: u }));
  }
  const base = Math.max(1, price?.base_unit_size ?? 1);
  return [1, 5, 10, 25].map((m) => ({ label: `${m}×`, units: m * base }));
}

function lotStep(price: FxcmPrice | undefined): number {
  return (price?.instrument_type ?? 1) === 1 ? 1000 : Math.max(1, price?.base_unit_size ?? 1);
}

// ── Price rendering + flash ──────────────────────────────────────────────────

// Decimal place of one pip/point, derived from the bridge point_size
// (0.0001 FX → 4, 0.01 JPY/gold → 2, 1.0 index → 0). Falls back to all of
// `digits` (treat every decimal as sub-pip) when point_size is missing.
function pipDecimals(pointSize: number | undefined, digits: number): number {
  if (!pointSize || pointSize <= 0) return digits;
  return Math.max(0, Math.round(-Math.log10(pointSize)));
}

// Split a price into handle / big-pips / fractional-pip for broker-style
// emphasis. Pip location comes from point_size (NOT a digit-count guess), so
// indices (1dp) and stock CFDs (2dp) render correctly, not just 5dp FX. The
// big-pips are the two whole-pip digits; the fractional pip is whatever trails
// the pip decimal. A straddling decimal point is skipped for short quotes.
function splitBigFig(
  value: number | undefined,
  digits: number,
  pointSize: number | undefined,
): { big: string; pips: string; frac: string } {
  if (value == null || Number.isNaN(value)) return { big: "—", pips: "", frac: "" };
  const s = value.toFixed(digits);
  const subPip = Math.max(0, digits - pipDecimals(pointSize, digits));
  const frac = subPip > 0 ? s.slice(s.length - subPip) : "";
  let rem = subPip > 0 ? s.slice(0, s.length - subPip) : s;
  if (rem.endsWith(".")) rem = rem.slice(0, -1);
  // Emphasise the last two *digit* characters of the remainder.
  let seen = 0;
  let cut = 0;
  for (let i = rem.length - 1; i >= 0; i--) {
    if (rem[i] >= "0" && rem[i] <= "9") {
      seen++;
      if (seen === 2) {
        cut = i;
        break;
      }
    }
  }
  return { big: rem.slice(0, cut), pips: rem.slice(cut), frac };
}

// Dead-band so sub-pip float jitter doesn't strobe: a change counts only if it
// clears half a point. Falls back to half a display unit when point_size is
// absent.
function flashEpsilon(pointSize: number | undefined, digits: number): number {
  if (pointSize && pointSize > 0) return pointSize / 2;
  return 0.5 * 10 ** -digits;
}

// Flip an up/down flash for ~400ms when the tracked value moves past the
// dead-band. Each quote (bid OR ask) is compared against its OWN previous
// value, so an unchanged side stays quiet even when its counterpart moves —
// the per-quote uptick/downtick convention real dealing tiles use (reviewed;
// see BACKLOG → CFD Scalp).
function useTickFlash(value: number | undefined, eps: number): "up" | "down" | null {
  const prev = useRef<number | undefined>(value);
  const [dir, setDir] = useState<"up" | "down" | null>(null);
  useEffect(() => {
    if (value == null) return;
    const p = prev.current;
    if (p != null && Math.abs(value - p) >= eps) {
      setDir(value > p ? "up" : "down");
      prev.current = value;
      const t = setTimeout(() => setDir(null), 400);
      return () => clearTimeout(t);
    }
    // Sub-epsilon move: advance the baseline without flashing so noise can't
    // accumulate into a later false flash.
    prev.current = value;
  }, [value, eps]);
  return dir;
}

function BigFig({
  value,
  digits,
  pointSize,
}: {
  value: number | undefined;
  digits: number;
  pointSize: number | undefined;
}) {
  const { big, pips, frac } = splitBigFig(value, digits, pointSize);
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
  pointSize,
  busy,
  armed,
  onClick,
}: {
  side: "B" | "S";
  price: number | undefined;
  digits: number;
  pointSize: number | undefined;
  busy: boolean;
  armed: boolean;
  onClick: () => void;
}) {
  const flash = useTickFlash(price, flashEpsilon(pointSize, digits));
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
        // Armed (confirm pending) wins over the tick flash so the pending
        // action is unmistakable.
        background: armed ? (isBuy ? "var(--pos-bg)" : "var(--neg-bg)") : flashBg,
        boxShadow: armed ? `inset 0 0 0 2px ${base}` : "none",
        opacity: busy ? 0.5 : 1,
        borderRadius: 8,
      }}
      title={isBuy ? "Buy at ask" : "Sell at bid"}
    >
      <span
        className="text-[10px] font-semibold uppercase mb-0.5"
        style={{ color: base, letterSpacing: "0.06em" }}
      >
        {armed ? "Confirm" : isBuy ? "Buy" : "Sell"}
      </span>
      <span style={{ color: "var(--text)" }}>
        <BigFig value={price} digits={digits} pointSize={pointSize} />
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
  armedBuy,
  armedSell,
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
  armedBuy: boolean;
  armedSell: boolean;
  onSelect: () => void;
  onBuy: () => void;
  onSell: () => void;
}) {
  const digits = price.digits ?? cfdDigits(price.instrument);
  const pointSize = price.point_size;
  // Tint (never red/green) the spread chip only when the spread itself crosses
  // the dead-band — a widening spread is a cost signal a scalper cares about;
  // a static spread reads as quiet. Spread has no bullish/bearish meaning, so
  // it's deliberately not flashed like a price.
  const spread =
    price.bid != null && price.ask != null ? price.ask - price.bid : undefined;
  const spreadFlash = useTickFlash(spread, flashEpsilon(pointSize, digits));
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
          className="text-[10.5px] font-medium tabular-nums px-1.5 py-0.5 rounded transition-colors"
          style={{
            background: spreadFlash ? "var(--accent-bg)" : "var(--panel-2)",
            color: spreadFlash ? "var(--accent)" : "var(--mute)",
          }}
          title={spreadFlash === "up" ? "Spread widening" : spreadFlash === "down" ? "Spread tightening" : "Spread"}
        >
          {fmtSpread(price.bid, price.ask, price.point_size)}
        </span>
      </div>
      <div
        className="flex items-stretch gap-1 p-1"
        onClick={(e) => e.stopPropagation()}
      >
        <RateButton side="S" price={price.bid} digits={digits} pointSize={pointSize} busy={busySell} armed={armedSell} onClick={onSell} />
        <RateButton side="B" price={price.ask} digits={digits} pointSize={pointSize} busy={busyBuy} armed={armedBuy} onClick={onBuy} />
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
  const [lotLevel, setLotLevel] = useState<LotLevel>(0);
  const [pending, setPending] = useState<Set<string>>(new Set());
  // 1-click ON = fire on a single click; OFF = first click arms the
  // instrument/side ("Confirm"), a second click within ARM_TTL executes.
  const [oneClick, setOneClick] = useState(true);
  const [armedKey, setArmedKey] = useState<string | null>(null);
  const armTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  function disarm() {
    if (armTimer.current) clearTimeout(armTimer.current);
    armTimer.current = null;
    setArmedKey(null);
  }

  // Buy/Sell click dispatcher. In 1-click mode it fires immediately; otherwise
  // the first click arms the button (shows "Confirm") and the second click
  // within ARM_TTL_MS executes — a simple, modal-free fat-finger guard.
  const ARM_TTL_MS = 4000;
  function requestOrder(instrument: string, side: "B" | "S") {
    const key = `${instrument}:${side}`;
    if (oneClick) {
      placeOrder(instrument, side);
      return;
    }
    if (armedKey === key) {
      disarm();
      placeOrder(instrument, side);
      return;
    }
    if (armTimer.current) clearTimeout(armTimer.current);
    setArmedKey(key);
    armTimer.current = setTimeout(() => setArmedKey(null), ARM_TTL_MS);
  }

  // Tidy the arm timer on unmount.
  useEffect(() => () => {
    if (armTimer.current) clearTimeout(armTimer.current);
  }, []);

  async function placeOrder(instrument: string, side: "B" | "S") {
    const price = priceMap.get(instrument);
    // Resolve the lot from the *instrument's own* presets at the current level
    // (FX in 1K-unit lots, non-FX in base_unit_size contracts), clamped to a
    // valid step multiple so the bridge never rejects an off-step amount.
    const step = lotStep(price);
    const units = lotPresetsFor(price)[lotLevel]?.units ?? step;
    const amount = Math.max(step, Math.round(units / step) * step);
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
      showToast("Position closed", "success");
      await refreshPositions();
    } catch (e) {
      showToast(`Close failed: ${(e as Error).message}`, "error");
    }
  }

  async function closeAll() {
    // Sequential, not Promise.all — the FCLite bridge is a single JVM session
    // and doesn't take kindly to a burst of concurrent close requests.
    let failed = 0;
    for (const p of positions) {
      try {
        await api.closeFxcmPosition(String(p.trade_id ?? ""));
      } catch {
        failed++;
      }
    }
    await refreshPositions();
    showToast(
      failed ? `Closed all but ${failed} position${failed === 1 ? "" : "s"}` : "Closed all positions",
      failed ? "error" : "info",
    );
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
  // Lot presets follow the selected instrument's type; the chosen level is
  // shared across the matrix and resolved per-tile at submit (see placeOrder).
  const selectedPresets = lotPresetsFor(selectedPrice);
  const selectedLotUnits = selectedPresets[lotLevel]?.units ?? 0;
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

        {/* Lot size presets — labels follow the selected instrument's type
            (units for FX, ×contracts for non-FX). */}
        <div className="flex items-center gap-2 ml-auto">
          <span className="text-[11px]" style={{ color: "var(--mute)" }}>Lot</span>
          <div className="flex items-center gap-1">
            {selectedPresets.map((preset, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setLotLevel(i as LotLevel)}
                className="text-[11.5px] font-semibold px-2 py-1 rounded cursor-pointer border transition-colors"
                style={{
                  background: lotLevel === i ? "var(--accent-bg)" : "var(--panel-2)",
                  borderColor: lotLevel === i ? "var(--accent)" : "var(--border)",
                  color: lotLevel === i ? "var(--accent)" : "var(--text-2)",
                }}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>

        {/* 1-click toggle — ON fires on a single click; OFF requires a second
            "Confirm" click on the armed button. */}
        <button
          type="button"
          onClick={() => {
            setOneClick((v) => !v);
            disarm();
          }}
          className="inline-flex items-center gap-2 text-[11.5px] font-semibold px-2.5 py-1.5 rounded cursor-pointer border transition-colors"
          style={{
            background: oneClick ? "var(--accent-bg)" : "var(--panel-2)",
            borderColor: oneClick ? "var(--accent)" : "var(--border)",
            color: oneClick ? "var(--accent)" : "var(--text-2)",
          }}
          title={oneClick ? "1-click trading ON — orders fire immediately" : "1-click OFF — click then Confirm"}
          aria-pressed={oneClick}
        >
          <span
            aria-hidden
            className="inline-flex items-center"
            style={{
              width: 26,
              height: 15,
              borderRadius: 999,
              padding: 2,
              background: oneClick ? "var(--accent)" : "var(--border-2)",
              justifyContent: oneClick ? "flex-end" : "flex-start",
            }}
          >
            <span style={{ width: 11, height: 11, borderRadius: 999, background: "var(--panel)" }} />
          </span>
          {oneClick ? "⚡ 1-click" : "Confirm"}
        </button>
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
                    armedBuy={armedKey === `${sym}:B`}
                    armedSell={armedKey === `${sym}:S`}
                    onSelect={() => handleSelect(sym)}
                    onBuy={() => requestOrder(sym, "B")}
                    onSell={() => requestOrder(sym, "S")}
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
              {/* Chart first — it drives the action. Scalping preset: opens on
                  the 1m frame, zoomed to the most recent bars (CfdPriceChart's
                  own TF pills still let the user change it). */}
              <div
                className="rounded-card-lg p-2 flex"
                style={{ background: "var(--panel)", border: "1px solid var(--border)", boxShadow: "var(--shadow-sm)", minHeight: 360 }}
              >
                <CfdPriceChart
                  instrument={selected}
                  livePrice={selectedPrice}
                  onOpenChart={onOpenChart}
                  defaultTimeframe="m1"
                  barsToShow={90}
                />
              </div>

              {/* Deal ticket — acts on the charted instrument. */}
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
                    pointSize={selectedPrice.point_size}
                    busy={pending.has(`${selected}:S`)}
                    armed={armedKey === `${selected}:S`}
                    onClick={() => requestOrder(selected, "S")}
                  />
                  <DealButton
                    side="B"
                    label="Buy"
                    price={selectedPrice.ask}
                    digits={selDigits}
                    pointSize={selectedPrice.point_size}
                    busy={pending.has(`${selected}:B`)}
                    armed={armedKey === `${selected}:B`}
                    onClick={() => requestOrder(selected, "B")}
                  />
                </div>
                <div className="text-[11px] flex items-center justify-between" style={{ color: "var(--mute)" }}>
                  <span>{selectedLotUnits.toLocaleString()} {unit(selected)}</span>
                  {oneClick ? (
                    <span style={{ opacity: 0.6 }}>SL / TP · coming soon</span>
                  ) : (
                    <span style={{ color: "var(--accent)" }}>Confirm mode · click twice</span>
                  )}
                </div>
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
  pointSize,
  busy,
  armed,
  onClick,
}: {
  side: "B" | "S";
  label: string;
  price: number | undefined;
  digits: number;
  pointSize: number | undefined;
  busy: boolean;
  armed: boolean;
  onClick: () => void;
}) {
  const flash = useTickFlash(price, flashEpsilon(pointSize, digits));
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
        // Armed (confirm pending) keeps a solid ring; otherwise a brief
        // tick-flash ring.
        boxShadow: armed || flash ? `inset 0 0 0 2px ${accent}` : "none",
        opacity: busy ? 0.5 : 1,
      }}
    >
      <span className="text-[11px] font-bold uppercase" style={{ color: accent, letterSpacing: "0.06em" }}>
        {busy ? "…" : armed ? `Confirm ${label}` : label}
      </span>
      <span style={{ color: "var(--text)" }}>
        <BigFig value={price} digits={digits} pointSize={pointSize} />
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
  // /positions rows carry their own `digits` — prefer it over the caller's
  // price-derived fallback so the open rate shows the instrument's precision.
  const d = typeof pos.digits === "number" ? pos.digits : digits;
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
          {fmtCfdPrice(typeof openRate === "number" ? openRate : undefined, d)}
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
