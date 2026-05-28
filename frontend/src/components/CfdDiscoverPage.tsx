import { useEffect, useMemo, useState } from "react";
import * as api from "../api";
import type { FxcmAccount, FxcmPosition, FxcmPrice } from "../types";
import { money } from "../lib/format";
import { fxcmCountrySet } from "../lib/fxcm-countries";
import {
  useEconomicCalendar,
  useFxcmBars,
  useFxcmInstruments,
  useFxcmWatchlistAdd,
  useFxcmWatchlistQuery,
  useFxcmWatchlistRemove,
} from "../data/hooks";
import { AddSymbolTile } from "./discover/AddSymbolTile";
import { CardsRow } from "./discover/CardsRow";
import { EconomicCard } from "./discover/EconomicCard";
import { SparkCard, SparkCardSkeleton } from "./discover/SparkCard";
import { showToast } from "../lib/toast";
import SectionHeading from "./SectionHeading";
import FxcmOrderSheet from "./trade/FxcmOrderSheet";
import CfdPriceChart from "./CfdPriceChart";
import { useMobile } from "../hooks/useMobile";

// CFD-specific price formatter — per-type digit precision. JPY pairs 3dp,
// metals 4dp, indices 1dp, stock-CFDs 2dp, everything else 5dp.
function fmtCfdPrice(price: number | undefined, symbol?: string): string {
  if (price == null || isNaN(price)) return "—";
  const sym = symbol ?? "";
  if (/\.[a-z]{2,3}$/i.test(sym)) return price.toFixed(2);
  if (sym.includes("JPY")) return price.toFixed(3);
  if (/^XA[GU]\//.test(sym)) return price.toFixed(4);
  if (sym.includes("/")) return price.toFixed(5);
  return price.toFixed(1);
}

function fmtPl(pl: number | undefined): string {
  if (pl == null || isNaN(pl)) return "—";
  const sign = pl >= 0 ? "+" : "";
  return `${sign}${money(pl)}`;
}

// ── Account hero ───────────────────────────────────────────────────────────────

function FxcmAccountHero({ account }: { account: FxcmAccount | null }) {
  if (!account) {
    return (
      <div
        className="w-full rounded-card-lg p-6 animate-pulse"
        style={{
          background: "var(--panel)",
          border: "1px solid var(--border)",
          boxShadow: "var(--shadow-sm)",
          minHeight: 120,
        }}
      />
    );
  }

  const balance = typeof account.balance === "number" ? account.balance : 0;
  const equity = typeof account.equity === "number" ? account.equity : balance;
  const usedMargin = typeof account.usedmargin === "number" ? account.usedmargin : 0;
  const dayPl = typeof account.day_pl === "number" ? account.day_pl : 0;
  const dayUp = dayPl >= 0;

  return (
    <div
      className="w-full rounded-card-lg p-6 flex flex-col gap-4"
      style={{
        background: "var(--panel)",
        border: "1px solid var(--border)",
        boxShadow: "var(--shadow-sm)",
      }}
    >
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex flex-col gap-1">
          <span className="text-[12px]" style={{ color: "var(--mute)" }}>
            FXCM demo account equity
          </span>
          <span
            className="font-semibold tabular-nums"
            style={{ fontSize: "clamp(28px, 4vw, 36px)", lineHeight: 1 }}
          >
            {money(equity)}
          </span>
        </div>
        <span
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-[12.5px] font-medium tabular-nums"
          style={{
            background: dayUp ? "var(--pos-bg)" : "var(--neg-bg)",
            color: dayUp ? "var(--pos)" : "var(--neg)",
          }}
        >
          {dayUp ? "↑" : "↓"} {fmtPl(dayPl)} today
        </span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <div className="flex flex-col">
          <small className="text-[12px]" style={{ color: "var(--mute)" }}>Balance</small>
          <strong className="font-medium text-[15px] tabular-nums">{money(balance)}</strong>
        </div>
        <div className="flex flex-col">
          <small className="text-[12px]" style={{ color: "var(--mute)" }}>Used margin</small>
          <strong className="font-medium text-[15px] tabular-nums">{money(usedMargin)}</strong>
        </div>
        <div className="flex flex-col">
          <small className="text-[12px]" style={{ color: "var(--mute)" }}>Free margin</small>
          <strong className="font-medium text-[15px] tabular-nums">
            {money(Math.max(0, equity - usedMargin))}
          </strong>
        </div>
      </div>
    </div>
  );
}

// ── Status badge ───────────────────────────────────────────────────────────────

function BridgeStatus({ ok }: { ok: boolean | null }) {
  const label = ok === null ? "Connecting…" : ok ? "Bridge connected" : "Bridge offline";
  const color = ok === null ? "var(--mute)" : ok ? "var(--pos)" : "var(--neg)";
  return (
    <span
      className="inline-flex items-center gap-1.5 text-[11.5px] font-medium"
      style={{ color }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: 99,
          background: color,
          display: "inline-block",
        }}
      />
      {label}
    </span>
  );
}

