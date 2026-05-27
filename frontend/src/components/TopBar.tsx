import { useRef } from "react";

import { useAccount, useClock } from "../data/hooks";
import { useStreamStatus } from "../hooks/useStreamStatus";
import type { AssetClass } from "../lib/ask-intent";
import type { Account } from "../types";
import SheetHandle from "./SheetHandle";

const money = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD" });

const timeHM = (ts: number) =>
  new Date(ts * 1000).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });

// TopBar renders no chrome itself any more: desktop folds status + equity
// into the new one-row header grid (HeaderStatusInline / HeaderEquityReadout
// below) and mobile folds them into MobileHeader (priority #9). The default
// export is kept so the existing App.tsx mount point stays — returning null
// is cheaper than rewiring three call sites.
export default function TopBar(_props: { assetClass?: AssetClass } = {}) {
  return null;
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
      <span
        className="tabular-nums font-mono"
        style={{ fontSize: 15.5, fontWeight: 550, letterSpacing: "-0.01em" }}
      >
        {money(acct.equity)}
      </span>
      <span
        className="tabular-nums font-mono"
        style={{
          fontSize: 12,
          fontWeight: 500,
          color: up
            ? "color-mix(in oklch, var(--pos) 90%, var(--text))"
            : "color-mix(in oklch, var(--neg) 88%, var(--text))",
        }}
      >
        {up ? "+" : "−"}
        {money(Math.abs(pl))}
        <span style={{ color: "var(--mute)", margin: "0 6px", fontWeight: 400 }}>·</span>
        {up ? "+" : "−"}
        {Math.abs(plpc * 100).toFixed(2)}% today
      </span>
    </div>
  );
}

// Bottom sheet: Cash / Portfolio Value / Buying Power. Tap backdrop to close.
export function EquitySheet({
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
  const sheetRef = useRef<HTMLDivElement>(null);
  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50"
      style={{ background: "rgba(20,22,28,0.45)" }}
      onClick={onClose}
    >
      <div
        ref={sheetRef}
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
        <SheetHandle
          ariaLabel="Dismiss balance sheet"
          onClick={onClose}
          sheetRef={sheetRef}
        />
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
