import { useEffect, useMemo, useState } from "react";
import * as api from "../api";
import type { FxcmAccount, FxcmPosition, FxcmPrice } from "../types";
import { money } from "../lib/format";
import { fxcmCountrySet } from "../lib/fxcm-countries";
import { useEconomicCalendar, useFxcmInstruments } from "../data/hooks";
import { EconomicCard } from "./discover/EconomicCard";
import SectionHeading from "./SectionHeading";
import FxcmOrderSheet from "./trade/FxcmOrderSheet";
import CfdPriceChart from "./CfdPriceChart";

// CFD-specific price formatter: 5 decimal places for most pairs, 3 for JPY
function fmtFxPrice(price: number | undefined, symbol?: string): string {
  if (price == null || isNaN(price)) return "—";
  const isJpy = symbol?.includes("JPY");
  return price.toFixed(isJpy ? 3 : 5);
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

// ── Price row ──────────────────────────────────────────────────────────────────

function PriceRow({ price, prev }: { price: FxcmPrice; prev?: FxcmPrice }) {
  const bid = price.bid as number | undefined;
  const ask = price.ask as number | undefined;
  const prevBid = prev?.bid as number | undefined;
  const spread = bid != null && ask != null ? ask - bid : null;
  const moved = prevBid != null && bid != null && prevBid !== bid;
  const up = moved && bid! > prevBid!;

  return (
    <div
      className="flex items-center px-4 py-3 gap-4"
      style={{ borderBottom: "1px solid var(--hairline)" }}
    >
      <div className="flex flex-col min-w-0 flex-1">
        <span className="text-[14px] font-semibold" style={{ color: "var(--text)" }}>
          {price.instrument}
        </span>
        {price.display_name && price.display_name !== price.instrument && (
          <span className="text-[11px]" style={{ color: "var(--mute)" }}>
            {price.display_name}
          </span>
        )}
      </div>
      <div className="flex gap-6 tabular-nums text-[13px]">
        <div className="flex flex-col items-end">
          <span style={{ color: "var(--mute)", fontSize: 11 }}>Bid</span>
          <span
            style={{
              color: moved ? (up ? "var(--pos)" : "var(--neg)") : "var(--text)",
              fontWeight: 600,
              transition: "color 0.4s",
            }}
          >
            {fmtFxPrice(bid, price.instrument)}
          </span>
        </div>
        <div className="flex flex-col items-end">
          <span style={{ color: "var(--mute)", fontSize: 11 }}>Ask</span>
          <span style={{ color: "var(--text)", fontWeight: 600 }}>
            {fmtFxPrice(ask, price.instrument)}
          </span>
        </div>
        {spread != null && (
          <div className="flex flex-col items-end">
            <span style={{ color: "var(--mute)", fontSize: 11 }}>Spread</span>
            <span style={{ color: "var(--mute)" }}>
              {(spread * (price.instrument?.includes("JPY") ? 1000 : 100000)).toFixed(1)}p
            </span>
          </div>
        )}
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
        const isJpy = instrument.includes("JPY");
        const dec = isJpy ? 3 : 5;

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
                <span>{typeof openRate === "number" ? openRate.toFixed(dec) : "—"}</span>
              </div>
              <div className="flex flex-col items-end">
                <span style={{ color: "var(--mute)", fontSize: 10 }}>Current</span>
                <span>{currentRate != null ? currentRate.toFixed(dec) : "—"}</span>
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
  const [prices, setPrices] = useState<FxcmPrice[]>([]);
  const [prevPrices, setPrevPrices] = useState<Map<string, FxcmPrice>>(new Map());
  const [positions, setPositions] = useState<FxcmPosition[]>([]);
  const [orderSheetOpen, setOrderSheetOpen] = useState(false);
  // Inline chart selection — seeded from the first watchlist row once it
  // resolves. Watchlist clicks update this; the "Open ↗" button on the
  // chart card jumps to full Chart mode via onOpenChart.
  const [selected, setSelected] = useState<string>("");

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
        const [acct, wl, pos] = await Promise.all([
          api.getFxcmAccount(),
          api.getFxcmWatchlist(),
          api.getFxcmPositions(),
        ]);
        if (!cancelled) {
          setAccount(acct);
          setPrices(wl);
          setPositions(pos);
        }
      } catch { /* non-fatal — leave blank hero */ }
    }

    init();
    return () => { cancelled = true; };
  }, []);

  // Live price + position polling
  useEffect(() => {
    if (!bridgeOk) return;
    const tick = async () => {
      try {
        const [wl, pos] = await Promise.all([
          api.getFxcmWatchlist(),
          api.getFxcmPositions(),
        ]);
        setPrices((prev) => {
          const map = new Map<string, FxcmPrice>();
          for (const p of prev) map.set(p.instrument, p);
          setPrevPrices(map);
          return wl;
        });
        setPositions(pos);
      } catch { /* bridge went away — leave last data visible */ }
    };
    const id = setInterval(tick, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [bridgeOk]);

  const priceMap = new Map<string, FxcmPrice>();
  for (const p of prices) priceMap.set(p.instrument, p);

  async function handleClosePosition(tradeId: string | number) {
    await api.closeFxcmPosition(tradeId);
    // Refresh positions after close
    try {
      const pos = await api.getFxcmPositions();
      setPositions(pos);
    } catch { /* leave stale */ }
  }

  // Seed the inline chart with the first watchlist row once prices land,
  // mirroring how stocks/crypto Discover auto-picks the first watchlist
  // symbol on first load.
  useEffect(() => {
    if (!selected && prices.length > 0) {
      setSelected(prices[0].instrument);
    }
  }, [prices, selected]);

  function handleSelectPair(instrument: string) {
    setSelected(instrument);
    // Bubble the choice up so App-level state stays in sync (e.g. for the
    // header chart-mode prefetch). No jump to Chart mode here — the user
    // navigates there explicitly via "Open ↗" on the chart card.
    onSelectSymbol?.(instrument);
  }

  function handleOpenChart() {
    if (selected) onSelectSymbol?.(selected);
    onOpenChart?.();
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

      {/* Watchlist */}
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
          <span className="text-[13px] font-semibold">Major pairs</span>
          <span className="text-[11.5px]" style={{ color: "var(--mute)" }}>
            Live · {POLL_INTERVAL_MS / 1000}s
          </span>
        </div>

        {bridgeOk === false ? (
          <div className="px-4 py-8 text-center text-[13px]" style={{ color: "var(--mute)" }}>
            FXCM bridge is unreachable. Try again in a moment.
          </div>
        ) : prices.length === 0 ? (
          <div className="px-4 py-8 text-center text-[13px]" style={{ color: "var(--mute)" }}>
            {bridgeOk === null ? "Connecting to bridge…" : "No price data yet"}
          </div>
        ) : (
          prices.map((p) => (
            <div
              key={p.instrument}
              onClick={() => handleSelectPair(p.instrument)}
              style={{
                cursor: "pointer",
                background:
                  p.instrument === selected
                    ? "var(--accent-bg)"
                    : undefined,
              }}
            >
              <PriceRow price={p} prev={prevPrices.get(p.instrument)} />
            </div>
          ))
        )}
      </div>

      {/* Inline chart — mirrors stocks/crypto Discover's ChartCard, pulling
         OHLCV from /api/fxcm/history and the live tip from the parent's
         /api/fxcm/prices poll. Click a watchlist row above to switch. */}
      {bridgeOk && selected && (
        <CfdPriceChart
          instrument={selected}
          livePrice={priceMap.get(selected)}
          onOpenChart={onOpenChart ? handleOpenChart : undefined}
        />
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

      {/* Order sheet */}
      {orderSheetOpen && (
        <FxcmOrderSheet
          instruments={prices}
          onClose={() => setOrderSheetOpen(false)}
          onSubmitted={() => {
            // Refresh positions after order
            api.getFxcmPositions().then(setPositions).catch(() => {});
          }}
        />
      )}
    </div>
  );
}
