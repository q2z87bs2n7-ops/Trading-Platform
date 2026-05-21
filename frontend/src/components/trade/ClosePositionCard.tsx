import { useEffect } from "react";

import { useClosePosition } from "../../data/hooks";
import { showToast } from "../../lib/toast";
import type { Position } from "../../types";

const money = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD" });

const pct = (n: number) => `${n >= 0 ? "+" : ""}${(n * 100).toFixed(2)}%`;

interface Props {
  open: boolean;
  position: Position;
  onClose: () => void;
  onCustomize: () => void;
}

/**
 * Inline replacement for window.confirm("Close X?"). Shows a small
 * bottom sheet with two action paths:
 * - "Sell at market now" → fires useClosePosition immediately
 * - "Customize sell order" → hands off to OrderSheet pre-filled
 *   (caller mounts OrderSheet and routes the onCustomize callback)
 */
export default function ClosePositionCard({
  open,
  position,
  onClose,
  onCustomize,
}: Props) {
  const closePos = useClosePosition();

  // Lock body scroll while open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // ESC closes.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Auto-close after a successful close-position submit.
  useEffect(() => {
    if (!closePos.isSuccess) return;
    const id = setTimeout(() => {
      onClose();
      closePos.reset();
    }, 900);
    return () => clearTimeout(id);
  }, [closePos.isSuccess, onClose, closePos]);

  if (!open) return null;

  const plUp = position.unrealized_pl >= 0;

  function instantSell() {
    closePos.mutate(position.symbol, {
      onSuccess: () => {
        showToast(
          `${position.symbol} sell submitted at market`,
          "success",
        );
      },
      onError: (e) => {
        showToast(
          `Couldn't close ${position.symbol}: ${(e as Error).message}`,
          "error",
        );
      },
    });
  }

  return (
    <div
      role="dialog"
      aria-modal
      className="fixed inset-0 z-50 flex items-end justify-center"
      style={{
        background: "rgba(20, 22, 28, 0.45)",
        backdropFilter: "blur(4px)",
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[480px]"
        style={{
          background: "var(--panel)",
          borderTopLeftRadius: "var(--r-xl)",
          borderTopRightRadius: "var(--r-xl)",
          boxShadow: "var(--shadow-lg)",
          padding: "20px 24px 24px",
          animation: "sheet-up 200ms ease",
        }}
      >
        <style>{`@keyframes sheet-up{from{transform:translateY(40px);opacity:0}to{transform:translateY(0);opacity:1}}`}</style>

        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div>
            <div
              className="text-[11px] font-medium uppercase mb-0.5"
              style={{ color: "var(--mute)", letterSpacing: "0.05em" }}
            >
              Close position
            </div>
            <div className="text-[18px] font-semibold">
              {position.symbol}
              <span
                className="ml-2 font-mono text-[14px] font-normal"
                style={{ color: "var(--text-2)" }}
              >
                {position.qty} shares
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cancel"
            className="cursor-pointer border-0 text-[14px] grid place-items-center"
            style={{
              background: "var(--panel-2)",
              color: "var(--text-2)",
              width: 28,
              height: 28,
              borderRadius: 6,
            }}
          >
            ✕
          </button>
        </div>

        {/* Position summary */}
        <div
          className="grid grid-cols-2 gap-3 mb-5 p-3"
          style={{
            background: "var(--panel-2)",
            borderRadius: "var(--r)",
          }}
        >
          <div className="flex flex-col">
            <span
              className="text-[11px] uppercase"
              style={{ color: "var(--mute)" }}
            >
              Market value
            </span>
            <span className="font-mono text-[15px] tabular-nums">
              {money(position.market_value)}
            </span>
          </div>
          <div className="flex flex-col">
            <span
              className="text-[11px] uppercase"
              style={{ color: "var(--mute)" }}
            >
              Unrealized P&L
            </span>
            <span
              className="font-mono text-[15px] tabular-nums"
              style={{ color: plUp ? "var(--pos)" : "var(--neg)" }}
            >
              {plUp ? "+" : ""}
              {money(position.unrealized_pl)} ({pct(position.unrealized_plpc)})
            </span>
          </div>
        </div>

        {/* Two action paths */}
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={instantSell}
            disabled={closePos.isPending || closePos.isSuccess}
            className="w-full text-[14px] font-semibold cursor-pointer border-0"
            style={{
              padding: "12px",
              borderRadius: "var(--r)",
              background: "var(--neg)",
              color: "white",
              opacity: closePos.isPending || closePos.isSuccess ? 0.6 : 1,
            }}
          >
            {closePos.isPending
              ? "Submitting…"
              : closePos.isSuccess
                ? "Submitted ✓"
                : `Sell ${position.qty} ${position.symbol} at market`}
          </button>
          <button
            type="button"
            onClick={() => {
              onClose();
              onCustomize();
            }}
            disabled={closePos.isPending || closePos.isSuccess}
            className="w-full text-[13.5px] font-medium cursor-pointer"
            style={{
              padding: "11px",
              borderRadius: "var(--r)",
              background: "transparent",
              border: "1px solid var(--border)",
              color: "var(--text-2)",
            }}
          >
            Customize sell order →
          </button>
        </div>
      </div>
    </div>
  );
}
