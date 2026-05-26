import { useState } from "react";

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

// Desktop status strip is gone — its content folds into the new one-row header
// (see App.tsx). TopBar now only renders the mobile single-row status strip;
// on desktop the App composes <HeaderStatusInline /> and <HeaderEquityReadout />
// directly into the header grid. BP no longer surfaces in the header at all —
// it lands in PortfolioHero (priority #8). Until that ships, BP is reachable
// from the Account Hub (brand-mark click).
export default function TopBar({ assetClass = "stocks" }: { assetClass?: AssetClass }) {
  const { data: clk } = useClock();
  const { data: acct } = useAccount();
  const streamStatus = useStreamStatus();
  const isCrypto = assetClass === "crypto";
  const isMobile = useMobile();

  if (!isMobile) return null;

  return (
    <MobileStatusStrip
      clk={clk}
      acct={acct}
      isCrypto={isCrypto}
      polling={streamStatus === "polling"}
    />
  );
}

// Inline OPEN/CLOSED status indicator used in the desktop header LEFT zone.
// The polling dot overlaps the silo dot when the SSE stream is unreachable
// (yellow over green) — same data, denser surface.
export function HeaderStatusInline({ assetClass }: { assetClass: AssetClass }) {
  const { data: clk } = useClock();
  const streamStatus = useStreamStatus();
  const isCrypto = assetClass === "crypto";
  const polling = streamStatus === "polling";

  const open = isCrypto ? true : !!clk?.is_open;
  const dotColor = open ? "var(--pos)" : "var(--neg)";
  const labelColor = open ? "var(--text-2)" : "var(--neg)";
  const labelText = isCrypto ? "Open" : open ? "Open" : "Closed";
  const subText = isCrypto
    ? "24/7"
    : clk
      ? open
        ? `until ${timeHM(clk.next_close)}`
        : `opens ${timeHM(clk.next_open)}`
      : "";

  if (!isCrypto && !clk) return null;

  return (
    <span
      className="inline-flex items-center gap-1.5"
      title={polling ? "Stream offline — polling /api/quotes every 60s." : undefined}
    >
      <span className="relative inline-flex" aria-hidden>
        <span
          className="inline-block w-[7px] h-[7px] rounded-full"
          style={{ background: dotColor }}
        />
        {polling && (
          <span
            className="absolute -top-px -right-px inline-block w-[5px] h-[5px] rounded-full"
            style={{ background: "var(--warn)", boxShadow: "0 0 0 1.5px var(--panel)" }}
          />
        )}
      </span>
      <span className="text-[11px]" style={{ color: labelColor }}>
        {labelText}
      </span>
      {subText && (
        <span className="tabular-nums text-[11px]" style={{ color: "var(--mute)" }}>
          {subText}
        </span>
      )}
    </span>
  );
}

// Right-aligned, two-line stacked equity readout (RIGHT zone of the desktop
// header). Day-% colouring matches the existing --pos/--neg convention.
export function HeaderEquityReadout({ assetClass: _assetClass }: { assetClass: AssetClass }) {
  const { data: acct } = useAccount();
  if (!acct) return null;
  const pl = acct.equity - acct.equity_at_market_open;
  const plpc = acct.equity_at_market_open > 0 ? pl / acct.equity_at_market_open : 0;
  const up = pl >= 0;
  return (
    <div className="flex flex-col items-end leading-tight">
      <span className="tabular-nums font-mono text-[14px] font-semibold">
        {money(acct.equity)}
      </span>
      <span
        className="tabular-nums font-mono text-[11.5px] font-semibold"
        style={{ color: up ? "var(--pos)" : "var(--neg)" }}
      >
        {up ? "+" : ""}
        {money(pl)} · {up ? "+" : ""}
        {(plpc * 100).toFixed(2)}% today
      </span>
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
