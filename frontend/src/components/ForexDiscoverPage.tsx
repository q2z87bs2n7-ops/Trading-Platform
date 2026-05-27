import { useEffect, useState } from "react";
import * as api from "../api";
import type { FxcmAccount, FxcmPrice } from "../types";
import { money } from "../lib/format";

// Forex-specific price formatter: 5 decimal places for most pairs, 3 for JPY
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

// ── Main page ─────────────────────────────────────────────────────────────────

const POLL_INTERVAL_MS = 3000;

export default function ForexDiscoverPage() {
  const [bridgeOk, setBridgeOk] = useState<boolean | null>(null);
  const [account, setAccount] = useState<FxcmAccount | null>(null);
  const [prices, setPrices] = useState<FxcmPrice[]>([]);
  const [prevPrices, setPrevPrices] = useState<Map<string, FxcmPrice>>(new Map());

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
        const [acct, wl] = await Promise.all([
          api.getFxcmAccount(),
          api.getFxcmWatchlist(),
        ]);
        if (!cancelled) {
          setAccount(acct);
          setPrices(wl);
        }
      } catch { /* non-fatal — leave blank hero */ }
    }

    init();
    return () => { cancelled = true; };
  }, []);

  // Live price polling
  useEffect(() => {
    if (!bridgeOk) return;
    const tick = async () => {
      try {
        const wl = await api.getFxcmWatchlist();
        setPrices((prev) => {
          const map = new Map<string, FxcmPrice>();
          for (const p of prev) map.set(p.instrument, p);
          setPrevPrices(map);
          return wl;
        });
      } catch { /* bridge went away — leave last data visible */ }
    };
    const id = setInterval(tick, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [bridgeOk]);

  const priceMap = new Map<string, FxcmPrice>();
  for (const p of prices) priceMap.set(p.instrument, p);

  return (
    <div className="max-w-[900px] mx-auto px-4 pt-4 pb-20 flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-0.5">
          <h2 className="text-[18px] font-semibold" style={{ letterSpacing: "-0.01em" }}>
            Forex
          </h2>
          <span className="text-[12px]" style={{ color: "var(--mute)" }}>
            FXCM ForexConnect — demo account
          </span>
        </div>
        <BridgeStatus ok={bridgeOk} />
      </div>

      {/* Account hero */}
      <FxcmAccountHero account={account} />

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
            FXCM bridge is not running.{" "}
            <span className="font-mono text-[12px]">
              Start fxcm-bridge\bridge.py to see live prices.
            </span>
          </div>
        ) : prices.length === 0 ? (
          <div className="px-4 py-8 text-center text-[13px]" style={{ color: "var(--mute)" }}>
            {bridgeOk === null ? "Connecting to bridge…" : "No price data yet"}
          </div>
        ) : (
          prices.map((p) => (
            <PriceRow
              key={p.instrument}
              price={p}
              prev={prevPrices.get(p.instrument)}
            />
          ))
        )}
      </div>

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
          <strong>Bridge offline.</strong> The FXCM ForexConnect sidecar is not responding on
          port 3001. Start it with:{" "}
          <code className="font-mono text-[11.5px]">
            python37\python.exe fxcm-bridge\bridge.py
          </code>
        </div>
      )}
    </div>
  );
}
