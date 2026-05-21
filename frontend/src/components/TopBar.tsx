import { useEffect, useRef, useState } from "react";

import { useAccount, useClock } from "../data/hooks";
import { useStreamStatus } from "../hooks/useStreamStatus";

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

export default function TopBar() {
  const { data: clk } = useClock();
  const { data: acct } = useAccount();
  const streamStatus = useStreamStatus();

  const [eqOpen, setEqOpen] = useState(false);
  const eqRef = useRef<HTMLDivElement>(null);
  useClickOutside(eqRef, () => setEqOpen(false));

  // Day P/L: dynamic calculation from account equity
  const pl = acct ? acct.equity - acct.equity_at_market_open : 0;
  const plpc =
    acct && acct.equity_at_market_open > 0 ? pl / acct.equity_at_market_open : 0;
  const up = pl >= 0;

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

      {/* Market status + next session edge */}
      {clk && (
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

      {/* Buying Power */}
      {acct && (
        <div className="flex items-center gap-1">
          <span style={{ color: "var(--mute)" }}>BP</span>
          <span className="tabular-nums">{money(acct.buying_power)}</span>
        </div>
      )}
    </div>
  );
}
