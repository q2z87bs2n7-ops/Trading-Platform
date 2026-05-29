import { useEffect, useMemo, useRef, useState } from "react";

import * as api from "../api";
import {
  useFxcmAccount,
  useFxcmDisplayNames,
  useFxcmSubmitOrder,
  useFxcmUnderlyingUnit,
  useFxcmWatchlistAdd,
  useFxcmWatchlistQuery,
  useFxcmWatchlistRemove,
} from "../data/hooks";
import { useFxcmView } from "../lib/fxcm-view";
import { cfdDigits, money } from "../lib/format";
import { showToast } from "../lib/toast";
import { useTheme } from "../hooks/useTheme";
import type { FxcmPosition, FxcmPrice } from "../types";
import { AssetSearch } from "./AssetSearch";
import CfdPriceChart from "./CfdPriceChart";
import CfdAlertsPanel from "./CfdAlertsPanel";
import "./cfd-scalp.css";

// ─────────────────────────────────────────────────────────────────────────────
// CFD Scalp — "Cockpit". A dense, multi-pane FX/CFD dealing terminal: live
// rate matrix · chart-led deal strip · per-instrument position pane · blotter.
// Recreated from the design handoff (design_handoff_cfd_scalp_cockpit) on the
// app's own stack — Calm v2 tokens (scoped extras in cfd-scalp.css), real FXCM
// data, existing trade/close/alert wiring, lightweight-charts via CfdPriceChart.
//
// MOCK/FOUNDATION caveats unchanged: "ticks" ride a 1 s /api/fxcm/prices poll
// (no per-tick push yet); SL/TP is a visual stub (not sent to the bridge).
// ─────────────────────────────────────────────────────────────────────────────

const POLL_INTERVAL_MS = 1000;
const ARM_TTL_MS = 2600;

const LOT_LEVELS = [0, 1, 2, 3] as const;
type LotLevel = (typeof LOT_LEVELS)[number];

function lotLabel(units: number): string {
  if (units >= 1_000_000) return `${units / 1_000_000}M`;
  if (units >= 1_000) return `${units / 1_000}K`;
  return String(units);
}

// FX → 1K/10K/50K/100K units; non-FX → 1/5/10/25 × base_unit_size contracts.
function lotPresetsFor(price: FxcmPrice | undefined): { label: string; units: number }[] {
  const isFx = (price?.instrument_type ?? 1) === 1;
  if (isFx) return [1_000, 10_000, 50_000, 100_000].map((u) => ({ label: lotLabel(u), units: u }));
  const base = Math.max(1, price?.base_unit_size ?? 1);
  return [1, 5, 10, 25].map((m) => ({ label: String(m), units: m * base }));
}

function lotStep(price: FxcmPrice | undefined): number {
  return (price?.instrument_type ?? 1) === 1 ? 1000 : Math.max(1, price?.base_unit_size ?? 1);
}

// ── Price rendering ──────────────────────────────────────────────────────────

function pipDecimals(pointSize: number | undefined, digits: number): number {
  if (!pointSize || pointSize <= 0) return digits;
  return Math.max(0, Math.round(-Math.log10(pointSize)));
}

// Pip-aware big-figure split (handle · big-pips · fractional-pip), driven by
// point_size so indices/stock-CFDs render right, not just 5dp FX.
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
  let seen = 0;
  let cut = 0;
  for (let i = rem.length - 1; i >= 0; i--) {
    if (rem[i] >= "0" && rem[i] <= "9") {
      seen++;
      if (seen === 2) { cut = i; break; }
    }
  }
  return { big: rem.slice(0, cut), pips: rem.slice(cut), frac };
}

