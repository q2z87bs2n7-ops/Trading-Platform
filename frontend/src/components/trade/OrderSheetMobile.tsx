import { useState } from "react";

import { useOrderTicket } from "../../hooks/useOrderTicket";
import type { Account } from "../../types";
import ErrorBanner from "../ErrorBanner";
import {
  AmountToggle,
  DollarInput,
  MobileHalfSheet,
  TIF_LABEL,
  TYPE_LABEL,
  money,
  segStyle,
  useAutoSelect,
} from "./orderSheetParts";

// Mobile-first order ticket. Same useOrderTicket instance as the parent
// (passed in via `t`) — presentation only, no business logic here.
export default function OrderSheetMobile({
  t,
  account,
  onClose,
}: {
  t: ReturnType<typeof useOrderTicket>;
  account: Account | undefined;
  onClose: () => void;
}) {
  const [typeSheet, setTypeSheet] = useState(false);
  const [advSheet, setAdvSheet] = useState(false);

  const bp =
    (t.isCrypto ? account?.non_marginable_buying_power : account?.buying_power) ?? 0;
  const fractional = !!t.asset?.fractionable;
  const roundQty = (n: number) =>
    fractional ? Math.floor(n * 100) / 100 : Math.floor(n);
  const maxRaw = t.quote?.mid && t.quote.mid > 0 ? bp / t.quote.mid : null;
  const maxQty = maxRaw != null ? roundQty(maxRaw) : null;
  const step = fractional ? 0.01 : 1;
  const bumpQty = (delta: number) =>
    t.setQty(Math.max(0, Number((t.qty + delta).toFixed(fractional ? 2 : 0))));
  const afterOrder =
    t.estNotional != null && account
      ? t.side === "buy"
        ? bp - t.estNotional
        : bp + t.estNotional
      : null;

  const firstTypes = t.availableOrderTypes.slice(0, 3);
  const hasMoreTypes = t.availableOrderTypes.length > 3;
  const moreActive = !firstTypes.includes(t.type);
  const dollars = t.amountMode === "dollars" && t.notionalEligible;
  // Open with the amount field highlighted (launched from the TradeBar).
  const qtyRef = useAutoSelect(!dollars);
  const dollarFills = [100, 500, 1000];
  const advSubtitle =
    TIF_LABEL[t.tif] +
    (t.isCrypto ? "" : t.extHoursOn ? " · ext hours" : " · no ext hours");

  const priceInputStyle: React.CSSProperties = {
    width: "100%",
    padding: "16px",
    background: "var(--panel-2)",
    border: "1px solid var(--border)",
    borderRadius: "var(--r)",
    color: "var(--text)",
    fontSize: 22,
  };
  const priceLabel = (text: string) => (
    <span
      className="text-[11px] font-medium uppercase"
      style={{ color: "var(--mute)", letterSpacing: "0.04em" }}
    >
      {text}
    </span>
  );

  return (
    <div
      role="dialog"
      aria-modal
      className="fixed inset-0 z-50 flex"
      style={{ background: "rgba(20, 22, 28, 0.45)" }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full flex flex-col"
        style={{
          height: "100dvh",
          background: "var(--panel)",
          boxShadow: "var(--shadow-lg)",
          paddingTop: "max(var(--safe-top), 12px)",
        }}
      >
        {/* (a) Header — symbol chip mirrors the TradeBar dock chip's shape. */}
        <div
          className="flex items-center justify-between mb-3"
          style={{ padding: "0 16px" }}
        >
          <div className="flex items-baseline gap-3 min-w-0">
            <span
              className="inline-flex items-center font-semibold tabular-nums shrink-0"
              style={{
                background: "var(--panel-2)",
                borderRadius: 6,
                padding: "5px 10px",
                fontSize: 16,
                letterSpacing: "-0.005em",
              }}
            >
              {t.symbol || "—"}
            </span>
            {t.quote && (
              <span
                className="font-mono text-[15px] tabular-nums"
                style={{ color: "var(--text-2)" }}
              >
                {money(t.quote.mid)}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-[14px] cursor-pointer border-0 shrink-0"
            style={{
              background: "var(--panel-2)",
              color: "var(--text-2)",
              width: 36,
              height: 36,
              borderRadius: "var(--r)",
            }}
          >
            ✕
          </button>
        </div>

        {/* Scrollable body */}
        <div
          className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-4"
          style={{ padding: "0 16px 16px" }}
        >
          {/* (b) Side toggle */}
          <div className="grid gap-2" style={{ gridTemplateColumns: "1fr 1fr" }}>
            {(["buy", "sell"] as const).map((s) => {
              const active = t.side === s;
              const color = s === "buy" ? "var(--pos)" : "var(--neg)";
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => t.setSide(s)}
                  className="font-semibold cursor-pointer"
                  style={{
                    height: 56,
                    borderRadius: "var(--r)",
                    border: `1.5px solid ${active ? color : "var(--border)"}`,
                    background: active ? color : "transparent",
                    color: active ? "white" : "var(--text-2)",
                    fontSize: 16,
                  }}
                >
                  {s === "buy" ? "Buy" : "Sell"}
                </button>
              );
            })}
          </div>

          {/* (c) Order type */}
          <div
            className="grid gap-1.5"
            style={{
              gridTemplateColumns: `repeat(${hasMoreTypes ? 4 : firstTypes.length}, 1fr)`,
            }}
          >
            {firstTypes.map((ot) => (
              <button
                key={ot}
                type="button"
                onClick={() => t.setType(ot)}
                className="cursor-pointer"
                style={segStyle(t.type === ot)}
              >
                {TYPE_LABEL[ot]}
              </button>
            ))}
            {hasMoreTypes && (
              <button
                type="button"
                onClick={() => setTypeSheet(true)}
                className="cursor-pointer"
                style={segStyle(moreActive)}
              >
                {moreActive ? TYPE_LABEL[t.type] : "More"} ▾
              </button>
            )}
          </div>

          {/* (d) Quantity / dollar amount */}
          <div>
            {t.notionalEligible && (
              <div className="flex justify-end mb-2">
                <AmountToggle
                  mode={t.amountMode}
                  onChange={t.setAmountMode}
                  unitLabel={t.isCrypto ? "Units" : "Shares"}
                />
              </div>
            )}
            {dollars ? (
              <DollarInput value={t.notional} onChange={t.setNotional} big autoFocus />
            ) : (
              <div
                className="flex items-stretch"
                style={{
                  height: 56,
                  border: "1px solid var(--border)",
                  borderRadius: "var(--r)",
                  overflow: "hidden",
                }}
              >
                <button
                  type="button"
                  aria-label="Decrease quantity"
                  onClick={() => bumpQty(-step)}
                  className="cursor-pointer border-0"
                  style={{ width: 56, background: "var(--panel-2)", color: "var(--text-2)", fontSize: 26 }}
                >
                  −
                </button>
                <input
                  ref={qtyRef}
                  type="number"
                  min={0}
                  step={step}
                  value={t.qty || ""}
                  onChange={(e) => t.setQty(e.target.value ? Number(e.target.value) : 0)}
                  className="text-center flex-1 border-0 outline-none font-mono tabular-nums"
                  style={{
                    background: "var(--panel)",
                    color: "var(--text)",
                    fontSize: 28,
                    minWidth: 0,
                    MozAppearance: "textfield",
                  }}
                />
                <button
                  type="button"
                  aria-label="Increase quantity"
                  onClick={() => bumpQty(step)}
                  className="cursor-pointer border-0"
                  style={{ width: 56, background: "var(--panel-2)", color: "var(--text-2)", fontSize: 26 }}
                >
                  +
                </button>
              </div>
            )}
            {dollars ? (
              <div
                className="grid gap-2 mt-2"
                style={{ gridTemplateColumns: "repeat(3, 1fr)" }}
              >
                {dollarFills.map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => t.setNotional(d)}
                    className="cursor-pointer"
                    style={segStyle(t.notional === d)}
                  >
                    {money(d)}
                  </button>
                ))}
              </div>
            ) : (
              maxRaw != null &&
              maxRaw > 0 && (
                <div
                  className="grid gap-2 mt-2"
                  style={{ gridTemplateColumns: "repeat(3, 1fr)" }}
                >
                  {(
                    [
                      ["25%", roundQty(maxRaw * 0.25)],
                      ["50%", roundQty(maxRaw * 0.5)],
                      ["MAX", maxQty ?? 0],
                    ] as [string, number][]
                  ).map(([label, q]) => (
                    <button
                      key={label}
                      type="button"
                      onClick={() => t.setQty(q)}
                      className="cursor-pointer"
                      style={segStyle(t.qty === q && q > 0)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              )
            )}
          </div>

          {/* (e) Conditional price fields */}
          {t.needsLimit && (
            <label className="flex flex-col gap-1.5">
              {priceLabel("Limit price")}
              <input
                type="number"
                min={0}
                step="any"
                value={t.limitPrice ?? ""}
                onChange={(e) =>
                  t.setLimitPrice(e.target.value ? Number(e.target.value) : undefined)
                }
                className="font-mono tabular-nums"
                style={priceInputStyle}
              />
            </label>
          )}
          {t.needsStop && (
            <label className="flex flex-col gap-1.5">
              {priceLabel("Stop price")}
              <input
                type="number"
                min={0}
                step="any"
                value={t.stopPrice ?? ""}
                onChange={(e) =>
                  t.setStopPrice(e.target.value ? Number(e.target.value) : undefined)
                }
                className="font-mono tabular-nums"
                style={priceInputStyle}
              />
            </label>
          )}
          {t.needsTrail && (
            <label className="flex flex-col gap-1.5">
              {priceLabel("Trail %")}
              <input
                type="number"
                min={0}
                step="any"
                value={t.trailPct ?? ""}
                onChange={(e) =>
                  t.setTrailPct(e.target.value ? Number(e.target.value) : undefined)
                }
                className="font-mono tabular-nums"
                style={priceInputStyle}
              />
            </label>
          )}

          {/* (f) Advanced row */}
          <button
            type="button"
            onClick={() => setAdvSheet(true)}
            className="cursor-pointer text-left flex items-center justify-between"
            style={{
              minHeight: 56,
              padding: "10px 16px",
              border: "1px solid var(--border)",
              borderRadius: "var(--r)",
              background: "var(--panel-2)",
            }}
          >
            <span className="flex flex-col">
              <span className="text-[14px] font-medium">Advanced</span>
              <span className="text-[12px]" style={{ color: "var(--mute)" }}>
                {advSubtitle}
              </span>
            </span>
            <span style={{ color: "var(--mute)" }}>▾</span>
          </button>

          {t.shortNote && (
            <div className="text-[12px]" style={{ color: "var(--mute)" }}>
              {t.shortNote}
            </div>
          )}
          {t.submit.isSuccess && t.submit.data && (
            <div
              className="text-[12.5px] px-3 py-2"
              style={{
                background: "var(--pos-bg)",
                color: "var(--pos)",
                borderRadius: "var(--r)",
              }}
            >
              Submitted · {t.submit.data.status} · id{" "}
              {t.submit.data.id.slice(0, 8)}
            </div>
          )}
        </div>

        {/* (g) Sticky footer */}
        <div
          style={{
            borderTop: "1px solid var(--hairline)",
            padding: "12px 16px",
            paddingBottom: "max(var(--safe-bottom), 12px)",
            background: "var(--panel)",
          }}
        >
          <div className="flex justify-between text-[12.5px] mb-1.5">
            <span style={{ color: "var(--mute)" }}>
              Est. {t.side === "buy" ? "cost" : "proceeds"}
              <span>
                {" · @ "}
                {t.type === "market"
                  ? "market"
                  : t.type === "trailing_stop"
                    ? "trail"
                    : t.type === "stop"
                      ? "stop"
                      : "limit"}
              </span>
            </span>
            <span className="font-mono tabular-nums">
              {t.estNotional != null ? money(t.estNotional) : "—"}
            </span>
          </div>
          {afterOrder != null && (
            <div className="flex justify-between text-[12.5px] mb-2.5">
              <span style={{ color: "var(--mute)" }}>BP after</span>
              <span
                className="font-mono tabular-nums"
                style={{ color: afterOrder < 0 ? "var(--neg)" : "var(--text)" }}
              >
                {money(afterOrder)}
              </span>
            </div>
          )}
          {t.submit.error && (
            <div className="mb-2">
              <ErrorBanner message={(t.submit.error as Error).message} />
            </div>
          )}
          <button
            type="button"
            disabled={!!t.clientError || t.submit.isPending}
            onClick={() => t.trySubmit()}
            className="w-full text-[15px] font-semibold cursor-pointer border-0"
            style={{
              padding: "14px",
              minHeight: "var(--mob-tap)",
              borderRadius: "var(--r)",
              background: t.side === "buy" ? "var(--pos)" : "var(--neg)",
              color: "white",
              opacity: t.clientError || t.submit.isPending ? 0.55 : 1,
            }}
          >
            {t.submit.isPending
              ? "Submitting…"
              : t.clientError
                ? t.clientError
                : dollars
                  ? `${t.side === "buy" ? "Buy" : "Sell"} ${t.symbol || "—"} · ${t.notional ? money(t.notional) : "—"}`
                  : `${t.side === "buy" ? "Buy" : "Sell"} ${t.qty || "—"} ${t.symbol || "—"}` +
                    (t.estNotional ? ` · ${money(t.estNotional)}` : "")}
          </button>
        </div>
      </div>

      {/* Order type picker */}
      {typeSheet && (
        <MobileHalfSheet title="Order type" onClose={() => setTypeSheet(false)}>
          <div className="flex flex-col gap-2">
            {t.availableOrderTypes.map((ot) => {
              const active = t.type === ot;
              return (
                <button
                  key={ot}
                  type="button"
                  onClick={() => {
                    t.setType(ot);
                    setTypeSheet(false);
                  }}
                  className="text-left cursor-pointer"
                  style={{
                    minHeight: "var(--mob-tap)",
                    padding: "12px 14px",
                    borderRadius: "var(--r)",
                    border: `1px solid ${active ? "var(--accent)" : "var(--border)"}`,
                    background: active ? "var(--accent-bg)" : "var(--panel-2)",
                    color: active ? "var(--accent)" : "var(--text)",
                    fontSize: 15,
                  }}
                >
                  {TYPE_LABEL[ot]}
                </button>
              );
            })}
          </div>
        </MobileHalfSheet>
      )}

      {/* Advanced — TIF + extended hours */}
      {advSheet && (
        <MobileHalfSheet title="Advanced" onClose={() => setAdvSheet(false)}>
          <div
            className="text-[11px] font-medium uppercase mb-2"
            style={{ color: "var(--mute)", letterSpacing: "0.04em" }}
          >
            Time in force
          </div>
          <div className="flex flex-wrap gap-2">
            {t.availableTifs.map((x) => {
              const active = t.tif === x;
              return (
                <button
                  key={x}
                  type="button"
                  onClick={() => t.setTif(x)}
                  className="cursor-pointer font-medium"
                  style={{
                    minHeight: "var(--mob-tap)",
                    padding: "0 16px",
                    borderRadius: "var(--r)",
                    border: `1px solid ${active ? "var(--accent)" : "var(--border)"}`,
                    background: active ? "var(--accent-bg)" : "transparent",
                    color: active ? "var(--accent)" : "var(--text-2)",
                    fontSize: 14,
                  }}
                >
                  {TIF_LABEL[x]}
                </button>
              );
            })}
          </div>
          {!t.isCrypto && (
            <button
              type="button"
              disabled={!t.extHoursEligible}
              onClick={() => t.setExtHours(!t.extHoursOn)}
              className="w-full text-left cursor-pointer flex items-center justify-between mt-4"
              style={{
                minHeight: "var(--mob-tap)",
                padding: "10px 14px",
                borderRadius: "var(--r)",
                border: "1px solid var(--border)",
                background: "var(--panel-2)",
                opacity: t.extHoursEligible ? 1 : 0.5,
              }}
            >
              <span className="flex flex-col">
                <span className="text-[14px]">Extended hours</span>
                {!t.extHoursEligible && (
                  <span className="text-[12px]" style={{ color: "var(--mute)" }}>
                    limit + DAY/GTC only
                  </span>
                )}
              </span>
              <span
                aria-hidden
                style={{
                  width: 44,
                  height: 26,
                  borderRadius: 999,
                  background: t.extHoursOn ? "var(--accent)" : "var(--panel-3)",
                  padding: 2,
                  display: "inline-flex",
                  flexShrink: 0,
                }}
              >
                <span
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: "50%",
                    background: "var(--panel)",
                    transform: t.extHoursOn ? "translateX(18px)" : "translateX(0)",
                    transition: "transform 0.15s",
                  }}
                />
              </span>
            </button>
          )}
        </MobileHalfSheet>
      )}
    </div>
  );
}