// ── Watchlist card ────────────────────────────────────────────────────────────
// Per-instrument SparkCard wrapper — pulls D1 bars for the sparkline via its
// own useFxcmBars query so each card refreshes independently (React Query
// dedupes + caches automatically). The CFD silo's bridge has no batch bars
// endpoint, so fan-out per card is the right shape.

function CfdWatchlistCard({
  instrument,
  livePrice,
  selected,
  onSelect,
  onRemove,
}: {
  instrument: string;
  livePrice?: FxcmPrice;
  selected: boolean;
  onSelect: () => void;
  onRemove: () => void;
}) {
  const { data: bars } = useFxcmBars(instrument, "D1");
  const closes = useMemo(() => (bars ?? []).map((b) => b.close), [bars]);

  // Live price prefers the polled bid+ask mid; falls back to the last D1
  // close. Day change derives from the second-to-last D1 close so it's
  // stable regardless of intraday tick noise.
  const bid = livePrice?.bid as number | undefined;
  const ask = livePrice?.ask as number | undefined;
  const mid =
    bid != null && ask != null
      ? (bid + ask) / 2
      : bid ?? ask ?? closes[closes.length - 1] ?? 0;
  const prev = closes.length >= 2 ? closes[closes.length - 2] : 0;
  const changePct = prev > 0 ? (mid - prev) / prev : 0;

  return (
    <SparkCard
      symbol={instrument}
      name={livePrice?.display_name && livePrice.display_name !== instrument
        ? livePrice.display_name
        : ""}
      price={mid}
      changePct={changePct}
      selected={selected}
      onSelect={onSelect}
      onRemove={onRemove}
      closes={closes.length >= 2 ? closes : undefined}
      formatPrice={(n) => fmtCfdPrice(n, instrument)}
    />
  );
}

// ── Positions panel ────────────────────────────────────────────────────────────