function BigFig({
  value,
  digits,
  pointSize,
  size = 1,
}: {
  value: number | undefined;
  digits: number;
  pointSize: number | undefined;
  size?: number;
}) {
  const { big, pips, frac } = splitBigFig(value, digits, pointSize);
  return (
    <span className="mono" style={{ lineHeight: 1, whiteSpace: "nowrap", display: "inline-flex", alignItems: "baseline" }}>
      <span style={{ fontSize: 15 * size, opacity: 0.6 }}>{big}</span>
      <span style={{ fontSize: 26 * size, fontWeight: 600, letterSpacing: "-0.01em" }}>{pips}</span>
      {frac && <span style={{ fontSize: 12 * size, verticalAlign: "super", opacity: 0.7, marginLeft: 0.5 }}>{frac}</span>}
    </span>
  );
}

function spreadNum(bid: number | undefined, ask: number | undefined, pointSize: number | undefined): number {
  if (bid == null || ask == null || !pointSize) return 0;
  return (ask - bid) / pointSize;
}
function fmtSpreadNum(v: number): string {
  return v >= 100 ? v.toFixed(0) : v.toFixed(1);
}
function signed(n: number): string {
  return (n >= 0 ? "+" : "") + money(n);
}
function fmtUnits(n: number): string {
  return n >= 1000 ? `${n / 1000}K` : String(n);
}

// ── Flash (per the dealing-tile convention: mid-direction drives which side
// lights up, gated by a half-point dead-band so jitter doesn't strobe). ───────
function flashEpsilon(pointSize: number | undefined, digits: number): number {
  if (pointSize && pointSize > 0) return pointSize / 2;
  return 0.5 * 10 ** -digits;
}
function useTickFlash(value: number | undefined, eps: number): "up" | "dn" | null {
  const prev = useRef<number | undefined>(value);
  const [dir, setDir] = useState<"up" | "dn" | null>(null);
  useEffect(() => {
    if (value == null) return;
    const p = prev.current;
    if (p != null && Math.abs(value - p) >= eps) {
      setDir(value > p ? "up" : "dn");
      prev.current = value;
      const t = setTimeout(() => setDir(null), 360);
      return () => clearTimeout(t);
    }
    prev.current = value;
  }, [value, eps]);
  return dir;
}

function midOf(p: FxcmPrice | undefined): number | undefined {
  if (!p) return undefined;
  const bid = typeof p.bid === "number" ? p.bid : undefined;
  const ask = typeof p.ask === "number" ? p.ask : undefined;
  if (bid != null && ask != null) return (bid + ask) / 2;
  return bid ?? ask;
}

// ── Net position per instrument (fills collapsed to one side/size/avg) ────────

interface NetPos {
  side: "B" | "S";
  amount: number;
  avg: number;
  pl: number;
  pips: number;
  count: number;
  margin: number;
}

function netForSym(positions: FxcmPosition[], sym: string, price: FxcmPrice | undefined): NetPos | null {
  const ps = positions.filter((p) => String(p.instrument) === sym);
  if (!ps.length) return null;
  let buy = 0, sell = 0, costB = 0, costS = 0, pl = 0, margin = 0;
  for (const p of ps) {
    const amt = Number(p.amount ?? 0);
    const open = Number(p.open ?? p.open_rate ?? 0);
    pl += typeof p.pl === "number" ? p.pl : Number(p.gross_pl ?? 0);
    margin += Number((p.used_margin as number | undefined) ?? p.market_value ?? 0);
    if (p.buy_sell === "B") { buy += amt; costB += amt * open; }
    else { sell += amt; costS += amt * open; }
  }
  const net = buy - sell;
  const side: "B" | "S" = net >= 0 ? "B" : "S";
  const amount = Math.abs(net) || buy + sell;
  const avg = side === "B" ? costB / (buy || 1) : costS / (sell || 1);
  const ps_ = price?.point_size ?? 0;
  let pips = 0;
  if (price && ps_ > 0) {
    const out = side === "B" ? price.bid : price.ask;
    if (typeof out === "number") pips = ((out - avg) * (side === "B" ? 1 : -1)) / ps_;
  }
  return { side, amount, avg, pl, pips, count: ps.length, margin };
}

