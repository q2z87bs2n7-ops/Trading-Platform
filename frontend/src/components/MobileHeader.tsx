import { useState } from "react";

import { useAccount, useClock } from "../data/hooks";
import { useStreamStatus } from "../hooks/useStreamStatus";
import IconButton from "./IconButton";
import { EquitySheet } from "./TopBar";

// "workspace" and "scalp" are desktop-only — accepted here for type parity
// with the app's PlatformMode but intentionally never offered in the mobile
// pills.
type Mode = "discover" | "portfolio" | "chart" | "scalp" | "workspace";
type AssetClass = "stocks" | "crypto" | "cfd";

const TITLES: Record<Mode, string> = {
  discover: "Discover",
  portfolio: "Portfolio",
  chart: "Chart",
  scalp: "Scalp",
  workspace: "Workspace",
};

const money0 = (n: number) =>
  n.toLocaleString("en-US", { maximumFractionDigits: 0 });

const timeHM = (ts: number) =>
  new Date(ts * 1000).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });

interface Props {
  mode: Mode;
  activeClass: AssetClass;
  onOpenDrawer: () => void;
  onSwitchMode: (m: Mode) => void;
  onSwitchAssetClass: (m: AssetClass) => void;
}

// Single merged mobile header. Row 1 carries the chrome: hamburger · page
// name + inline market-status caption · equity pill (opens balance sheet).
// Row 2 keeps mode pills + the silo toggle. ✦ Ask moves to a floating
// launcher in App.tsx so the chrome row doesn't have to fit it.
export default function MobileHeader({
  mode,
  activeClass,
  onOpenDrawer,
  onSwitchMode,
  onSwitchAssetClass,
}: Props) {
  const { data: clk } = useClock();
  const { data: acct } = useAccount();
  const streamStatus = useStreamStatus();
  const polling = streamStatus === "polling";
  const isCrypto = activeClass === "crypto";
  const isCfd = activeClass === "cfd";
  const open = (isCrypto || isCfd) ? true : !!clk?.is_open;
  const [sheetOpen, setSheetOpen] = useState(false);

  const statusCaption = isCrypto
    ? "● Open · 24/7"
    : isCfd
      ? "● Open · 24/5"
      : clk
        ? open
          ? `● Open · until ${timeHM(clk.next_close)}`
          : `● Closed · opens ${timeHM(clk.next_open)}`
        : "";

  const pl = acct ? acct.equity - acct.equity_at_market_open : 0;
  const plpc =
    acct && acct.equity_at_market_open > 0 ? pl / acct.equity_at_market_open : 0;
  const up = pl >= 0;

  return (
    <div
      style={{
        position: "sticky",
        top: "var(--safe-top)",
        zIndex: 30,
        background: "var(--bg)",
        paddingTop: 4,
      }}
    >
      {/* Row 1 — merged chrome + status + equity pill */}
      <div
        style={{
          height: "var(--mob-chrome-top)",
          padding: "0 var(--mob-container-pad)",
          display: "grid",
          gridTemplateColumns: "auto 1fr auto",
          alignItems: "center",
          gap: 10,
          borderBottom: "1px solid var(--hairline)",
        }}
      >
        <IconButton
          onClick={onOpenDrawer}
          aria-label="Open menu"
          className="w-9 h-9 justify-center text-[18px]"
        >
          ☰
        </IconButton>

        <div style={{ minWidth: 0, lineHeight: 1.1 }}>
          <div
            style={{
              fontSize: 14,
              fontWeight: 600,
              letterSpacing: "-0.005em",
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <span>{TITLES[mode]}</span>
            {polling && (
              <span
                aria-label="Stream polling fallback"
                title="Stream offline — polling /api/quotes"
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: 99,
                  background: "var(--warn)",
                  display: "inline-block",
                }}
              />
            )}
          </div>
          {statusCaption && (
            <div
              className="tabular-nums"
              style={{
                fontSize: 10.5,
                color: open ? "var(--text-2)" : "var(--neg)",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              <span style={{ color: open ? "var(--pos)" : "var(--neg)" }}>●</span>
              {statusCaption.slice(1)}
            </div>
          )}
        </div>

        {acct && (
          <button
            type="button"
            onClick={() => setSheetOpen(true)}
            className="cursor-pointer border-0"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              padding: "5px 8px",
              background: "transparent",
              minHeight: 36,
            }}
            aria-label="Open balance sheet"
          >
            <span
              className="font-mono tabular-nums"
              style={{ fontWeight: 600, fontSize: 13 }}
            >
              ${money0(acct.equity)}
            </span>
            <span
              className="tabular-nums"
              style={{
                fontSize: 10.5,
                padding: "2px 6px",
                borderRadius: 6,
                background: up ? "var(--pos-bg)" : "var(--neg-bg)",
                color: up ? "var(--pos)" : "var(--neg)",
                fontWeight: 600,
              }}
            >
              {up ? "+" : ""}
              {(plpc * 100).toFixed(2)}%
            </span>
          </button>
        )}
      </div>

      {/* Row 2 — mode pills + asset toggle */}
      <div
        style={{
          height: "var(--mob-chrome-top-2)",
          padding: "0 var(--mob-container-pad)",
          display: "flex",
          alignItems: "center",
          gap: 6,
          borderBottom: "1px solid var(--hairline)",
        }}
      >
        {(["discover", "portfolio", "chart"] as Mode[]).map((m) => {
          const active = m === mode;
          return (
            <button
              key={m}
              type="button"
              onClick={() => onSwitchMode(m)}
              style={{
                fontSize: 12.5,
                fontWeight: 600,
                padding: "6px 12px",
                borderRadius: 999,
                border: "1px solid " + (active ? "var(--border)" : "transparent"),
                background: active ? "var(--panel)" : "transparent",
                color: active ? "var(--text)" : "var(--text-2)",
                textTransform: "capitalize",
                cursor: "pointer",
              }}
            >
              {m}
            </button>
          );
        })}
        <div style={{ marginLeft: "auto" }}>
          <AssetClassToggleInline value={activeClass} onChange={onSwitchAssetClass} />
        </div>
      </div>

      {sheetOpen && acct && (
        <EquitySheet
          acct={acct}
          isCrypto={isCrypto}
          onClose={() => setSheetOpen(false)}
        />
      )}
    </div>
  );
}

// Compact toggle matching the desktop AssetClassToggle look but smaller.
function AssetClassToggleInline({
  value,
  onChange,
}: {
  value: AssetClass;
  onChange: (m: AssetClass) => void;
}) {
  return (
    <div
      style={{
        display: "inline-flex",
        padding: 2,
        borderRadius: 9,
        background: "var(--panel-2)",
        border: "1px solid var(--border)",
      }}
    >
      {(["stocks", "crypto"] as AssetClass[]).map((m) => {
        const active = m === value;
        return (
          <button
            key={m}
            type="button"
            onClick={() => onChange(m)}
            style={{
              fontSize: 10.5,
              fontWeight: 600,
              padding: "4px 8px",
              borderRadius: 7,
              background: active
                ? m === "stocks"
                  ? "var(--pos)"
                  : "var(--accent)"
                : "transparent",
              color: active ? "white" : "var(--text-2)",
              border: 0,
              cursor: "pointer",
              textTransform: "capitalize",
            }}
          >
            {m === "stocks" ? "Stocks" : "Crypto"}
          </button>
        );
      })}
    </div>
  );
}
