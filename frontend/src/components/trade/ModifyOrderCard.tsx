import { useEffect, useState } from "react";

import { useReplaceOrder } from "../../data/hooks";
import { showToast } from "../../lib/toast";
import type { Order } from "../../types";

const enumTail = (s: string | null | undefined): string =>
  s ? s.split(".").pop()!.toLowerCase() : "";

const TYPE_LABEL: Record<string, string> = {
  market: "Market",
  limit: "Limit",
  stop: "Stop",
  stop_limit: "Stop limit",
  trailing_stop: "Trailing stop",
};

const SIDE_LABEL: Record<string, string> = { buy: "Buy", sell: "Sell" };

const TIFS = ["day", "gtc", "opg", "cls", "ioc", "fok"] as const;
type TIF = (typeof TIFS)[number];
const TIF_LABEL: Record<TIF, string> = {
  day: "DAY",
  gtc: "GTC",
  opg: "OPG",
  cls: "CLS",
  ioc: "IOC",
  fok: "FOK",
};

interface Props {
  open: boolean;
  order: Order;
  onClose: () => void;
}

/**
 * Card replacement for the inline ReplaceRow in the Orders blotter.
 * Bottom-sheet modal mirroring OrderSheet's shape. Only the fields
 * Alpaca's PATCH /api/orders/{id} accepts are editable — qty, limit,
 * stop, trail, TIF. Symbol / side / type render as a read-only header
 * so the user can't pretend to change them and get a confusing 422.
 */
