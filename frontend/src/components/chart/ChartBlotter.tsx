import { useEffect, useState } from "react";

import { useMobile } from "../../hooks/useMobile";
import Activities from "../Activities";
import Orders from "../Orders";
import Positions from "../Positions";

type Tab = "positions" | "orders" | "activity";
const TABS: { key: Tab; label: string }[] = [
  { key: "positions", label: "Positions" },
  { key: "orders", label: "Orders" },
  { key: "activity", label: "Activity" },
];

const COLLAPSE_KEY = "chart_blotter_collapsed";

function readCollapsed(): boolean {
  try {
    const v = localStorage.getItem(COLLAPSE_KEY);
    if (v === "1") return true;
    if (v === "0") return false;
    // No stored preference: collapse by default on mobile to save space.
    return window.matchMedia("(max-width: 640px)").matches;
  } catch {
    return false;
  }
}

export default function ChartBlotter({
  onSymbolSelect,
  assetClass,
}: {
  onSymbolSelect?: (s: string) => void;
  assetClass?: "stocks" | "crypto";
}) {
  const [tab, setTab] = useState<Tab>("positions");
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const isMobile = useMobile();

  useEffect(() => {
    try {
      localStorage.setItem(COLLAPSE_KEY, collapsed ? "1" : "0");
    } catch {
      /* noop */
    }
  }, [collapsed]);

  return (
    <div
      className="flex flex-col"
      style={{
        background: "var(--panel)",
        border: "1px solid var(--border)",
        borderRadius: "var(--r-lg)",
        boxShadow: "var(--shadow-sm)",
        overflow: "hidden",
      }}
    >
      {/* Tab bar */}
      <div
        className="flex items-center gap-0"
        style={{
          borderBottom: collapsed ? "none" : "1px solid var(--hairline)",
          minHeight: 33,
        }}
      >
        {TABS.map((t) => {
          const active = tab === t.key && !collapsed;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => {
                if (collapsed) setCollapsed(false);
                setTab(t.key);
              }}
              className="text-[12px] font-medium cursor-pointer border-0 px-3 py-1.5 transition-colors"
              style={{
                background: "transparent",
                color: active ? "var(--accent)" : "var(--mute)",
                borderBottom: `2px solid ${active ? "var(--accent)" : "transparent"}`,
                borderRadius: 0,
              }}
            >
              {t.label}
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          aria-label={collapsed ? "Expand blotter" : "Collapse blotter"}
          className="ml-auto cursor-pointer border-0 text-[14px] px-3"
          style={{
            background: "transparent",
            color: "var(--mute)",
          }}
        >
          {collapsed ? "▴" : "▾"}
        </button>
      </div>

      {/* Tab content */}
      {!collapsed && (
        <div
          className="overflow-auto p-2"
          style={{ maxHeight: 220 }}
        >
          {tab === "positions" && (
            <Positions
              variant={isMobile ? "strip" : "table"}
              onSelect={onSymbolSelect}
              assetClass={assetClass}
            />
          )}
          {tab === "orders" && <Orders assetClass={assetClass} />}
          {tab === "activity" && <Activities />}
        </div>
      )}
    </div>
  );
}