// ── Deal strip (selected instrument: Sell · spread · Buy) ─────────────────────

function DealStrip({
  price,
  digits,
  oneClick,
  armedSide,
  busyBuy,
  busySell,
  onRequest,
}: {
  price: FxcmPrice;
  digits: number;
  oneClick: boolean;
  armedSide: "B" | "S" | null;
  busyBuy: boolean;
  busySell: boolean;
  onRequest: (side: "B" | "S") => void;
}) {
  const flash = useTickFlash(midOf(price), flashEpsilon(price.point_size, digits));
  const [fired, setFired] = useState<"B" | "S" | null>(null);
  const spread = spreadNum(price.bid, price.ask, price.point_size);

  function click(side: "B" | "S") {
    onRequest(side);
    setFired(side);
    setTimeout(() => setFired((f) => (f === side ? null : f)), 400);
  }

  const Btn = ({ side }: { side: "B" | "S" }) => {
    const isBuy = side === "B";
    const px = isBuy ? price.ask : price.bid;
    const showTick = (isBuy && flash === "up") || (!isBuy && flash === "dn");
    const busy = isBuy ? busyBuy : busySell;
    return (
      <button
        type="button"
        onClick={() => click(side)}
        disabled={busy || px == null}
        className={`sc-deal ${isBuy ? "buy" : "sell"}${showTick ? " show-tick" : ""}${fired === side ? " sc-fired" : ""}`}
      >
        <span className="sc-deal-tick">{isBuy ? "▲" : "▼"}</span>
        <span className="sc-deal-lbl">{armedSide === side ? "Tap to confirm" : isBuy ? "Buy" : "Sell"}</span>
        <BigFig value={px} digits={digits} pointSize={price.point_size} size={0.92} />
      </button>
    );
  };

  return (
    <div className="sc-deal-row">
      <Btn side="S" />
      <div className="sc-deal-mid">
        <span className="num mono">{fmtSpreadNum(spread)}</span>
        <span className="lbl">spread</span>
        <span className="arm">{oneClick ? "1-click" : "confirm"}</span>
      </div>
      <Btn side="B" />
    </div>
  );
}

// ── Rate matrix row (select-only; bid/ask flash on mid direction) ─────────────

function RateRow({
  sym,
  price,
  net,
  selected,
  typicalSpread,
  onSelect,
  onRemove,
}: {
  sym: string;
  price: FxcmPrice;
  net: NetPos | null;
  selected: boolean;
  typicalSpread: number;
  onSelect: () => void;
  onRemove: () => void;
}) {
  const digits = price.digits ?? cfdDigits(sym);
  const flash = useTickFlash(midOf(price), flashEpsilon(price.point_size, digits));
  const spr = spreadNum(price.bid, price.ask, price.point_size);
  const sprCls = typicalSpread > 0 && spr <= typicalSpread * 0.9 ? "tight" : typicalSpread > 0 && spr >= typicalSpread * 1.12 ? "wide" : "";
  return (
    <div className={`sc-mx-row${selected ? " sel" : ""}`} onClick={onSelect}>
      <span className="sc-mx-sym">{sym}</span>
      <span className={`sc-q bid${flash === "dn" ? " flash-dn" : ""}`}>
        <BigFig value={price.bid} digits={digits} pointSize={price.point_size} size={0.6} />
      </span>
      <span className={`sc-mx-spread mono ${sprCls}`}>{fmtSpreadNum(spr)}</span>
      <span className={`sc-q ask${flash === "up" ? " flash-up" : ""}`}>
        <BigFig value={price.ask} digits={digits} pointSize={price.point_size} size={0.6} />
      </span>
      <span className="sc-mx-pl mono" style={{ color: net ? (net.pl >= 0 ? "var(--pos)" : "var(--neg)") : "var(--mute)" }}>
        {net ? signed(net.pl) : "·"}
      </span>
      <button
        type="button"
        className="sc-mx-x"
        title="Remove"
        onClick={(e) => { e.stopPropagation(); onRemove(); }}
      >
        ×
      </button>
    </div>
  );
}

