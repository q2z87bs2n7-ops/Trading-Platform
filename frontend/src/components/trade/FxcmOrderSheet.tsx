import { useState } from "react";
import * as api from "../../api";
import type { FxcmPrice } from "../../types";

interface Props {
  instruments: FxcmPrice[];
  defaultInstrument?: string;
  onClose: () => void;
  onSubmitted?: () => void;
}

const ORDER_TYPES = [
  { value: "OM", label: "Market" },
  { value: "SE", label: "Stop Entry" },
  { value: "LE", label: "Limit Entry" },
] as const;

export default function FxcmOrderSheet({ instruments, defaultInstrument, onClose, onSubmitted }: Props) {
  const [instrument, setInstrument] = useState(defaultInstrument || instruments[0]?.instrument || "EUR/USD");
  const [side, setSide] = useState<"B" | "S">("B");
  const [orderType, setOrderType] = useState<"OM" | "SE" | "LE">("OM");
  const [amount, setAmount] = useState("1000");
  const [rate, setRate] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const needsRate = orderType !== "OM";
  const selectedPrice = instruments.find((p) => p.instrument === instrument);
  const liveRate = side === "B" ? selectedPrice?.ask : selectedPrice?.bid;

  async function handleSubmit() {
    setError(null);
    const parsedAmount = parseInt(amount, 10);
    if (!parsedAmount || parsedAmount < 1) {
      setError("Amount must be a positive number");
      return;
    }
    if (needsRate && !rate) {
      setError("Rate is required for this order type");
      return;
    }
    setSubmitting(true);
    try {
      await api.submitFxcmOrder({
        instrument,
        buy_sell: side,
        amount: parsedAmount,
        order_type: orderType,
        rate: rate ? parseFloat(rate) : undefined,
      });
      onSubmitted?.();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Order failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 60,
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
        background: "rgba(0,0,0,0.45)",
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 440,
          background: "var(--panel)",
          border: "1px solid var(--border)",
          borderBottom: "none",
          borderRadius: "16px 16px 0 0",
          padding: "20px 20px 32px",
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <span className="text-[15px] font-semibold">New FXCM Order</span>
          <button
            type="button"
            onClick={onClose}
            className="border-0 bg-transparent cursor-pointer text-[18px] leading-none"
            style={{ color: "var(--mute)" }}
          >
            ×
          </button>
        </div>

        {/* Instrument */}
        <div className="flex flex-col gap-1">
          <label className="text-[11.5px]" style={{ color: "var(--mute)" }}>Instrument</label>
          <select
            value={instrument}
            onChange={(e) => setInstrument(e.target.value)}
            style={{
              background: "var(--panel-2)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              padding: "8px 10px",
              color: "var(--text)",
              fontSize: 13,
            }}
          >
            {instruments.map((p) => (
              <option key={p.instrument} value={p.instrument}>{p.instrument}</option>
            ))}
          </select>
        </div>

        {/* Buy / Sell */}
        <div className="flex gap-2">
          {(["B", "S"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSide(s)}
              className="flex-1 py-2.5 rounded-card text-[13px] font-semibold border-0 cursor-pointer transition-colors"
              style={{
                background: side === s
                  ? (s === "B" ? "var(--pos)" : "var(--neg)")
                  : "var(--panel-2)",
                color: side === s ? "#fff" : "var(--text-2)",
              }}
            >
              {s === "B" ? "Buy" : "Sell"}
            </button>
          ))}
        </div>

        {/* Order type */}
        <div className="flex flex-col gap-1">
          <label className="text-[11.5px]" style={{ color: "var(--mute)" }}>Order type</label>
          <div className="flex gap-2">
            {ORDER_TYPES.map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => setOrderType(t.value)}
                className="flex-1 py-1.5 rounded text-[12px] font-medium border cursor-pointer transition-colors"
                style={{
                  background: orderType === t.value ? "var(--accent-bg)" : "var(--panel-2)",
                  borderColor: orderType === t.value ? "var(--accent)" : "var(--border)",
                  color: orderType === t.value ? "var(--accent)" : "var(--text-2)",
                }}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Amount */}
        <div className="flex flex-col gap-1">
          <label className="text-[11.5px]" style={{ color: "var(--mute)" }}>Amount (units)</label>
          <input
            type="number"
            min={1}
            step={1000}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            style={{
              background: "var(--panel-2)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              padding: "8px 10px",
              color: "var(--text)",
              fontSize: 13,
            }}
          />
        </div>

        {/* Rate (limit/stop only) */}
        {needsRate && (
          <div className="flex flex-col gap-1">
            <label className="text-[11.5px]" style={{ color: "var(--mute)" }}>
              Rate
              {liveRate != null && (
                <span style={{ color: "var(--text-2)", marginLeft: 6 }}>
                  (live: {liveRate.toFixed(instrument.includes("JPY") ? 3 : 5)})
                </span>
              )}
            </label>
            <input
              type="number"
              step="0.00001"
              value={rate}
              onChange={(e) => setRate(e.target.value)}
              placeholder={liveRate?.toFixed(instrument.includes("JPY") ? 3 : 5)}
              style={{
                background: "var(--panel-2)",
                border: "1px solid var(--border)",
                borderRadius: 8,
                padding: "8px 10px",
                color: "var(--text)",
                fontSize: 13,
              }}
            />
          </div>
        )}

        {error && (
          <p className="text-[12px]" style={{ color: "var(--neg)", margin: 0 }}>{error}</p>
        )}

        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting}
          className="w-full py-3 rounded-card text-[14px] font-semibold border-0 cursor-pointer"
          style={{
            background: side === "B" ? "var(--pos)" : "var(--neg)",
            color: "#fff",
            opacity: submitting ? 0.6 : 1,
          }}
        >
          {submitting ? "Submitting…" : `${side === "B" ? "Buy" : "Sell"} ${instrument}`}
        </button>
      </div>
    </div>
  );
}
