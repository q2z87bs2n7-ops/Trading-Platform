import { useEffect, useRef, useState } from "react";

import { useAccount, useClock } from "../data/hooks";
import { useStreamStatus } from "../hooks/useStreamStatus";
import { useMobile } from "../hooks/useMobile";
import type { AssetClass } from "../lib/ask-intent";
import type { Account, MarketClock } from "../types";

const money = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD" });

const timeHM = (ts: number) =>
  new Date(ts * 1000).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });

// Click-outside dismiss for popovers.
function useClickOutside(
  ref: React.RefObject<HTMLElement>,
  onOutside: () => void,
) {
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onOutside();
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [ref, onOutside]);
}

export default function TopBar({ assetClass = "stocks" }: { assetClass?: AssetClass }) {
  const { data: clk } = useClock();
  const { data: acct } = useAccount();
  const streamStatus = useStreamStatus();
  const isCrypto = assetClass === "crypto";

  const [eqOpen, setEqOpen] = useState(false);
  const eqRef = useRef<HTMLDivElement>(null);
  useClickOutside(eqRef, () => setEqOpen(false));
  const isMobile = useMobile();

  // Day P/L: dynamic calculation from account equity
  const pl = acct ? acct.equity - acct.equity_at_market_open : 0;
  const plpc =
    acct && acct.equity_at_market_open > 0 ? pl / acct.equity_at_market_open : 0;
  const up = pl >= 0;

  if (isMobile)
    return (
      <MobileStatusStrip
        clk={clk}
        acct={acct}
        isCrypto={isCrypto}
        polling={streamStatus === "polling"}
      />
    );

  return (
    <div className="flex items-center gap-6 text-[13px] flex-wrap text-text">
      {/* Stream disconnected chip — yellow, only visible when polling. */}
      {streamStatus === "polling" && (
        <span
          className="inline-flex items-center gap-1.5 text-[11px] font-medium uppercase px-2 py-1"
          style={{
            background: "var(--warn-bg)",
            color: "var(--warn)",
            borderRadius: 6,
            letterSpacing: "0.04em",
          }}
          title="Server-Sent Events stream is unreachable; falling back to /api/quotes polling every 2s."
        >
          <span
            className="inline-block w-1.5 h-1.5 rounded-full"
            style={{ background: "var(--warn)" }}
            aria-hidden
          />
          Polling · stream off
        </span>
      )}

      {/* Market status — stocks use the Alpaca clock; crypto trades 24/7 */}
      {isCrypto ? (
        <div className="flex items-center gap-2">
          <span
            className="inline-block w-2 h-2 rounded-full"
            style={{ background: "var(--pos)" }}
          />
          <span className="font-semibold" style={{ color: "var(--pos)" }}>
            OPEN
          </span>
          <span style={{ color: "var(--mute)" }}>24/7</span>
        </div>
      ) : (
        clk && (
          <div className="flex items-center gap-2">
            <span
              className="inline-block w-2 h-2 rounded-full"
              style={{ background: clk.is_open ? "var(--pos)" : "var(--neg)" }}
            />
            <span
              className="font-semibold"
              style={{ color: clk.is_open ? "var(--pos)" : "var(--neg)" }}
            >
              {clk.is_open ? "OPEN" : "CLOSED"}
            </span>
            <span className="tabular-nums" style={{ color: "var(--mute)" }}>
              {clk.is_open
                ? `until ${timeHM(clk.next_close)}`
                : `opens ${timeHM(clk.next_open)}`}
            </span>
          </div>
        )
      )}

      {/* Equity (click-popover: cash + portfolio value) */}
      {acct && (
        <div ref={eqRef} className="relative">
          <button
            type="button"
            onClick={() => setEqOpen((v) => !v)}
            className="flex items-center gap-1 text-[13px] text-text bg-transparent border-0 p-0 cursor-pointer"
          >
            <span style={{ color: "var(--mute)" }}>Equity</span>
            <span className="tabular-nums font-semibold">
              {money(acct.equity)}
            </span>
            <span className="text-xs" style={{ color: "var(--mute)" }}>
              ▾
            </span>
          </button>
          {eqOpen && (
            <div
              className="absolute top-full left-0 mt-1 p-3 z-20 min-w-[200px]"
              style={{
                background: "var(--panel)",
                border: "1px solid var(--border)",
                borderRadius: "var(--r)",
                boxShadow: "var(--shadow)",
              }}
            >
              <div className="flex justify-between py-1 text-[13px]">
                <span style={{ color: "var(--mute)" }}>Cash</span>
                <span className="tabular-nums">{money(acct.cash)}</span>
              </div>
              <div className="flex justify-between py-1 text-[13px]">
                <span style={{ color: "var(--mute)" }}>Portfolio Value</span>
                <span className="tabular-nums">
                  {money(acct.portfolio_value)}
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Day P/L (dynamic calculation from account equity) */}
      {acct && (
        <div className="flex items-center gap-1">
          <span style={{ color: "var(--mute)" }}>Day P/L</span>
          <span
            className="tabular-nums font-semibold"
            style={{ color: up ? "var(--pos)" : "var(--neg)" }}
          >
            {up ? "+" : ""}
            {money(pl)} ({(plpc * 100).toFixed(2)}%)
          </span>
        </div>
      )}

      {/* Buying Power — non_marginable for crypto (Alpaca doesn't extend margin) */}
      {acct && (
        <div className="flex items-center gap-1">
          <span style={{ color: "var(--mute)" }}>BP</span>
          <span className="tabular-nums">
            {money(isCrypto ? acct.non_marginable_buying_power : acct.buying_power)}
          </span>
        </div>
      )}
    </div>
  );
}

const money0 = (n: number) =>
  n.toLocaleString("en-US", { maximumFractionDigits: 0 });

// Single-row status strip for mobile. Polling dot + (stocks-only) OPEN/CLOSED
// chip + equity/day-% button that opens the balance sheet.
function MobileStatusStrip({
  clk,
  acct,
  isCrypto,
  polling,
}: {
  clk: MarketClock | undefined;
  acct: Account | undefined;
  isCrypto: boolean;
  polling: boolean;
}) {
  const [sheetOpen, setSheetOpen] = useState(false);
  if (!acct) return null;
  const pl = acct.equity - acct.equity_at_market_open;
  const plpc = acct.equity_at_market_open > 0 ? pl / acct.equity_at_market_open : 0;
  const up = pl >= 0;
  return (
    <>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "2px var(--mob-container-pad) 4px",
          fontSize: 12,
        }}
      >
        {polling && (
          <span
            aria-label="Stream polling fallback"
            style={{ width: 8, height: 8, borderRadius: 99, background: "var(--warn)" }}
          />
        )}
        {isCrypto ? (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
            <span
              style={{ width: 6, height: 6, borderRadius: 99, background: "var(--pos)" }}
            />
            <b style={{ color: "var(--pos)", fontSize: 11.5 }}>OPEN</b>
            <span style={{ color: "var(--mute)", fontSize: 11 }}>24/7</span>
          </span>
        ) : (
          clk && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: 99,
                  background: clk.is_open ? "var(--pos)" : "var(--neg)",
                }}
              />
              <b style={{ color: clk.is_open ? "var(--pos)" : "var(--neg)", fontSize: 11.5 }}>
                {clk.is_open ? "OPEN" : "CLOSED"}
              </b>
            </span>
          )
        )}
        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          style={{
            marginLeft: "auto",
            display: "inline-flex",
            gap: 8,
            alignItems: "center",
            background: "transparent",
            border: 0,
            padding: "3px 2px",
            cursor: "pointer",
          }}
        >
          <span className="tabular-nums" style={{ fontWeight: 600, fontSize: 13 }}>
            ${money0(acct.equity)}
          </span>
          <span
            style={{
              fontSize: 10.5,
              padding: "2px 6px",
              borderRadius: 6,
              background: up ? "var(--pos-bg)" : "var(--neg-bg)",
              color: up ? "var(--pos)" : "var(--neg)",
            }}
          >
            {up ? "+" : ""}
            {(plpc * 100).toFixed(2)}%
          </span>
          <span style={{ color: "var(--mute)" }}>▾</span>
        </button>
      </div>
      {sheetOpen && (
        <EquitySheet acct={acct} isCrypto={isCrypto} onClose={() => setSheetOpen(false)} />
      )}
    </>
  );
}

