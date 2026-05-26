import { useEffect, useRef, useState } from "react";

import { useStreamStatus } from "../../hooks/useStreamStatus";

interface Props {
  canClear: boolean;
  onCollapse: () => void;
  onClear: () => void;
  symbol?: string;
  resolution?: string;
}

// Maps TradingView's compact resolution ("1", "5", "60", "240", "D", "W") to
// the friendly label the spec calls for ("1m", "5m", "1h", "4h", "1D", "1W").
function fmtResolution(res?: string): string {
  if (!res) return "";
  if (res === "D") return "1D";
  if (res === "W") return "1W";
  if (res === "M") return "1M";
  const n = Number(res);
  if (!Number.isFinite(n)) return res;
  if (n >= 60) return `${n / 60}h`;
  return `${n}m`;
}

export default function ChatHeader({
  canClear,
  onCollapse,
  onClear,
  symbol,
  resolution,
}: Props) {
  const streamStatus = useStreamStatus();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Click-outside dismiss for the overflow menu.
  useEffect(() => {
    if (!menuOpen) return;
    function onDoc(e: MouseEvent) {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [menuOpen]);

  const tf = fmtResolution(resolution);
  const live = streamStatus === "streaming";
  const subline = symbol
    ? [tf, live ? "streaming" : "polling"].filter(Boolean).join(" · ")
    : null;

  return (
    <div
      className="px-3 py-2.5"
      style={{
        background:
          "linear-gradient(180deg, var(--cb-accent-soft) 0%, var(--panel) 100%)",
        borderBottom: "1px solid var(--hairline)",
      }}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5 min-w-0">
          <div
            className="grid place-items-center text-white font-semibold text-[13px] shrink-0"
            style={{
              width: 28,
              height: 28,
              borderRadius: 6,
              background:
                "linear-gradient(135deg, var(--cb-accent) 0%, var(--cb-accent-2) 100%)",
            }}
            aria-hidden
          >
            ✦
          </div>
          <span className="text-[13.5px] font-semibold truncate">ChartBot</span>
        </div>
        <div className="flex items-center gap-1 shrink-0 relative" ref={menuRef}>
          {/* Overflow: Clear lives here so a destructive action isn't one
              mis-click away on the header. */}
          <button
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            disabled={!canClear}
            title="More"
            aria-label="More options"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            className="cursor-pointer border-0 bg-transparent px-2 text-[14px] leading-none disabled:cursor-not-allowed disabled:opacity-40"
            style={{ color: "var(--text-2)" }}
          >
            ⋯
          </button>
          <button
            type="button"
            onClick={onCollapse}
            title="Collapse"
            aria-label="Collapse ChartBot"
            className="cursor-pointer border-0 bg-transparent text-[16px]"
            style={{ color: "var(--text-2)" }}
          >
            ›
          </button>
          {menuOpen && (
            <div
              role="menu"
              className="absolute top-full right-0 mt-1 z-20 py-1 min-w-[160px]"
              style={{
                background: "var(--panel)",
                border: "1px solid var(--border)",
                borderRadius: "var(--r)",
                boxShadow: "var(--shadow)",
              }}
            >
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  onClear();
                }}
                className="w-full text-left text-[12.5px] cursor-pointer border-0 bg-transparent px-3 py-1.5 hover:bg-[var(--panel-2)]"
                style={{ color: "var(--neg)" }}
              >
                Clear conversation
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Symbol context — visible whenever the chart has a symbol. Makes the
          bot's "knows what you're looking at" state explicit. */}
      {symbol && (
        <div className="flex items-center gap-2 mt-1.5">
          <span
            className="inline-flex items-center font-semibold tabular-nums"
            style={{
              background: "var(--panel)",
              border: "1px solid var(--border)",
              borderRadius: 5,
              padding: "2px 7px",
              fontSize: 11,
              letterSpacing: "-0.005em",
            }}
          >
            {symbol}
          </span>
          {subline && (
            <span
              className="font-mono"
              style={{ fontSize: 10.5, color: "var(--mute)" }}
            >
              {subline}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
