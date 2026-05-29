import { useEffect, useState } from "react";

import {
  useFxcmDisplayNames,
  useFxcmPrices,
  useFxcmSubmitOrder,
  useFxcmUnderlyingUnit,
} from "../../data/hooks";
import { cfdDigits } from "../../lib/format";
import { isForexPair } from "../../lib/asset-class";

/**
 * Inline CFD order ticket for the Workspace Trade widget — the CFD analogue of
 * OrderTicketInline. Symbol fixed by the linked channel (no instrument
 * dropdown); Buy/Sell · Market/Entry · amount · rate, submitting through
 * useFxcmSubmitOrder. The SE-vs-LE derivation mirrors FxcmOrderSheet (FXCM
 * collapses stop/limit entry into one "Entry" type; the bridge needs the split
 * derived from rate vs live market).
 */

const ORDER_TYPES = [
  { value: "OM", label: "Market" },
  { value: "EN", label: "Entry" },
] as const;
type UiOrderType = (typeof ORDER_TYPES)[number]["value"];

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="text-[11px] font-medium uppercase mb-1.5"
      style={{ color: "var(--mute)", letterSpacing: "0.04em" }}
    >
      {children}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  background: "var(--panel-2)",
  border: "1px solid var(--border)",
  borderRadius: "var(--r)",
  padding: "8px 10px",
  color: "var(--text)",
  fontSize: 14,
};

export default function FxcmOrderTicketInline({ instrument }: { instrument: string }) {
  const { data: prices } = useFxcmPrices(true);
  const dn = useFxcmDisplayNames();
  const unit = useFxcmUnderlyingUnit();
  const submit = useFxcmSubmitOrder();

  const [side, setSide] = useState<"B" | "S">("B");
  const [orderType, setOrderType] = useState<UiOrderType>("OM");
  const [amount, setAmount] = useState("1000");
  const [rate, setRate] = useState("");
  const [error, setError] = useState<string | null>(null);

  const price = (prices ?? []).find((p) => p.instrument === instrument);
  const digits = price?.digits ?? cfdDigits(instrument);
  const liveRate = side === "B" ? price?.ask : price?.bid;
  const needsRate = orderType === "EN";

  // InstrumentType 1 = FX pair (1000-unit lots); others use BaseUnitSize. The
  // authoritative type comes from the live /prices row, but that's only present
  // for subscribed instruments — fall back to a fiat-pair check so a non-FX
  // instrument linked from search (not yet subscribed) doesn't wrongly default
  // to 1,000-unit FX lots.
  const isFx = price ? price.instrument_type === 1 : isForexPair(instrument);
  const amountStep = isFx ? 1000 : price?.base_unit_size ?? 1;

  // Reset the amount to the instrument's step when the instrument (or its
  // step) changes — switching channel symbol must not keep an invalid lot.
  useEffect(() => {
    setAmount(String(amountStep));
  }, [amountStep, instrument]);

  // Clear after a successful submit so the panel is ready for the next order.
  useEffect(() => {
    if (!submit.isSuccess) return;
    const id = setTimeout(() => submit.reset(), 1500);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submit.isSuccess]);

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
      const bid = price?.bid ?? 0;
      const ask = price?.ask ?? 0;
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
    } catch (e) {
      setError(e instanceof Error ? e.message : "Order failed");
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[15px] font-semibold">{dn(instrument) || "—"}</span>
        {liveRate != null && (
          <span
            className="font-mono text-[13px] tabular-nums"
            style={{ color: "var(--text-2)" }}
          >
            {liveRate.toFixed(digits)}
          </span>
        )}
      </div>

      <div className="grid gap-2" style={{ gridTemplateColumns: "1fr 1fr" }}>
        {(["B", "S"] as const).map((s) => {
          const active = side === s;
          const color = s === "B" ? "var(--pos)" : "var(--neg)";
          return (
            <button
              key={s}
              type="button"
              onClick={() => setSide(s)}
              className="text-[14px] font-semibold cursor-pointer"
              style={{
                padding: "10px",
                borderRadius: "var(--r)",
                border: `1.5px solid ${active ? color : "var(--border)"}`,
                background: active ? color : "transparent",
                color: active ? "white" : "var(--text-2)",
              }}
            >
              {s === "B" ? "Buy" : "Sell"}
            </button>
          );
        })}
      </div>

      <div>
        <Label>Order type</Label>
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

      <div>
        <Label>Amount ({unit(instrument)})</Label>
        <input
          type="number"
          min={amountStep}
          step={amountStep}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="font-mono tabular-nums w-full"
          style={inputStyle}
        />
      </div>

      {needsRate && (
        <div>
          <Label>
            Rate
            {liveRate != null && (
              <span style={{ color: "var(--text-2)", marginLeft: 6 }}>
                live {liveRate.toFixed(digits)}
              </span>
            )}
          </Label>
          <input
            type="number"
            step="any"
            value={rate}
            onChange={(e) => setRate(e.target.value)}
            placeholder={liveRate?.toFixed(digits)}
            className="font-mono tabular-nums w-full"
            style={inputStyle}
          />
        </div>
      )}

      {error && (
        <p className="text-[12px]" style={{ color: "var(--neg)", margin: 0 }}>
          {error}
        </p>
      )}
      {submit.isSuccess && submit.data && (
        <div
          className="text-[12.5px] px-3 py-2"
          style={{
            background: "var(--pos-bg)",
            color: "var(--pos)",
            borderRadius: "var(--r)",
          }}
        >
          Order submitted.
        </div>
      )}

      <button
        type="button"
        onClick={handleSubmit}
        disabled={submit.isPending}
        className="w-full py-3 rounded-card text-[14px] font-semibold border-0 cursor-pointer"
        style={{
          background: side === "B" ? "var(--pos)" : "var(--neg)",
          color: "#fff",
          opacity: submit.isPending ? 0.6 : 1,
        }}
      >
        {submit.isPending
          ? "Submitting…"
          : `${side === "B" ? "Buy" : "Sell"} ${dn(instrument)}`}
      </button>
    </div>
  );
}