// Bottom sheet: Cash / Portfolio Value / Buying Power. Tap backdrop to close.
function EquitySheet({
  acct,
  isCrypto,
  onClose,
}: {
  acct: Account;
  isCrypto: boolean;
  onClose: () => void;
}) {
  const rows: [string, number][] = [
    ["Cash", acct.cash],
    ["Portfolio Value", acct.portfolio_value],
    [
      isCrypto ? "Buying Power (crypto)" : "Buying Power",
      isCrypto ? acct.non_marginable_buying_power : acct.buying_power,
    ],
  ];
  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50"
      style={{ background: "rgba(20,22,28,0.45)" }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          background: "var(--panel)",
          borderTopLeftRadius: 18,
          borderTopRightRadius: 18,
          boxShadow: "var(--shadow-lg)",
          padding: "14px 16px",
          paddingBottom: "max(var(--safe-bottom), 14px)",
          animation: "mob-sheet-in 200ms ease",
        }}
      >
        <div style={{ display: "flex", justifyContent: "center", paddingBottom: 10 }}>
          <span
            style={{ width: 36, height: 4, borderRadius: 99, background: "var(--border-2)" }}
          />
        </div>
        {rows.map(([k, v]) => (
          <div
            key={k}
            style={{
              display: "flex",
              justifyContent: "space-between",
              padding: "10px 0",
              borderTop: "1px solid var(--hairline)",
              fontSize: 14,
            }}
          >
            <span style={{ color: "var(--mute)" }}>{k}</span>
            <span className="tabular-nums" style={{ fontWeight: 600 }}>
              {money(v)}
            </span>
          </div>
        ))}
      </div>
      <style>{`@keyframes mob-sheet-in { from { transform: translateY(100%) } to { transform: none } }`}</style>
    </div>
  );
}