// ── Position info pane ────────────────────────────────────────────────────────

function PositionInfo({
  sym,
  name,
  price,
  net,
  unitLabel,
  onReverse,
  onClose,
}: {
  sym: string;
  name: string;
  price: FxcmPrice | undefined;
  net: NetPos | null;
  unitLabel: string;
  onReverse: () => void;
  onClose: () => void;
}) {
  const digits = price?.digits ?? cfdDigits(sym);
  const fmt = (n: number | undefined) => (n == null ? "—" : n.toFixed(digits));
  const slPlaceholder =
    price && net
      ? (net.side === "B" ? (price.bid ?? 0) - 20 * (price.point_size ?? 0) : (price.ask ?? 0) + 20 * (price.point_size ?? 0)).toFixed(digits)
      : "";
  const tpPlaceholder =
    price && net
      ? (net.side === "B" ? (price.ask ?? 0) + 35 * (price.point_size ?? 0) : (price.bid ?? 0) - 35 * (price.point_size ?? 0)).toFixed(digits)
      : "";
  return (
    <div className="sc-pane sc-posinfo">
      <div className="sc-pane-head">Position · {sym || "—"}</div>
      {!net ? (
        <div className="sc-pi-empty">
          <span className="big">⚡</span>
          <div>No open position in <b style={{ color: "var(--text-2)" }}>{sym}</b></div>
          <div style={{ fontSize: 11 }}>Fire a Buy or Sell to open one.</div>
        </div>
      ) : (
        <div className="sc-pi-body">
          <div className="sc-pi-hero">
            <span className="sc-pi-sym">{sym}</span>
            <span className="sc-pi-name">{name}</span>
          </div>
          <div className="sc-pi-net">
            <span className={`sc-side-tag ${net.side === "B" ? "b" : "s"}`}>{net.side === "B" ? "LONG" : "SHORT"}</span>
            <div className="sc-pi-netmeta">
              <span className="a mono">{fmtUnits(net.amount)} {unitLabel}</span>
              <span className="b">{net.count > 1 ? `${net.count} fills · ` : ""}avg <span className="mono">{net.avg.toFixed(digits)}</span></span>
            </div>
            <div className="sc-pi-pl">
              <div className="v mono" style={{ color: net.pl >= 0 ? "var(--pos)" : "var(--neg)" }}>{signed(net.pl)}</div>
              <div className="p mono">{net.pips >= 0 ? "+" : ""}{net.pips.toFixed(1)} pips</div>
            </div>
          </div>
          <div className="sc-pi-grid">
            <div className="sc-pi-cell"><span className="k">Mark (bid)</span><span className="v mono">{fmt(price?.bid)}</span></div>
            <div className="sc-pi-cell"><span className="k">Mark (ask)</span><span className="v mono">{fmt(price?.ask)}</span></div>
            <div className="sc-pi-cell"><span className="k">Spread</span><span className="v mono">{fmtSpreadNum(spreadNum(price?.bid, price?.ask, price?.point_size))} pips</span></div>
            <div className="sc-pi-cell"><span className="k">Margin</span><span className="v mono">{money(net.margin)}</span></div>
          </div>
          <div className="sc-pi-sltp">
            <div className="lbl-row"><span>Risk bracket</span><span style={{ color: "var(--mute)" }}>visual stub</span></div>
            <div className="sc-field"><span className="tag sl">SL</span><input placeholder={slPlaceholder} /><span className="stub">−20p</span></div>
            <div className="sc-field"><span className="tag tp">TP</span><input placeholder={tpPlaceholder} /><span className="stub">+35p</span></div>
          </div>
          <div className="sc-pi-actions">
            <button type="button" className="sc-btn" onClick={onReverse}>Reverse</button>
            <button type="button" className="sc-btn danger" onClick={onClose}>Close {net.side === "B" ? "long" : "short"}</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Blotter ───────────────────────────────────────────────────────────────────

function Blotter({
  positions,
  priceMap,
  netPl,
  onSelect,
  onCloseOne,
  onFlattenAll,
}: {
  positions: FxcmPosition[];
  priceMap: Map<string, FxcmPrice>;
  netPl: number;
  onSelect: (sym: string) => void;
  onCloseOne: (tradeId: string) => void;
  onFlattenAll: () => void;
}) {
  return (
    <div className="sc-pane sc-blotter">
      <div className="sc-pane-head">
        Open Positions <span className="cnt">{positions.length}</span>
        <span className="grow" />
        <span className="mono" style={{ fontSize: 11, color: netPl >= 0 ? "var(--pos)" : "var(--neg)" }}>net {signed(netPl)}</span>
        {positions.length > 0 && (
          <button type="button" className="sc-flatten" onClick={onFlattenAll}>⚡ Flatten all</button>
        )}
      </div>
      <div className="sc-blot-wrap">
        {positions.length === 0 ? (
          <div className="sc-blot-empty">Flat — no open positions.</div>
        ) : (
          <>
            <div className="sc-blot-row head">
              <span />
              <span>Instr</span>
              <span>Side</span>
              <span style={{ textAlign: "right" }}>Size</span>
              <span style={{ textAlign: "right" }}>Open</span>
              <span style={{ textAlign: "right" }}>P/L</span>
              <span />
            </div>
            {positions.map((p) => {
              const sym = String(p.instrument ?? "");
              const digits = priceMap.get(sym)?.digits ?? cfdDigits(sym);
              const pl = typeof p.pl === "number" ? p.pl : Number(p.gross_pl ?? 0);
              const open = Number(p.open ?? p.open_rate ?? 0);
              const tid = String(p.trade_id ?? "");
              return (
                <div key={tid || Math.random()} className="sc-blot-row" style={{ cursor: "pointer" }} onClick={() => onSelect(sym)}>
                  <span className={`sc-side-tag ${p.buy_sell === "B" ? "b" : "s"}`} style={{ fontSize: 9, padding: "2px 5px" }}>{p.buy_sell}</span>
                  <span className="sc-blot-sym">{sym}</span>
                  <span style={{ color: "var(--text-2)" }}>{p.buy_sell === "B" ? "Long" : "Short"}</span>
                  <span className="mono" style={{ textAlign: "right" }}>{fmtUnits(Number(p.amount ?? 0))}</span>
                  <span className="mono" style={{ textAlign: "right", color: "var(--text-2)" }}>{open.toFixed(digits)}</span>
                  <span className="mono sc-blot-pl" style={{ color: pl >= 0 ? "var(--pos)" : "var(--neg)" }}>{signed(pl)}</span>
                  <button type="button" className="sc-blot-x" onClick={(e) => { e.stopPropagation(); onCloseOne(tid); }}>✕</button>
                </div>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

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
  const [oneClick, setOneClick] = useState(true);
  const [armedKey, setArmedKey] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const armTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dn = useFxcmDisplayNames();
  const unit = useFxcmUnderlyingUnit();
  const account = useFxcmAccount(!!bridgeOk).data ?? null;
  const watchlist = useFxcmWatchlistQuery(!!bridgeOk);
  const addMut = useFxcmWatchlistAdd();
  const removeMut = useFxcmWatchlistRemove();
  const submit = useFxcmSubmitOrder();
  const { theme, toggle: toggleTheme } = useTheme();

  const wlSymbols = useMemo(() => (watchlist.data ?? []).map((p) => p.instrument), [watchlist.data]);
  useFxcmView(wlSymbols, !!bridgeOk);

  useEffect(() => {
    let cancelled = false;
    api.getFxcmHealth().then(() => !cancelled && setBridgeOk(true)).catch(() => !cancelled && setBridgeOk(false));
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!bridgeOk) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const [pr, pos] = await Promise.all([api.getFxcmPrices(), api.getFxcmPositions()]);
        if (!cancelled) { setPrices(pr); setPositions(pos); }
      } catch { /* bridge blip — keep last frame */ }
    };
    tick();
    const id = setInterval(tick, POLL_INTERVAL_MS);
    return () => { cancelled = true; clearInterval(id); };
  }, [bridgeOk]);

  const priceMap = useMemo(() => {
    const m = new Map<string, FxcmPrice>();
    for (const p of watchlist.data ?? []) m.set(p.instrument, p);
    for (const p of prices) m.set(p.instrument, p);
    return m;
  }, [prices, watchlist.data]);

  const netPl = useMemo(
    () => positions.reduce((s, p) => s + (typeof p.pl === "number" ? p.pl : Number(p.gross_pl ?? 0)), 0),
    [positions],
  );

  useEffect(() => {
    if (!selected && wlSymbols.length > 0) { setSelected(wlSymbols[0]); onSelectSymbol?.(wlSymbols[0]); }
  }, [wlSymbols, selected]);

  function handleSelect(sym: string) {
    setSelected(sym);
    onSelectSymbol?.(sym);
  }

  async function refreshPositions() {
    try { setPositions(await api.getFxcmPositions()); } catch { /* leave stale */ }
  }

  function disarm() {
    if (armTimer.current) clearTimeout(armTimer.current);
    armTimer.current = null;
    setArmedKey(null);
  }

  async function placeOrder(instrument: string, side: "B" | "S", amountOverride?: number) {
    const price = priceMap.get(instrument);
    const step = lotStep(price);
    const units = amountOverride ?? lotPresetsFor(price)[lotLevel]?.units ?? step;
    const amount = Math.max(step, Math.round(units / step) * step);
    const key = `${instrument}:${side}`;
    setPending((p) => new Set(p).add(key));
    try {
      await submit.mutateAsync({ instrument, buy_sell: side, amount, order_type: "OM" });
      showToast(`${side === "B" ? "Bought" : "Sold"} ${amount.toLocaleString()} ${dn(instrument)}`, "success");
      await refreshPositions();
    } catch (e) {
      showToast(`Order failed: ${(e as Error).message}`, "error");
    } finally {
      setPending((p) => { const n = new Set(p); n.delete(key); return n; });
    }
  }

  function requestOrder(instrument: string, side: "B" | "S") {
    const key = `${instrument}:${side}`;
    if (oneClick) { placeOrder(instrument, side); return; }
    if (armedKey === key) { disarm(); placeOrder(instrument, side); return; }
    if (armTimer.current) clearTimeout(armTimer.current);
    setArmedKey(key);
    armTimer.current = setTimeout(() => setArmedKey(null), ARM_TTL_MS);
  }

  async function flattenSym(sym: string) {
    const ids = positions.filter((p) => String(p.instrument) === sym).map((p) => String(p.trade_id ?? ""));
    let failed = 0;
    for (const id of ids) {
      try { await api.closeFxcmPosition(id); } catch { failed++; }
    }
    await refreshPositions();
    if (failed) showToast(`Couldn't close ${failed} position${failed === 1 ? "" : "s"}`, "error");
  }

  async function flattenAll() {
    let failed = 0;
    for (const p of positions) {
      try { await api.closeFxcmPosition(String(p.trade_id ?? "")); } catch { failed++; }
    }
    await refreshPositions();
    showToast(failed ? `Closed all but ${failed}` : "Flattened all positions", failed ? "error" : "info");
  }

  async function closeOne(tradeId: string) {
    try { await api.closeFxcmPosition(tradeId); showToast("Position closed", "success"); await refreshPositions(); }
    catch (e) { showToast(`Close failed: ${(e as Error).message}`, "error"); }
  }

  async function reverseSym(sym: string) {
    const net = netForSym(positions, sym, priceMap.get(sym));
    if (!net) return;
    await flattenSym(sym);
    await placeOrder(sym, net.side === "B" ? "S" : "B", net.amount);
    showToast(`Reversed ${dn(sym)}`, "info");
  }

  function handleAdd(instrument: string) {
    setAdding(false);
    addMut.mutate(instrument, {
      onError: (e) => showToast(`Couldn't add ${instrument}: ${(e as Error).message}`, "error"),
    });
  }

  function handleRemove(instrument: string) {
    removeMut.mutate(instrument, {
      onSuccess: () => { if (selected === instrument) setSelected(""); },
      onError: (e) => showToast(`Couldn't remove ${instrument}: ${(e as Error).message}`, "error"),
    });
  }

  // Hotkeys: B buy · S sell · F flatten (selected) · Space confirm an armed order.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (!selected) return;
      const k = e.key.toLowerCase();
      if (k === "b") { e.preventDefault(); requestOrder(selected, "B"); }
      else if (k === "s") { e.preventDefault(); requestOrder(selected, "S"); }
      else if (k === "f") { e.preventDefault(); flattenSym(selected); }
      else if (e.key === " " && armedKey) {
        e.preventDefault();
        const [sym, side] = armedKey.split(":");
        disarm();
        placeOrder(sym, side as "B" | "S");
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, armedKey, oneClick, lotLevel, positions, priceMap]);

  useEffect(() => () => { if (armTimer.current) clearTimeout(armTimer.current); }, []);

  if (bridgeOk === false) {
    return (
      <div className="max-w-[1680px] mx-auto px-4 pt-4">
        <div className="rounded-card p-4 text-[12.5px]" style={{ background: "var(--neg-bg)", border: "1px solid color-mix(in oklch, var(--neg) 30%, transparent)", color: "var(--neg)" }}>
          <strong>Bridge offline.</strong> The FXCM FCLite bridge isn't responding — scalp mode needs the live price feed. Refresh in a minute.
        </div>
      </div>
    );
  }

  const selectedPrice = priceMap.get(selected);
  const selDigits = selectedPrice?.digits ?? cfdDigits(selected);
  const selectedPresets = lotPresetsFor(selectedPrice);
  const selNet = selectedPrice ? netForSym(positions, selected, selectedPrice) : null;

  return (
    <div className="sc-root sc-cockpit max-w-[1680px] mx-auto" style={{ padding: "12px 12px 48px" }} data-theme={theme}>
      {/* Top bar */}
      <div className="sc-bar">
        <span className="sc-brand"><span className="bolt">⚡</span> Scalp</span>
        <span className="sc-live"><span className="dot" /> Live</span>
        <span className="sc-div" />
        <span className="sc-stat"><span className="sc-stat-lbl">Equity</span><span className="sc-stat-val mono">{money(account?.equity ?? account?.balance ?? 0)}</span></span>
        <span className="sc-stat"><span className="sc-stat-lbl">Free margin</span><span className="sc-stat-val mono">{money(Math.max(0, (account?.equity ?? 0) - (account?.usedmargin ?? 0)))}</span></span>
        <span className="sc-stat"><span className="sc-stat-lbl">Open P/L</span><span className="sc-stat-val mono" style={{ color: netPl >= 0 ? "var(--pos)" : "var(--neg)" }}>{signed(netPl)}</span></span>
        <span className="sc-div" />
        <span className="sc-kbd">B buy · S sell · F flatten · ⎵ confirm</span>
        <span className="grow" style={{ flex: 1 }} />
        <div className="sc-lots">
          <span className="lbl">Size</span>
          {selectedPresets.map((preset, i) => (
            <button key={i} type="button" className={`sc-lot${lotLevel === i ? " on" : ""}`} onClick={() => setLotLevel(i as LotLevel)}>{preset.label}</button>
          ))}
        </div>
        <button
          type="button"
          className={`sc-oneclick${oneClick ? " on" : ""}`}
          onClick={() => { setOneClick((v) => !v); disarm(); }}
          title={oneClick ? "1-click ON — orders fire immediately" : "Confirm — click then confirm"}
          aria-pressed={oneClick}
        >
          <span className="tog"><span className="knob" /></span>{oneClick ? "1-click" : "Confirm"}
        </button>
        <button type="button" className="sc-iconbtn" title="Toggle theme" onClick={toggleTheme}>{theme === "dark" ? "☾" : "☀"}</button>
      </div>

      {/* Main 3-pane grid */}
      <div className="sc-grid">
        {/* Rate matrix */}
        <div className="sc-pane">
          <div className="sc-pane-head">Rate Matrix <span className="cnt">{wlSymbols.length}</span></div>
          <div className="sc-mx-grid">
            <div className="sc-mx-row head">
              <span>Instr</span>
              <span style={{ textAlign: "center" }}>Sell</span>
              <span style={{ textAlign: "center" }}>Spr</span>
              <span style={{ textAlign: "center" }}>Buy</span>
              <span style={{ textAlign: "right" }}>P/L</span>
              <span />
            </div>
            {watchlist.isPending ? (
              <div className="sc-blot-empty">Loading instruments…</div>
            ) : (
              wlSymbols.map((sym) => {
                const price = priceMap.get(sym);
                if (!price) return null;
                return (
                  <RateRow
                    key={sym}
                    sym={sym}
                    price={price}
                    net={netForSym(positions, sym, price)}
                    selected={sym === selected}
                    typicalSpread={spreadNum(price.bid, price.ask, price.point_size)}
                    onSelect={() => handleSelect(sym)}
                    onRemove={() => handleRemove(sym)}
                  />
                );
              })
            )}
            {adding ? (
              <div style={{ padding: "8px 12px" }}>
                <AssetSearch variant="inline" align="left" fluid autoFocus assetClass="" source="fxcm" onChoose={handleAdd} disabled={addMut.isPending} />
              </div>
            ) : (
              <div className="sc-add" onClick={() => setAdding(true)}>+ Add instrument</div>
            )}
          </div>
        </div>

        {/* Center: chart (drives the action) + deal strip */}
        <div className="sc-center">
          <div className="sc-chart-host">
            {selected && selectedPrice ? (
              <CfdPriceChart instrument={selected} livePrice={selectedPrice} onOpenChart={onOpenChart} defaultTimeframe="m1" barsToShow={90} />
            ) : (
              <div className="sc-pane" style={{ flex: 1, alignItems: "center", justifyContent: "center", color: "var(--mute)", fontSize: 13 }}>
                Pick an instrument to chart.
              </div>
            )}
          </div>
          {selected && selectedPrice && (
            <div className="sc-deal-card">
              <DealStrip
                price={selectedPrice}
                digits={selDigits}
                oneClick={oneClick}
                armedSide={armedKey === `${selected}:B` ? "B" : armedKey === `${selected}:S` ? "S" : null}
                busyBuy={pending.has(`${selected}:B`)}
                busySell={pending.has(`${selected}:S`)}
                onRequest={(side) => requestOrder(selected, side)}
              />
            </div>
          )}
        </div>

        {/* Right: position info */}
        <PositionInfo
          sym={selected}
          name={dn(selected) !== selected ? dn(selected) : ""}
          price={selectedPrice}
          net={selNet}
          unitLabel={unit(selected)}
          onReverse={() => reverseSym(selected)}
          onClose={() => flattenSym(selected)}
        />
      </div>

      {/* Blotter */}
      <Blotter
        positions={positions}
        priceMap={priceMap}
        netPl={netPl}
        onSelect={handleSelect}
        onCloseOne={closeOne}
        onFlattenAll={flattenAll}
      />

      {/* Price alerts — kept from the prior build; engine runs globally in App. */}
      <CfdAlertsPanel instrument={selected} currentPrice={midOf(selectedPrice)} digits={selDigits} />
    </div>
  );
}
