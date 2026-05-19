import { useEffect, useRef, useState } from "react";

import {
  useAccount,
  useCalendar,
  useClock,
  usePortfolioHistory,
} from "../data/hooks";

const money = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD" });

const last = (a: number[] | undefined) => (a && a.length ? a[a.length - 1] : 0);

const timeHM = (ts: number) =>
  new Date(ts * 1000).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });

function ymd(d: Date): string {
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function weekdaysBetween(start: Date, end: Date): string[] {
  const out: string[] = [];
  const cur = new Date(start);
  while (ymd(cur) <= ymd(end)) {
    const dow = cur.getDay();
    if (dow !== 0 && dow !== 6) out.push(ymd(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

const formatDate = (date: string) =>
  new Date(`${date}T00:00:00`).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
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
  const { data: pf } = usePortfolioHistory("1M", "1D");

  // Calendar horizon mirrors the prior Calendar component: today + 21 days.
  const today = new Date();
  const horizon = new Date(today);
  horizon.setDate(horizon.getDate() + 21);
  const START = ymd(today);
  const END = ymd(horizon);
  const { data: cal } = useCalendar(START, END);

  const [eqOpen, setEqOpen] = useState(false);
  const [calOpen, setCalOpen] = useState(false);
  const eqRef = useRef<HTMLDivElement>(null);
  const calRef = useRef<HTMLDivElement>(null);
  useClickOutside(eqRef, () => setEqOpen(false));
  useClickOutside(calRef, () => setCalOpen(false));

  const pl = last(pf?.profit_loss);
  const plpc = last(pf?.profit_loss_pct);
  const up = pl >= 0;

  // Compute non-standard sessions in the 21-day horizon (closed days or
  // off-hours opens/closes).
  const exceptions = (() => {
    if (!cal?.calendar)
      return [] as { date: string; closed: boolean; open: string; close: string }[];
    const tradingMap = new Map(cal.calendar.map((d) => [d.date, d]));
    return weekdaysBetween(today, horizon).flatMap((date) => {
      const td = tradingMap.get(date);
      if (!td) return [{ date, closed: true, open: "", close: "" }];
      if (!td.open.endsWith("09:30:00") || !td.close.endsWith("16:00:00"))
        return [{ date, closed: false, open: td.open, close: td.close }];
      return [];
    });
  })();

  const calChipText =
    exceptions.length === 0
      ? "Cal · standard hours"
      : `Cal · ${exceptions.length} exception${exceptions.length === 1 ? "" : "s"}`;

  return (
    <div className="flex items-center gap-6 text-[13px] flex-wrap">
      {/* Market status + next session edge */}
      {clk && (
        <div className="flex items-center gap-2">
          <span
            className="inline-block w-2 h-2 rounded-full"
            style={{ background: clk.is_open ? "var(--green)" : "var(--red)" }}
          />
          <span
            className="font-semibold"
            style={{ color: clk.is_open ? "var(--green)" : "var(--red)" }}
          >
            {clk.is_open ? "OPEN" : "CLOSED"}
          </span>
          <span className="text-muted tabular-nums">
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
            className="flex items-center gap-1 text-[13px] bg-transparent border-0 p-0 cursor-pointer"
          >
            <span className="text-muted">Equity</span>
            <span className="tabular-nums font-semibold">
              {money(acct.equity)}
            </span>
            <span className="text-muted text-xs">▾</span>
          </button>
          {eqOpen && (
            <div className="absolute top-full left-0 mt-1 bg-panel border border-border rounded-lg p-3 z-20 min-w-[200px]">
              <div className="flex justify-between py-1 text-[13px]">
                <span className="text-muted">Cash</span>
                <span className="tabular-nums">{money(acct.cash)}</span>
              </div>
              <div className="flex justify-between py-1 text-[13px]">
                <span className="text-muted">Portfolio Value</span>
                <span className="tabular-nums">
                  {money(acct.portfolio_value)}
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Day P/L (period from useHistory; matches prior PortfolioSummary card) */}
      {pf && (
        <div className="flex items-center gap-1">
          <span className="text-muted">Day P/L</span>
          <span
            className="tabular-nums font-semibold"
            style={{ color: up ? "var(--green)" : "var(--red)" }}
          >
            {up ? "+" : ""}
            {money(pl)} ({(plpc * 100).toFixed(2)}%)
          </span>
        </div>
      )}

      {/* Buying Power */}
      {acct && (
        <div className="flex items-center gap-1">
          <span className="text-muted">BP</span>
          <span className="tabular-nums">{money(acct.buying_power)}</span>
        </div>
      )}

      {/* Calendar chip (click-popover: exception list) */}
      <div ref={calRef} className="relative">
        <button
          type="button"
          onClick={() => setCalOpen((v) => !v)}
          className="text-[13px] text-muted hover:text-text bg-transparent border-0 p-0 cursor-pointer"
        >
          {calChipText}
        </button>
        {calOpen && (
          <div className="absolute top-full left-0 mt-1 bg-panel border border-border rounded-lg p-3 z-20 min-w-[220px] max-w-[300px]">
            {exceptions.length === 0 ? (
              <div className="text-xs text-muted">
                No exceptions — standard hours through {formatDate(END)}
              </div>
            ) : (
              exceptions.map((ex) => (
                <div
                  className="flex justify-between py-1 text-[13px]"
                  key={ex.date}
                >
                  <span className="text-muted">{formatDate(ex.date)}</span>
                  {ex.closed ? (
                    <span className="text-xs text-muted italic">
                      Market Closed
                    </span>
                  ) : (
                    <span className="tabular-nums">
                      {ex.open}–{ex.close}
                    </span>
                  )}
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