export default function ModifyOrderCard({ open, order, onClose }: Props) {
  const replace = useReplaceOrder();
  const [qty, setQty] = useState<number | undefined>(order.qty ?? undefined);
  const [limit, setLimit] = useState<number | undefined>(
    order.limit_price ?? undefined,
  );
  const [stop, setStop] = useState<number | undefined>(
    order.stop_price ?? undefined,
  );
  const [tif, setTif] = useState<TIF>((enumTail(order.time_in_force) as TIF) || "day");

  const typeKey = enumTail(order.type);
  const sideKey = enumTail(order.side);
  const needsLimit = typeKey === "limit" || typeKey === "stop_limit";
  const needsStop = typeKey === "stop" || typeKey === "stop_limit";
  const isTrailing = typeKey === "trailing_stop";

  // Mirror caller-supplied order each time the card (re-)opens.
  useEffect(() => {
    if (!open) return;
    setQty(order.qty ?? undefined);
    setLimit(order.limit_price ?? undefined);
    setStop(order.stop_price ?? undefined);
    setTif((enumTail(order.time_in_force) as TIF) || "day");
    replace.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, order.id]);

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

  // Auto-close after success.
  useEffect(() => {
    if (!replace.isSuccess) return;
    const id = setTimeout(() => {
      onClose();
      replace.reset();
    }, 900);
    return () => clearTimeout(id);
  }, [replace.isSuccess, onClose, replace]);

  if (!open) return null;

  function save() {
    replace.mutate(
      {
        id: order.id,
        input: {
          qty,
          ...(needsLimit ? { limit_price: limit } : {}),
          ...(needsStop ? { stop_price: stop } : {}),
          time_in_force: tif,
        },
      },
      {
        onSuccess: () =>
          showToast(`${order.symbol} order updated`, "success"),
        onError: (e) =>
          showToast(
            `Couldn't update ${order.symbol}: ${(e as Error).message}`,
            "error",
          ),
      },
    );
  }

  const inputStyle = {
    padding: "10px 12px",
    background: "var(--panel-2)",
    border: "1px solid var(--border)",
    borderRadius: "var(--r)",
    color: "var(--text)",
    fontSize: 14,
  } as const;

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
        className="w-full max-w-[520px] max-h-[92vh] overflow-y-auto"
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
              Modify order
            </div>
            <div className="text-[18px] font-semibold flex items-baseline gap-2">
              <span>{order.symbol}</span>
              <span
                className="text-[12px] font-medium px-2 py-0.5"
                style={{
                  background:
                    sideKey === "buy"
                      ? "var(--pos-bg)"
                      : "var(--neg-bg)",
                  color: sideKey === "buy" ? "var(--pos)" : "var(--neg)",
                  borderRadius: 4,
                }}
              >
                {SIDE_LABEL[sideKey] ?? sideKey.toUpperCase()}
              </span>
              <span
                className="text-[13px] font-normal"
                style={{ color: "var(--text-2)" }}
              >
                {TYPE_LABEL[typeKey] ?? typeKey}
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

        {/* Editable fields */}
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span
              className="text-[11px] font-medium uppercase"
              style={{ color: "var(--mute)", letterSpacing: "0.04em" }}
            >
              Quantity
            </span>
            <input
              type="number"
              min={0}
              step="any"
              value={qty ?? ""}
              onChange={(e) =>
                setQty(e.target.value ? Number(e.target.value) : undefined)
              }
              className="font-mono tabular-nums"
              style={inputStyle}
            />
          </label>

          {needsLimit && (
            <label className="flex flex-col gap-1">
              <span
                className="text-[11px] font-medium uppercase"
                style={{ color: "var(--mute)", letterSpacing: "0.04em" }}
              >
                Limit price
              </span>
              <input
                type="number"
                min={0}
                step="any"
                value={limit ?? ""}
                onChange={(e) =>
                  setLimit(e.target.value ? Number(e.target.value) : undefined)
                }
                className="font-mono tabular-nums"
                style={inputStyle}
              />
            </label>
          )}

          {needsStop && (
            <label className="flex flex-col gap-1">
              <span
                className="text-[11px] font-medium uppercase"
                style={{ color: "var(--mute)", letterSpacing: "0.04em" }}
              >
                Stop price
              </span>
              <input
                type="number"
                min={0}
                step="any"
                value={stop ?? ""}
                onChange={(e) =>
                  setStop(e.target.value ? Number(e.target.value) : undefined)
                }
                className="font-mono tabular-nums"
                style={inputStyle}
              />
            </label>
          )}

          {isTrailing && (
            <div
              className="text-[12px] px-3 py-2"
              style={{
                background: "var(--panel-2)",
                color: "var(--mute)",
                borderRadius: 6,
              }}
            >
              Trailing stops can't be modified after submission — cancel
              and re-place if you need different parameters.
            </div>
          )}

          <div>
            <div
              className="text-[11px] font-medium uppercase mb-2"
              style={{ color: "var(--mute)", letterSpacing: "0.04em" }}
            >
              Time in force
            </div>
            <div className="flex flex-wrap gap-2">
              {TIFS.map((x) => {
                const active = tif === x;
                return (
                  <button
                    key={x}
                    type="button"
                    onClick={() => setTif(x)}
                    className="font-mono text-[11px] font-medium cursor-pointer px-3 py-1.5"
                    style={{
                      border: `1px solid ${active ? "var(--accent)" : "var(--border)"}`,
                      background: active ? "var(--accent-bg)" : "transparent",
                      color: active ? "var(--accent)" : "var(--text-2)",
                      borderRadius: "var(--r)",
                    }}
                  >
                    {TIF_LABEL[x]}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Submit */}
        <button
          type="button"
          onClick={save}
          disabled={replace.isPending || replace.isSuccess || isTrailing}
          className="w-full mt-5 text-[14px] font-semibold cursor-pointer border-0"
          style={{
            padding: "12px",
            borderRadius: "var(--r)",
            background: "var(--accent)",
            color: "white",
            opacity:
              replace.isPending || replace.isSuccess || isTrailing ? 0.6 : 1,
          }}
        >
          {replace.isPending
            ? "Saving…"
            : replace.isSuccess
              ? "Saved ✓"
              : "Save changes"}
        </button>
      </div>
    </div>
  );
}
