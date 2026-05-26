// Shared building blocks for the order-entry sheets. Extracted from
// OrderSheet.tsx so the desktop body, the mobile body (OrderSheetMobile.tsx),
// and OrderTicketInline can pull from one place without dragging in the full
// 1.4k-line file. Pure presentation — no business logic lives here.

import type { OType, TIF } from "../../hooks/useOrderTicket";

export const money = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD" });

export const TYPE_LABEL: Record<OType, string> = {
  market: "Market",
  limit: "Limit",
  stop: "Stop",
  stop_limit: "Stop limit",
  trailing_stop: "Trailing",
};

export const TIF_LABEL: Record<TIF, string> = {
  day: "DAY",
  gtc: "GTC",
  opg: "OPG",
  cls: "CLS",
  ioc: "IOC",
  fok: "FOK",
};

export function Chip({
  active,
  onClick,
  children,
  tone = "neutral",
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  tone?: "neutral" | "buy" | "sell";
}) {
  const activeBg =
    tone === "buy"
      ? "var(--pos-bg)"
      : tone === "sell"
        ? "var(--neg-bg)"
        : "var(--accent-bg)";
  const activeColor =
    tone === "buy"
      ? "var(--pos)"
      : tone === "sell"
        ? "var(--neg)"
        : "var(--accent)";
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-[12.5px] font-medium px-3 py-1.5 cursor-pointer transition-colors"
      style={{
        background: active ? activeBg : "transparent",
        border: `1px solid ${active ? activeColor : "var(--border)"}`,
        color: active ? activeColor : "var(--text-2)",
        borderRadius: "var(--r)",
      }}
    >
      {children}
    </button>
  );
}

export function Stepper({
  value,
  onChange,
  fractional,
}: {
  value: number;
  onChange: (n: number) => void;
  fractional: boolean;
}) {
  const step = fractional ? 0.01 : 1;
  const bump = (delta: number) =>
    onChange(Math.max(0, Number((value + delta).toFixed(fractional ? 2 : 0))));
  return (
    <div
      className="flex items-stretch"
      style={{
        border: "1px solid var(--border)",
        borderRadius: "var(--r)",
        overflow: "hidden",
      }}
    >
      <button
        type="button"
        onClick={() => bump(-step)}
        className="px-3 cursor-pointer border-0"
        style={{
          background: "var(--panel-2)",
          color: "var(--text-2)",
          fontSize: 18,
        }}
        aria-label="Decrease quantity"
      >
        −
      </button>
      <input
        type="number"
        min={0}
        step={step}
        value={value || ""}
        onChange={(e) => onChange(e.target.value ? Number(e.target.value) : 0)}
        className="text-center flex-1 border-0 outline-none font-mono text-[15px] tabular-nums"
        style={{
          background: "var(--panel)",
          color: "var(--text)",
          padding: "8px 4px",
          minWidth: 0,
          MozAppearance: "textfield",
        }}
      />
      <button
        type="button"
        onClick={() => bump(step)}
        className="px-3 cursor-pointer border-0"
        style={{
          background: "var(--panel-2)",
          color: "var(--text-2)",
          fontSize: 18,
        }}
        aria-label="Increase quantity"
      >
        +
      </button>
    </div>
  );
}

export function AmountToggle({
  mode,
  onChange,
  unitLabel = "Shares",
}: {
  mode: "shares" | "dollars";
  onChange: (m: "shares" | "dollars") => void;
  unitLabel?: string;
}) {
  return (
    <div
      className="flex"
      style={{
        border: "1px solid var(--border)",
        borderRadius: "var(--r)",
        overflow: "hidden",
      }}
    >
      {(["shares", "dollars"] as const).map((m) => {
        const active = mode === m;
        return (
          <button
            key={m}
            type="button"
            onClick={() => onChange(m)}
            className="text-[11px] font-medium px-2.5 py-1 cursor-pointer border-0"
            style={{
              background: active ? "var(--accent-bg)" : "transparent",
              color: active ? "var(--accent)" : "var(--text-2)",
            }}
          >
            {m === "shares" ? unitLabel : "Dollars"}
          </button>
        );
      })}
    </div>
  );
}

export function DollarInput({
  value,
  onChange,
  big = false,
}: {
  value: number | undefined;
  onChange: (n: number | undefined) => void;
  big?: boolean;
}) {
  return (
    <div
      className="flex items-center"
      style={{
        border: "1px solid var(--border)",
        borderRadius: "var(--r)",
        background: "var(--panel)",
        overflow: "hidden",
        height: big ? 56 : undefined,
      }}
    >
      <span
        className="font-mono"
        style={{
          color: "var(--text-2)",
          paddingLeft: big ? 16 : 12,
          fontSize: big ? 24 : 15,
        }}
      >
        $
      </span>
      <input
        type="number"
        min={0}
        step="any"
        value={value ?? ""}
        placeholder="0.00"
        onChange={(e) =>
          onChange(e.target.value ? Number(e.target.value) : undefined)
        }
        className="flex-1 border-0 outline-none font-mono tabular-nums"
        style={{
          background: "transparent",
          color: "var(--text)",
          padding: big ? "8px 12px 8px 6px" : "8px 12px 8px 4px",
          fontSize: big ? 24 : 15,
          minWidth: 0,
          MozAppearance: "textfield",
        }}
      />
    </div>
  );
}

// Compact segmented-control / preset pill style (mobile order form).
export function segStyle(active: boolean): React.CSSProperties {
  return {
    minHeight: "var(--mob-tap)",
    borderRadius: "var(--r)",
    border: `1px solid ${active ? "var(--accent)" : "var(--border)"}`,
    background: active ? "var(--accent-bg)" : "transparent",
    color: active ? "var(--accent)" : "var(--text-2)",
    fontSize: 13,
    fontWeight: 600,
  };
}

// Generic bottom half-sheet for the order type + advanced pickers.
export function MobileHalfSheet({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[60]"
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
          padding: "16px",
          paddingBottom: "max(var(--safe-bottom), 16px)",
        }}
      >
        <div className="flex items-center justify-between mb-3">
          <span className="text-[14px] font-semibold">{title}</span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-[14px] cursor-pointer border-0"
            style={{
              background: "var(--panel-2)",
              color: "var(--text-2)",
              width: 32,
              height: 32,
              borderRadius: "var(--r)",
            }}
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
