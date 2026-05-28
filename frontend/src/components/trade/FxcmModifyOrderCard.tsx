import { useEffect, useState } from "react";

import { useFxcmModifyOrder } from "../../data/hooks";
import { showToast } from "../../lib/toast";
import type { FxcmOrder } from "../../types";

const TYPE_LABEL: Record<string, string> = {
  OM: "Market",
  SE: "Stop entry",
  LE: "Limit entry",
};
const SIDE_LABEL: Record<string, string> = { B: "Buy", S: "Sell" };

export interface FxcmModifyOrderCardProps {
  order: FxcmOrder;
  onClose: () => void;
}

export default function FxcmModifyOrderCard({
  order,
  onClose,
}: FxcmModifyOrderCardProps) {
  const modify = useFxcmModifyOrder();
  const isMarket = order.type === "OM";
  const sideKey = order.buy_sell;
  const digits = order.digits ?? 5;

  // 0 → empty input (treat as "no value"); Wave-1 bridge interprets 0 as
  // "no change" so the diff-only submit below never sends a zero either.
  const initRate = order.rate > 0 ? order.rate : undefined;
  const initStop = (order.stop ?? 0) > 0 ? order.stop : undefined;
  const initLimit = (order.limit ?? 0) > 0 ? order.limit : undefined;

  const [rate, setRate] = useState<number | undefined>(initRate);
  const [stop, setStop] = useState<number | undefined>(initStop);
  const [limit, setLimit] = useState<number | undefined>(initLimit);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    setRate(initRate);
    setStop(initStop);
    setLimit(initLimit);
    setSubmitError(null);
    modify.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order.order_id]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // LE-BUY warning: a buy limit above the requested entry rate would cross
  // the book immediately. Soft warn — don't hard-block, since the operator
  // may want to widen TP intentionally.
  const upcrossWarn =
    order.type === "LE" &&
    sideKey === "B" &&
    rate != null &&
    limit != null &&
    limit > rate;

  function buildBody(): { rate?: number; stop?: number; limit?: number } {
    const body: { rate?: number; stop?: number; limit?: number } = {};
    if (rate != null && rate !== initRate) body.rate = rate;
    if (stop !== initStop) body.stop = stop ?? 0;
    if (limit !== initLimit) body.limit = limit ?? 0;
    return body;
  }

  const body = buildBody();
  const dirty = Object.keys(body).length > 0;
  const rateInvalid = !isMarket && rate != null && rate <= 0;

  function save() {
    setSubmitError(null);
    if (!dirty) return;
    if (rateInvalid) {
      setSubmitError("Rate must be greater than 0.");
      return;
    }
    modify.mutate(
      { id: order.order_id, body },
      {
        onSuccess: () => {
          showToast(`${order.instrument} order updated`, "success");
          onClose();
        },
        onError: (e) => setSubmitError((e as Error).message),
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
          paddingBottom: "calc(24px + var(--safe-bottom, 0px))",
          animation: "sheet-up 200ms ease",
        }}
      >
        <style>{`@keyframes sheet-up{from{transform:translateY(40px);opacity:0}to{transform:translateY(0);opacity:1}}`}</style>

        <div className="flex items-start justify-between mb-4">
          <div>
            <div
              className="text-[11px] font-medium uppercase mb-0.5"
              style={{ color: "var(--mute)", letterSpacing: "0.05em" }}
            >
              Modify order
            </div>
            <div className="text-[18px] font-semibold flex items-baseline gap-2">
              <span>{order.instrument}</span>
              <span
                className="text-[12px] font-medium px-2 py-0.5"
                style={{
                  background:
                    sideKey === "B" ? "var(--pos-bg)" : "var(--neg-bg)",
                  color: sideKey === "B" ? "var(--pos)" : "var(--neg)",
                  borderRadius: 4,
                }}
              >
                {SIDE_LABEL[sideKey] ?? sideKey}
              </span>
              <span
                className="text-[13px] font-normal"
                style={{ color: "var(--text-2)" }}
              >
                {TYPE_LABEL[order.type] ?? order.type}
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

        {isMarket ? (
          <>
            <div
              className="text-[13px] px-3 py-3 mb-4"
              style={{
                background: "var(--panel-2)",
                color: "var(--text-2)",
                borderRadius: 6,
              }}
            >
              Market orders can't be modified after submission — they fill
              immediately. Cancel and re-place if you need different
              parameters.
            </div>
            <button
              type="button"
              onClick={onClose}
              className="w-full text-[14px] font-semibold cursor-pointer border-0"
              style={{
                padding: 12,
                borderRadius: "var(--r)",
                background: "var(--accent)",
                color: "white",
              }}
            >
              Dismiss
            </button>
          </>
        ) : (
          <>
            <div className="flex flex-col gap-3">
              <label className="flex flex-col gap-1">
                <span
                  className="text-[11px] font-medium uppercase"
                  style={{ color: "var(--mute)", letterSpacing: "0.04em" }}
                >
                  Rate
                </span>
                <input
                  type="number"
                  min={0}
                  step="any"
                  value={rate ?? ""}
                  onChange={(e) =>
                    setRate(e.target.value ? Number(e.target.value) : undefined)
                  }
                  placeholder={initRate?.toFixed(digits)}
                  className="font-mono tabular-nums"
                  style={inputStyle}
                />
              </label>

              <label className="flex flex-col gap-1">
                <span
                  className="text-[11px] font-medium uppercase"
                  style={{ color: "var(--mute)", letterSpacing: "0.04em" }}
                >
                  Stop (SL)
                </span>
                <input
                  type="number"
                  min={0}
                  step="any"
                  value={stop ?? ""}
                  onChange={(e) =>
                    setStop(e.target.value ? Number(e.target.value) : undefined)
                  }
                  placeholder="—"
                  className="font-mono tabular-nums"
                  style={inputStyle}
                />
              </label>

              <label className="flex flex-col gap-1">
                <span
                  className="text-[11px] font-medium uppercase"
                  style={{ color: "var(--mute)", letterSpacing: "0.04em" }}
                >
                  Limit (TP)
                </span>
                <input
                  type="number"
                  min={0}
                  step="any"
                  value={limit ?? ""}
                  onChange={(e) =>
                    setLimit(e.target.value ? Number(e.target.value) : undefined)
                  }
                  placeholder="—"
                  className="font-mono tabular-nums"
                  style={inputStyle}
                />
              </label>

              {upcrossWarn && (
                <div
                  className="text-[12px] px-3 py-2"
                  style={{
                    background: "var(--warn-bg)",
                    color: "var(--warn)",
                    borderRadius: 6,
                  }}
                >
                  Limit (TP) above entry rate on a BUY would cross
                  immediately. Submit anyway?
                </div>
              )}

              {submitError && (
                <div
                  className="text-[12px] px-3 py-2"
                  style={{
                    background: "var(--neg-bg)",
                    color: "var(--neg)",
                    borderRadius: 6,
                  }}
                >
                  Modify failed: {submitError}
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={save}
              disabled={modify.isPending || !dirty || rateInvalid}
              className="w-full mt-5 text-[14px] font-semibold cursor-pointer border-0"
              style={{
                padding: "12px",
                borderRadius: "var(--r)",
                background: "var(--accent)",
                color: "white",
                opacity:
                  modify.isPending || !dirty || rateInvalid ? 0.6 : 1,
              }}
            >
              {modify.isPending
                ? "Saving…"
                : !dirty
                  ? "No changes"
                  : "Save changes"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
