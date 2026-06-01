import { useState, useEffect } from "react";
import { useFxcmDisplayNames, useFxcmMargin, useFxcmSubmitOrder, useFxcmUnderlyingUnit } from "../../data/hooks";
import { isForexPair } from "../../lib/asset-class";
import { useFxcmView } from "../../lib/fxcm-view";
import { useAutoSelect } from "./orderSheetParts";
import type { FxcmPrice } from "../../types";

const money = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD" });

interface Props {
  instruments: FxcmPrice[];
  defaultInstrument?: string;
  // Pre-select Buy or Sell — used when opening from the floating TradeBar
  // (mirrors Alpaca's OrderSheet `defaultSide`). "B" = buy, "S" = sell.
  defaultSide?: "B" | "S";
  onClose: () => void;
  onSubmitted?: () => void;
}

// FXCM's Trading Station collapses Stop/Limit Entry into a single "Entry"
// type — FCLite still needs SE vs LE on submit, but the choice is derived
// from rate vs live market: BUY rate > ask → SE, < bid → LE (sell inverse).
const ORDER_TYPES = [
  { value: "OM", label: "Market" },
  { value: "EN", label: "Entry" },
] as const;
type UiOrderType = (typeof ORDER_TYPES)[number]["value"];

export default function FxcmOrderSheet({ instruments, defaultInstrument, defaultSide, onClose, onSubmitted }: Props) {
  const dn = useFxcmDisplayNames();
  const unit = useFxcmUnderlyingUnit();
  const [instrument, setInstrument] = useState(defaultInstrument || instruments[0]?.instrument || "EUR/USD");
  const [side, setSide] = useState<"B" | "S">(defaultSide ?? "B");
  const [orderType, setOrderType] = useState<UiOrderType>("OM");
  const [amount, setAmount] = useState("1000"); // reset by useEffect when instrument changes
  const [rate, setRate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const submit = useFxcmSubmitOrder();
  const submitting = submit.isPending;
  // Open with the amount field highlighted (launched from the TradeBar).
  const amountRef = useAutoSelect(true);

  // Subscribe the selected instrument so its live row carries instrument_type /
  // base_unit_size / digits (the bridge only resolves that metadata for
  // status-T instruments). Without this, opening the ticket for a non-subscribed
  // CFD left selectedPrice metadata-less and the lot defaulted to FX 1000.
  useFxcmView(instrument);

  const needsRate = orderType === "EN";
  const selectedPrice = instruments.find((p) => p.instrument === instrument);
  const liveRate = side === "B" ? selectedPrice?.ask : selectedPrice?.bid;

  // InstrumentType 1 = FX pair (1000-unit lots); others use BaseUnitSize. The
  // authoritative type comes from the live /prices row, but that's only present
  // once subscribed — fall back to a symbol-based forex check so a non-FX
  // instrument (e.g. JPN225) doesn't wrongly default to 1,000-unit FX lots
  // before its metadata arrives. Mirrors FxcmOrderTicketInline.
  const isFx = selectedPrice?.instrument_type != null
    ? selectedPrice.instrument_type === 1
    : isForexPair(instrument);
  const amountStep = isFx ? 1000 : (selectedPrice?.base_unit_size ?? 1);

  // Required margin (EMR per base_unit_size lot, scaled to the order amount) and
  // available (free) margin, from the bridge's margin provider.
  const { data: margin } = useFxcmMargin(instrument);
  const lotUnits = margin?.base_unit_size || amountStep || 1;
  const perLot = margin?.emr || margin?.mmr;
  const amtNum = parseInt(amount, 10);
  const requiredMargin =
    perLot != null && amtNum > 0 ? (amtNum / lotUnits) * perLot : undefined;
  const availMargin = margin?.usable_margin;
  const insufficient =
    requiredMargin != null && availMargin != null && requiredMargin > availMargin;

  // Reset amount to the correct step whenever the instrument changes.
  useEffect(() => {
    setAmount(String(amountStep));
  }, [amountStep]);

  async function handleSubmit() {
    setError(null);
    const parsedAmount = parseInt(amount, 10);
    if (!parsedAmount || parsedAmount < 1) {
      setError("Amount must be a positive number");
      return;
    }
    if (needsRate && !rate) {
      setError("Rate is required for an entry order");
      return;
    }
    let bridgeType: "OM" | "SE" | "LE" = "OM";
    if (orderType === "EN") {
      const r = parseFloat(rate);
      const bid = selectedPrice?.bid ?? 0;
      const ask = selectedPrice?.ask ?? 0;
      // Stop-entry triggers when price moves with momentum past the rate;
      // limit-entry triggers when price retraces to the rate. Default to LE
      // when we have no live quote rather than fabricate a side.
      if (side === "B") bridgeType = ask && r > ask ? "SE" : "LE";
      else bridgeType = bid && r < bid ? "SE" : "LE";
    }
    try {
      await submit.mutateAsync({
        instrument,
        buy_sell: side,
        amount: parsedAmount,
        order_type: bridgeType,
        rate: rate ? parseFloat(rate) : undefined,
      });
      onSubmitted?.();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Order failed");
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
              <option key={p.instrument} value={p.instrument}>{dn(p.instrument)}</option>
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
          <label className="text-[11.5px]" style={{ color: "var(--mute)" }}>Amount ({unit(instrument)})</label>
          <input
            ref={amountRef}
            type="number"
            min={amountStep}
            step={amountStep}
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

        {/* Margin: required for this order + available (free) */}
        <div className="flex items-center justify-between text-[12px]" style={{ color: "var(--mute)" }}>
          <span>
            Required margin{" "}
            <span
              className="font-mono tabular-nums"
              style={{ color: insufficient ? "var(--neg)" : "var(--text-2)" }}
            >
              {requiredMargin != null ? money(requiredMargin) : "—"}
            </span>
          </span>
          <span>
            Available{" "}
            <span className="font-mono tabular-nums" style={{ color: "var(--text-2)" }}>
              {availMargin != null ? money(availMargin) : "—"}
            </span>
          </span>
        </div>

        {/* Rate (limit/stop only) */}
        {needsRate && (
          <div className="flex flex-col gap-1">
            <label className="text-[11.5px]" style={{ color: "var(--mute)" }}>
              Rate
              {liveRate != null && (
                <span style={{ color: "var(--text-2)", marginLeft: 6 }}>
                  (live: {liveRate.toFixed(selectedPrice?.digits ?? (instrument.includes("JPY") ? 3 : 5))})
                </span>
              )}
            </label>
            <input
              type="number"
              step="0.00001"
              value={rate}
              onChange={(e) => setRate(e.target.value)}
              placeholder={liveRate?.toFixed(selectedPrice?.digits ?? (instrument.includes("JPY") ? 3 : 5))}
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
          {submitting ? "Submitting…" : `${side === "B" ? "Buy" : "Sell"} ${dn(instrument)}`}
        </button>
      </div>
    </div>
  );
}
