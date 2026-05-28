import { useEffect, useState } from "react";

import { useFxcmClosePosition } from "../../data/hooks";
import { useMobile } from "../../hooks/useMobile";
import { showToast } from "../../lib/toast";

const money = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD" });

export interface FxcmClosePositionCardProps {
  instrument: string;
  side: "Long" | "Short";
  netQty: number;
  mark?: number;
  livePl?: number;
  // Underlying trade ids that make up the net position; partial-close is
  // consumed greedily across these in order (FXCM has no aggregate-close).
  tradeIds: string[];
  tradeAmounts?: number[]; // parallel to tradeIds; used for partial allocation
  digits?: number;
  onClose: () => void;
}

export default function FxcmClosePositionCard({
  instrument,
  side,
  netQty,
  mark,
  livePl,
  tradeIds,
  tradeAmounts,
  digits = 5,
  onClose,
}: FxcmClosePositionCardProps) {
  const isMobile = useMobile();
  const closeMutation = useFxcmClosePosition();
  const [amount, setAmount] = useState<number>(Math.max(1, Math.floor(netQty)));
  const [pending, setPending] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !pending) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, pending]);

  const plUp = (livePl ?? 0) >= 0;
  const clamped = Math.max(1, Math.min(Math.floor(amount || 0), Math.floor(netQty)));
  const isPartial = clamped < Math.floor(netQty);

  async function confirm() {
    setPending(true);
    setErrors([]);
    const failures: string[] = [];

    if (!isPartial) {
      // Full close — fire amount=0 per trade (bridge treats 0 as full).
      for (const tid of tradeIds) {
        try {
          await closeMutation.mutateAsync({ tradeId: tid, amount: 0 });
        } catch (e) {
          failures.push(`${tid}: ${(e as Error).message}`);
        }
      }
    } else {
      // Greedy allocation across underlying trades in input order.
      let remaining = clamped;
      const amounts =
        tradeAmounts && tradeAmounts.length === tradeIds.length
          ? tradeAmounts
          : tradeIds.map(() => Math.floor(netQty / tradeIds.length));
      for (let i = 0; i < tradeIds.length && remaining > 0; i++) {
        const tid = tradeIds[i];
        const tradeAmt = Math.floor(amounts[i] ?? 0);
        if (tradeAmt <= 0) continue;
        const take = Math.min(tradeAmt, remaining);
        try {
          await closeMutation.mutateAsync({ tradeId: tid, amount: take >= tradeAmt ? 0 : take });
          remaining -= take;
        } catch (e) {
          failures.push(`${tid}: ${(e as Error).message}`);
          remaining -= take; // don't infinite-loop on a bad trade
        }
      }
    }

    setPending(false);
    if (failures.length === 0) {
      showToast(`${instrument} close submitted`, "success");
      onClose();
    } else {
      setErrors(failures.map((f) => `Failed to close trade ${f}`));
    }
  }

  const summary = (
    <div className="flex flex-col gap-1">
      <div className="text-[14px]">
        Close <span style={{ fontWeight: 600 }}>{side}</span>{" "}
        <span className="font-mono tabular-nums">{netQty.toLocaleString()}</span>{" "}
        <span style={{ fontWeight: 600 }}>{instrument}</span>
        {mark != null && (
          <>
            {" @ ~"}
            <span className="font-mono tabular-nums">{mark.toFixed(digits)}</span>
          </>
        )}
      </div>
      {livePl != null && (
        <div
          className="font-mono tabular-nums text-[13px]"
          style={{ color: plUp ? "var(--pos)" : "var(--neg)" }}
        >
          {plUp ? "+" : ""}
          {money(livePl)} live P/L
        </div>
      )}
    </div>
  );

  const amountField = (
    <div className="flex flex-col gap-1">
      <label
        className="text-[11px] uppercase"
        style={{ color: "var(--mute)", letterSpacing: "0.05em" }}
      >
        Amount (units) — max {Math.floor(netQty).toLocaleString()}
      </label>
      <div className="flex gap-2 items-center">
        <input
          type="number"
          min={1}
          max={Math.floor(netQty)}
          step={1}
          value={amount}
          onChange={(e) => setAmount(Number(e.target.value))}
          disabled={pending}
          className="font-mono tabular-nums"
          style={{
            background: "var(--panel-2)",
            border: "1px solid var(--border)",
            borderRadius: "var(--r)",
            padding: "8px 10px",
            fontSize: 14,
            flex: 1,
            color: "var(--text)",
          }}
        />
        <button
          type="button"
          onClick={() => setAmount(Math.floor(netQty))}
          disabled={pending}
          className="text-[11.5px] font-medium cursor-pointer"
          style={{
            padding: "8px 12px",
            background: "var(--panel-2)",
            border: "1px solid var(--border)",
            borderRadius: "var(--r)",
            color: "var(--text-2)",
          }}
        >
          Max
        </button>
      </div>
      {isPartial && (
        <span className="text-[11px]" style={{ color: "var(--mute)" }}>
          Partial close — {clamped.toLocaleString()} of {Math.floor(netQty).toLocaleString()} units.
        </span>
      )}
    </div>
  );

  const confirmBtn = (
    <button
      type="button"
      onClick={confirm}
      disabled={pending}
      className="w-full text-[14px] font-semibold cursor-pointer border-0"
      style={{
        padding: "12px",
        borderRadius: "var(--r)",
        background: "var(--neg)",
        color: "white",
        opacity: pending ? 0.6 : 1,
      }}
    >
      {pending ? "Closing…" : isPartial ? `Close ${clamped.toLocaleString()} units` : `Close ${side} ${instrument}`}
    </button>
  );

  const cancelBtn = (
    <button
      type="button"
      onClick={onClose}
      disabled={pending}
      className="w-full text-[13.5px] font-medium cursor-pointer"
      style={{
        padding: "11px",
        borderRadius: "var(--r)",
        background: "transparent",
        border: "1px solid var(--border)",
        color: "var(--text-2)",
      }}
    >
      Cancel
    </button>
  );

  const errorList = errors.length > 0 && (
    <div
      className="flex flex-col gap-1 p-2 text-[12px]"
      style={{
        background: "color-mix(in oklch, var(--neg) 8%, transparent)",
        border: "1px solid color-mix(in oklch, var(--neg) 30%, transparent)",
        borderRadius: "var(--r)",
        color: "var(--neg)",
      }}
    >
      {errors.map((e, i) => (
        <div key={i}>{e}</div>
      ))}
    </div>
  );

  if (isMobile) {
    return (
      <div
        role="dialog"
        aria-modal
        className="fixed inset-0 z-50 flex flex-col"
        style={{ background: "var(--panel)" }}
      >
        <div
          className="flex items-center justify-between px-4"
          style={{
            paddingTop: "calc(var(--safe-top, 0px) + 12px)",
            paddingBottom: 12,
            borderBottom: "1px solid var(--border)",
          }}
        >
          <div className="text-[16px] font-semibold">Close position</div>
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            aria-label="Cancel"
            className="cursor-pointer border-0 text-[14px] grid place-items-center"
            style={{
              background: "var(--panel-2)",
              color: "var(--text-2)",
              width: 32,
              height: 32,
              borderRadius: 8,
            }}
          >
            ✕
          </button>
        </div>
        <div className="flex flex-col gap-4 px-4 py-4 flex-1 overflow-y-auto">
          {summary}
          {amountField}
          {errorList}
        </div>
        <div
          className="flex flex-col gap-2 px-4"
          style={{
            paddingTop: 12,
            paddingBottom: "calc(var(--safe-bottom, 0px) + 12px)",
            borderTop: "1px solid var(--border)",
            background: "var(--panel)",
          }}
        >
          {confirmBtn}
          {cancelBtn}
        </div>
      </div>
    );
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
      onClick={pending ? undefined : onClose}
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

        <div className="flex items-start justify-between mb-4">
          <div>
            <div
              className="text-[11px] font-medium uppercase mb-0.5"
              style={{ color: "var(--mute)", letterSpacing: "0.05em" }}
            >
              Close position
            </div>
            <div className="text-[18px] font-semibold">
              {instrument}
              <span
                className="ml-2 font-mono text-[14px] font-normal"
                style={{ color: "var(--text-2)" }}
              >
                {side} · {Math.floor(netQty).toLocaleString()} units
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
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

        <div
          className="grid grid-cols-2 gap-3 mb-4 p-3"
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
              Mark
            </span>
            <span className="font-mono text-[15px] tabular-nums">
              {mark != null ? mark.toFixed(digits) : "—"}
            </span>
          </div>
          <div className="flex flex-col">
            <span
              className="text-[11px] uppercase"
              style={{ color: "var(--mute)" }}
            >
              Live P/L
            </span>
            <span
              className="font-mono text-[15px] tabular-nums"
              style={{ color: plUp ? "var(--pos)" : "var(--neg)" }}
            >
              {livePl != null ? `${plUp ? "+" : ""}${money(livePl)}` : "—"}
            </span>
          </div>
        </div>

        <div className="mb-4">{amountField}</div>
        {errorList && <div className="mb-4">{errorList}</div>}

        <div className="flex flex-col gap-2">
          {confirmBtn}
          {cancelBtn}
        </div>
      </div>
    </div>
  );
}