function FxcmPositions({
  positions,
  prices,
  onClose,
}: {
  positions: FxcmPosition[];
  prices: Map<string, FxcmPrice>;
  onClose: (tradeId: string | number) => void;
}) {
  const [closing, setClosing] = useState<string | null>(null);

  if (positions.length === 0) {
    return (
      <div className="px-4 py-6 text-center text-[13px]" style={{ color: "var(--mute)" }}>
        No open positions
      </div>
    );
  }

  async function handleClose(tradeId: string | number) {
    setClosing(String(tradeId));
    try {
      await onClose(tradeId);
    } finally {
      setClosing(null);
    }
  }

  return (
    <div>
      {positions.map((pos) => {
        const tid = String(pos.trade_id ?? pos.offer_id ?? Math.random());
        const instrument = String(pos.instrument ?? "");
        const current = prices.get(instrument);
        const currentRate = pos.buy_sell === "B" ? current?.bid : current?.ask;
        const openRate = pos.open ?? pos.open_rate;
        const pl = typeof pos.pl === "number" ? pos.pl : (typeof pos.gross_pl === "number" ? pos.gross_pl : 0);
        const plUp = pl >= 0;

        return (
          <div
            key={tid}
            className="flex items-center px-4 py-3 gap-3 flex-wrap"
            style={{ borderBottom: "1px solid var(--hairline)" }}
          >
            <div className="flex flex-col min-w-0 flex-1">
              <span className="text-[13px] font-semibold">{instrument}</span>
              <span className="text-[11px]" style={{ color: "var(--mute)" }}>
                {pos.buy_sell === "B" ? "Buy" : "Sell"} · {pos.amount ?? "—"} units
              </span>
            </div>
            <div className="flex gap-4 tabular-nums text-[12px]">
              <div className="flex flex-col items-end">
                <span style={{ color: "var(--mute)", fontSize: 10 }}>Open</span>
                <span>{fmtCfdPrice(typeof openRate === "number" ? openRate : undefined, instrument)}</span>
              </div>
              <div className="flex flex-col items-end">
                <span style={{ color: "var(--mute)", fontSize: 10 }}>Current</span>
                <span>{fmtCfdPrice(currentRate, instrument)}</span>
              </div>
              <div className="flex flex-col items-end">
                <span style={{ color: "var(--mute)", fontSize: 10 }}>P&amp;L</span>
                <span style={{ color: plUp ? "var(--pos)" : "var(--neg)", fontWeight: 600 }}>
                  {fmtPl(pl)}
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => handleClose(tid)}
              disabled={closing === tid}
              className="text-[11.5px] font-medium px-2.5 py-1 rounded border cursor-pointer"
              style={{
                background: "var(--neg-bg)",
                borderColor: "color-mix(in oklch, var(--neg) 30%, transparent)",
                color: "var(--neg)",
                opacity: closing === tid ? 0.5 : 1,
              }}
            >
              {closing === tid ? "Closing…" : "Close"}
            </button>
          </div>
        );
      })}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

const POLL_INTERVAL_MS = 3000;

interface CfdDiscoverPageProps {
  onSelectSymbol?: (symbol: string) => void;
  onOpenChart?: () => void;
}

export default function CfdDiscoverPage({ onSelectSymbol, onOpenChart }: CfdDiscoverPageProps) {
  const [bridgeOk, setBridgeOk] = useState<boolean | null>(null);
  const [account, setAccount] = useState<FxcmAccount | null>(null);
  // Live FXCM offers, polled at 3 s. Drives positions enrichment + the order
  // sheet's instrument picker. The watchlist itself is a separate FXCM-side
  // resource (see useFxcmWatchlistQuery below).
  const [prices, setPrices] = useState<FxcmPrice[]>([]);
  const [positions, setPositions] = useState<FxcmPosition[]>([]);
  const [orderSheetOpen, setOrderSheetOpen] = useState(false);
  // Inline chart selection. Watchlist clicks update it; the "Open ↗" button
  // on the chart card jumps to full Chart mode via onOpenChart.
  const [selected, setSelected] = useState<string>("");
  const isMobile = useMobile();

  // User's FXCM watchlist (Endpoints-suite, JWT-backed). Find-or-create on
  // the backend resolves which one to pin; we just speak in instrument names.
  const watchlist = useFxcmWatchlistQuery(!!bridgeOk);
  const addMut = useFxcmWatchlistAdd();
  const removeMut = useFxcmWatchlistRemove();

  // Economic calendar — filtered to every country represented in the FXCM
  // product list (not just our watchlist pairs), so adding indices / stock
  // CFDs / new pairs to the bridge widens coverage automatically.
  const instruments = useFxcmInstruments(!!bridgeOk);
  const countries = useMemo(
    () => fxcmCountrySet((instruments.data ?? []).map((i) => i.instrument)),
    [instruments.data],
  );
  const economic = useEconomicCalendar(countries, countries.length > 0);

  // Health check + initial load
  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        await api.getFxcmHealth();
        if (!cancelled) setBridgeOk(true);
      } catch {
        if (!cancelled) setBridgeOk(false);
        return;
      }

      try {
        const [acct, pr, pos] = await Promise.all([
          api.getFxcmAccount(),
          api.getFxcmPrices(),
          api.getFxcmPositions(),
        ]);
        if (!cancelled) {
          setAccount(acct);
          setPrices(pr);
          setPositions(pos);
        }
      } catch { /* non-fatal — leave blank hero */ }
    }

    init();
    return () => { cancelled = true; };
  }, []);

  // Live price + position polling — 3 s. Uses /api/fxcm/prices for the full
  // offer feed (positions enrichment + order sheet picker need all symbols,
  // not just the watchlist subset).
  useEffect(() => {
    if (!bridgeOk) return;
    const tick = async () => {
      try {
        const [pr, pos] = await Promise.all([
          api.getFxcmPrices(),
          api.getFxcmPositions(),
        ]);
        setPrices(pr);
        setPositions(pos);
      } catch { /* bridge went away — leave last data visible */ }
    };
    const id = setInterval(tick, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [bridgeOk]);

  const priceMap = useMemo(() => {
    const m = new Map<string, FxcmPrice>();
    for (const p of prices) m.set(p.instrument, p);
    return m;
  }, [prices]);

  const wlSymbols = useMemo(
    () => (watchlist.data ?? []).map((p) => p.instrument),
    [watchlist.data],
  );

  async function handleClosePosition(tradeId: string | number) {
    await api.closeFxcmPosition(tradeId);
    try {
      const pos = await api.getFxcmPositions();
      setPositions(pos);
    } catch { /* leave stale */ }
  }

  // Seed the inline chart with the first watchlist symbol once it resolves,
  // mirroring how stocks/crypto Discover auto-picks the first row on load.
  useEffect(() => {
    if (!selected && wlSymbols.length > 0) {
      setSelected(wlSymbols[0]);
    }
  }, [wlSymbols, selected]);

  function handleSelectSymbol(instrument: string) {
    setSelected(instrument);
    // Bubble up so App-level state stays in sync (e.g. for the header
    // chart-mode prefetch). No jump to Chart mode here — explicit via
    // "Open ↗" on the chart card.
    onSelectSymbol?.(instrument);
  }

  function handleOpenChart() {
    if (selected) onSelectSymbol?.(selected);
    onOpenChart?.();
  }

  function handleAdd(instrument: string) {
    addMut.mutate(instrument, {
      onError: (e) => showToast(`Couldn't add ${instrument}: ${(e as Error).message}`, "error"),
    });
  }

  function handleRemove(instrument: string) {
    removeMut.mutate(instrument, {
      onError: (e) => showToast(`Couldn't remove ${instrument}: ${(e as Error).message}`, "error"),
    });
  }

  return (
    <div className="max-w-[900px] mx-auto px-4 pt-4 pb-20 flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-0.5">
          <h2 className="text-[18px] font-semibold" style={{ letterSpacing: "-0.01em" }}>
            CFDs
          </h2>
          <span className="text-[12px]" style={{ color: "var(--mute)" }}>
            FXCM ForexConnect — demo account
          </span>
        </div>
        <div className="flex items-center gap-3">
          {bridgeOk && (
            <button
              type="button"
              onClick={() => setOrderSheetOpen(true)}
              className="text-[12.5px] font-semibold px-3 py-1.5 rounded-card border-0 cursor-pointer"
              style={{
                background: "var(--accent)",
                color: "var(--bg)",
              }}
            >
              + New Order
            </button>
          )}
          <BridgeStatus ok={bridgeOk} />
        </div>
      </div>

      {/* Account hero */}
      <FxcmAccountHero account={account} />

      {/* Positions */}
      {bridgeOk && (
        <div
          style={{
            background: "var(--panel)",
            border: "1px solid var(--border)",
            borderRadius: "var(--r)",
            boxShadow: "var(--shadow-sm)",
            overflow: "hidden",
          }}
        >
          <div
            className="px-4 py-3 flex items-center justify-between"
            style={{ borderBottom: "1px solid var(--hairline)" }}
          >
            <span className="text-[13px] font-semibold">Open Positions</span>
            {positions.length > 0 && (
              <span
                className="inline-flex items-center justify-center text-[10.5px] font-semibold tabular-nums rounded-full px-2"
                style={{ background: "var(--accent-bg)", color: "var(--accent)", minWidth: 20, height: 18 }}
              >
                {positions.length}
              </span>
            )}
          </div>
          <FxcmPositions
            positions={positions}
            prices={priceMap}
            onClose={handleClosePosition}
          />
        </div>
      )}

      {/* Watchlist — SparkCard grid + AddSymbolTile, mirroring stocks/crypto
         Discover. Per-card sparkline pulls D1 bars from /api/fxcm/history. */}
      {bridgeOk && (
        <div className="flex flex-col gap-3">
          <SectionHeading
            label="Watchlist"
            ctxRight={
              watchlist.isPending
                ? "loading…"
                : `${wlSymbols.length} instrument${wlSymbols.length === 1 ? "" : "s"}`
            }
          />
          {watchlist.isPending ? (
            <CardsRow>
              {Array.from({ length: 6 }).map((_, i) => (
                <SparkCardSkeleton key={i} />
              ))}
            </CardsRow>
          ) : (
            <CardsRow>
              {wlSymbols.map((sym) => (
                <CfdWatchlistCard
                  key={sym}
                  instrument={sym}
                  livePrice={priceMap.get(sym)}
                  selected={sym === selected}
                  onSelect={() => handleSelectSymbol(sym)}
                  onRemove={() => handleRemove(sym)}
                />
              ))}
              <AddSymbolTile
                assetClass="cfd"
                isCrypto={false}
                isMobile={isMobile}
                disabled={addMut.isPending}
                source="fxcm"
                onChoose={handleAdd}
                onMobileTap={() => {
                  /* TODO: mobile add-sheet — Phase 2; desktop inline works
                     today and falls through to no-op on mobile. */
                }}
              />
            </CardsRow>
          )}
        </div>
      )}

      {/* Inline chart — mirrors stocks/crypto Discover's ChartCard, pulling
         OHLCV from /api/fxcm/history and the live tip from /api/fxcm/prices. */}
      {bridgeOk && selected && (
        <div
          className="p-[20px_24px]"
          style={{
            background: "var(--panel)",
            border: "1px solid var(--border)",
            borderRadius: "var(--r-lg)",
            boxShadow: "var(--shadow-sm)",
          }}
        >
          <CfdPriceChart
            instrument={selected}
            livePrice={priceMap.get(selected)}
            onOpenChart={onOpenChart ? handleOpenChart : undefined}
          />
        </div>
      )}

      {/* Economic calendar — filtered to every country in the FXCM universe */}
      {bridgeOk && economic.data?.economic && economic.data.economic.length > 0 && (
        <div className="flex flex-col gap-3">
          <SectionHeading label="Economic calendar" />
          <EconomicCard rows={economic.data.economic} />
        </div>
      )}

      {/* Offline notice */}
      {bridgeOk === false && (
        <div
          className="rounded-card p-4 text-[12.5px]"
          style={{
            background: "var(--neg-bg)",
            border: "1px solid color-mix(in oklch, var(--neg) 30%, transparent)",
            color: "var(--neg)",
          }}
        >
          <strong>Bridge offline.</strong> The FXCM FCLite bridge isn't
          responding. The Render service may be restarting or the FXCM
          session may have dropped — refresh in a minute. If it persists,
          check the Render logs.
        </div>
      )}

      {/* Order sheet — sources from the full /api/fxcm/prices feed so the
         picker covers every instrument, not just the watchlist subset. */}
      {orderSheetOpen && (
        <FxcmOrderSheet
          instruments={prices}
          onClose={() => setOrderSheetOpen(false)}
          onSubmitted={() => {
            api.getFxcmPositions().then(setPositions).catch(() => {});
          }}
        />
      )}
    </div>
  );
}
