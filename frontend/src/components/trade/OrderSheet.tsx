// OrderSheet — slim shell + the desktop body. The mobile body lives in
// OrderSheetMobile.tsx; shared presentation primitives (Chip, Stepper,
// AmountToggle, DollarInput, MobileHalfSheet, segStyle, TYPE/TIF labels)
// live in orderSheetParts.tsx. useOrderTicket still owns all business
// logic — this file is presentation + lifecycle only.

import { useEffect } from "react";

import { useAccount } from "../../data/hooks";
import { useMobile } from "../../hooks/useMobile";
import { useOrderTicket } from "../../hooks/useOrderTicket";
import ErrorBanner from "../ErrorBanner";
import OrderSheetMobile from "./OrderSheetMobile";
import {
  AmountToggle,
  Chip,
  DollarInput,
  Stepper,
  TIF_LABEL,
  TYPE_LABEL,
  money,
} from "./orderSheetParts";

// Re-export the bits OrderTicketInline / other call sites still pull from
// "./OrderSheet" so the split is invisible to callers.
export {
  AmountToggle,
  Chip,
  DollarInput,
  MobileHalfSheet,
  Stepper,
  TIF_LABEL,
  TYPE_LABEL,
  segStyle,
} from "./orderSheetParts";

interface Props {
  open: boolean;
  symbol: string;
  defaultSide?: "buy" | "sell";
  defaultQty?: number;
  onClose: () => void;
}

export default function OrderSheet({
  open,
  symbol,
  defaultSide = "buy",
  defaultQty,
  onClose,
}: Props) {
  const t = useOrderTicket(symbol);
  const { data: account } = useAccount();
  const isMobile = useMobile();

  // Mirror caller-supplied defaults each time the sheet (re-)opens.
  useEffect(() => {
    if (!open) return;
    t.setSymbol(symbol);
    t.setSide(defaultSide);
    if (defaultQty != null) t.setQty(defaultQty);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Lock body scroll while the sheet is open.
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

  // Auto-close on successful submit, after a small "review" beat.
  useEffect(() => {
    if (!t.submit.isSuccess) return;
    const id = setTimeout(() => {
      onClose();
      t.reset();
    }, 1100);
    return () => clearTimeout(id);
  }, [t.submit.isSuccess, onClose, t]);

  if (!open) return null;
  if (isMobile)
    return <OrderSheetMobile t={t} account={account} onClose={onClose} />;

  const quickFills = [10, 50, 100];
  const dollarFills = [100, 500, 1000];
  const dollars = t.amountMode === "dollars" && t.notionalEligible;
  const bp =
    (t.isCrypto
      ? account?.non_marginable_buying_power
      : account?.buying_power) ?? 0;
  const maxQty =
    t.quote?.mid && t.quote.mid > 0 ? Math.floor(bp / t.quote.mid) : null;

  const afterOrder =
    t.estNotional != null && account
      ? t.side === "buy"
        ? bp - t.estNotional
        : bp + t.estNotional
      : null;

  const submitButton = (
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
  );

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
        className="w-full max-w-[1000px] max-h-[92vh] overflow-y-auto"
        style={{
          background: "var(--panel)",
          borderTopLeftRadius: "var(--r-xl)",
          borderTopRightRadius: "var(--r-xl)",
          boxShadow: "var(--shadow-lg)",
          padding: "24px 28px 28px",
          animation: "sheet-up 220ms ease",
        }}
      >
        <style>{`@keyframes sheet-up{from{transform:translateY(40px);opacity:0}to{transform:translateY(0);opacity:1}}`}</style>

        {/* Header — symbol chip mirrors the TradeBar dock chip's shape so
            the sheet reads as a continuation, not a new modal. */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-baseline gap-3 flex-wrap">
            <span
              className="inline-flex items-center gap-1.5 font-semibold tabular-nums"
              style={{
                background: "var(--panel-2)",
                borderRadius: 6,
                padding: "4px 9px",
                fontSize: 15,
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
            {t.asset && (
              <span
                className="text-[12px] font-normal truncate max-w-[280px]"
                style={{ color: "var(--mute)" }}
              >
                {t.asset.name}
              </span>
            )}
          </div>
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

        <div className="grid gap-6 grid-cols-1 md:grid-cols-2">
          {/* ── Left column ── */}
          <div className="flex flex-col gap-4">
            {/* Side toggle */}
            <div
              className="grid gap-2"
              style={{ gridTemplateColumns: "1fr 1fr" }}
            >
              {(["buy", "sell"] as const).map((s) => {
                const active = t.side === s;
                const color = s === "buy" ? "var(--pos)" : "var(--neg)";
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => t.setSide(s)}
                    className="text-[14px] font-semibold cursor-pointer transition-colors"
                    style={{
                      padding: "12px 16px",
                      borderRadius: "var(--r)",
                      border: `1px solid ${active ? color : "var(--border)"}`,
                      background: active ? color : "transparent",
                      color: active ? "white" : "var(--text-2)",
                    }}
                  >
                    {s === "buy" ? "Buy" : "Sell"}
                  </button>
                );
              })}
            </div>

            {/* Order type chips */}
            <div>
              <div
                className="text-[11px] font-medium uppercase mb-2"
                style={{ color: "var(--mute)", letterSpacing: "0.04em" }}
              >
                Order type
              </div>
              <div className="flex flex-wrap gap-2">
                {t.availableOrderTypes.map((ot) => (
                  <Chip
                    key={ot}
                    active={t.type === ot}
                    onClick={() => t.setType(ot)}
                  >
                    {TYPE_LABEL[ot]}
                  </Chip>
                ))}
              </div>
            </div>

            {/* Quantity / dollar amount */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <div
                  className="text-[11px] font-medium uppercase"
                  style={{ color: "var(--mute)", letterSpacing: "0.04em" }}
                >
                  {dollars ? "Amount" : "Quantity"}
                </div>
                {t.notionalEligible && (
                  <AmountToggle
                    mode={t.amountMode}
                    onChange={t.setAmountMode}
                    unitLabel={t.isCrypto ? "Units" : "Shares"}
                  />
                )}
              </div>
              {dollars ? (
                <DollarInput value={t.notional} onChange={t.setNotional} />
              ) : (
                <Stepper
                  value={t.qty}
                  onChange={t.setQty}
                  fractional={!!t.asset?.fractionable}
                />
              )}
              <div className="flex flex-wrap gap-2 mt-2">
                {dollars
                  ? dollarFills.map((d) => (
                      <Chip
                        key={d}
                        active={t.notional === d}
                        onClick={() => t.setNotional(d)}
                      >
                        {money(d)}
                      </Chip>
                    ))
                  : quickFills.map((q) => (
                      <Chip
                        key={q}
                        active={t.qty === q}
                        onClick={() => t.setQty(q)}
                      >
                        {q}
                      </Chip>
                    ))}
                {!dollars && maxQty != null && maxQty > 0 && (
                  <Chip
                    active={t.qty === maxQty}
                    onClick={() => t.setQty(maxQty)}
                  >
                    Max ({maxQty})
                  </Chip>
                )}
                {dollars && t.side === "buy" && bp > 0 && (
                  <Chip
                    active={t.notional === Math.floor(bp)}
                    onClick={() => t.setNotional(Math.floor(bp))}
                  >
                    Max
                  </Chip>
                )}
              </div>
            </div>

            {/* Conditional price fields */}
            {t.needsLimit && (
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
                  value={t.limitPrice ?? ""}
                  onChange={(e) =>
                    t.setLimitPrice(
                      e.target.value ? Number(e.target.value) : undefined,
                    )
                  }
                  className="font-mono tabular-nums"
                  style={{
                    padding: "10px 12px",
                    background: "var(--panel-2)",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--r)",
                    color: "var(--text)",
                    fontSize: 14,
                  }}
                />
              </label>
            )}
            {t.needsStop && (
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
                  value={t.stopPrice ?? ""}
                  onChange={(e) =>
                    t.setStopPrice(
                      e.target.value ? Number(e.target.value) : undefined,
                    )
                  }
                  className="font-mono tabular-nums"
                  style={{
                    padding: "10px 12px",
                    background: "var(--panel-2)",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--r)",
                    color: "var(--text)",
                    fontSize: 14,
                  }}
                />
              </label>
            )}
            {t.needsTrail && (
              <label className="flex flex-col gap-1">
                <span
                  className="text-[11px] font-medium uppercase"
                  style={{ color: "var(--mute)", letterSpacing: "0.04em" }}
                >
                  Trail %
                </span>
                <input
                  type="number"
                  min={0}
                  step="any"
                  value={t.trailPct ?? ""}
                  onChange={(e) =>
                    t.setTrailPct(
                      e.target.value ? Number(e.target.value) : undefined,
                    )
                  }
                  className="font-mono tabular-nums"
                  style={{
                    padding: "10px 12px",
                    background: "var(--panel-2)",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--r)",
                    color: "var(--text)",
                    fontSize: 14,
                  }}
                />
              </label>
            )}

            {/* TIF */}
            <div>
              <div
                className="text-[11px] font-medium uppercase mb-2"
                style={{ color: "var(--mute)", letterSpacing: "0.04em" }}
              >
                Time in force
              </div>
              <div className="flex flex-wrap gap-2">
                {t.availableTifs.map((x) => (
                  <Chip
                    key={x}
                    active={t.tif === x}
                    onClick={() => t.setTif(x)}
                  >
                    {TIF_LABEL[x]}
                  </Chip>
                ))}
              </div>
            </div>

            {/* Ext hours — equity only (crypto is 24/7) */}
            {!t.isCrypto && (
              <label className="flex items-center gap-2 text-[12.5px]">
                <input
                  type="checkbox"
                  checked={t.extHoursOn}
                  disabled={!t.extHoursEligible}
                  onChange={(e) => t.setExtHours(e.target.checked)}
                />
                <span style={{ color: "var(--mute)" }}>
                  Extended hours
                  {!t.extHoursEligible && " — limit + DAY/GTC only"}
                </span>
              </label>
            )}
          </div>

          {/* ── Right column ── */}
          <div className="flex flex-col gap-4">
            {/* Est. cost pill — caption + value on one row. Side-coloured
                background mirrors the side picker + primary CTA so the whole
                trade decision reads as one tinted column. */}
            <div
              className="flex items-center justify-between"
              style={{
                background:
                  t.side === "buy" ? "var(--pos-bg)" : "var(--neg-bg)",
                borderRadius: "var(--r)",
                padding: "10px 14px",
              }}
            >
              <span
                className="text-[11px]"
                style={{ color: "var(--text-2)", letterSpacing: "0.02em" }}
              >
                Est. {t.side === "buy" ? "cost" : "proceeds"}
                <span style={{ color: "var(--mute)" }}>
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
              <span
                className="font-mono text-[15px] font-semibold tabular-nums"
                style={{ color: t.side === "buy" ? "var(--pos)" : "var(--neg)" }}
              >
                {t.estNotional != null ? money(t.estNotional) : "—"}
              </span>
            </div>

            <div className="flex flex-col">
              {t.quote && (
                <>
                  <div
                    className="flex justify-between py-2 text-[13px]"
                    style={{ borderBottom: "1px solid var(--hairline)" }}
                  >
                    <span style={{ color: "var(--mute)" }}>Bid</span>
                    <span className="font-mono tabular-nums">
                      {money(t.quote.bid)}
                    </span>
                  </div>
                  <div
                    className="flex justify-between py-2 text-[13px]"
                    style={{ borderBottom: "1px solid var(--hairline)" }}
                  >
                    <span style={{ color: "var(--mute)" }}>Ask</span>
                    <span className="font-mono tabular-nums">
                      {money(t.quote.ask)}
                    </span>
                  </div>
                </>
              )}
              {account && (
                <>
                  <div
                    className="flex justify-between py-2 text-[13px]"
                    style={{ borderBottom: "1px solid var(--hairline)" }}
                  >
                    <span style={{ color: "var(--mute)" }}>Buying power</span>
                    <span className="font-mono tabular-nums">
                      {money(bp)}
                    </span>
                  </div>
                  {afterOrder != null && (
                    <div
                      className="flex justify-between py-2 text-[13px]"
                      style={{ borderBottom: "1px solid var(--hairline)" }}
                    >
                      <span style={{ color: "var(--mute)" }}>
                        After this order
                      </span>
                      <span
                        className="font-mono tabular-nums"
                        style={{
                          color:
                            afterOrder < 0 ? "var(--neg)" : "var(--text)",
                        }}
                      >
                        {money(afterOrder)}
                      </span>
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="flex-1" />

            {t.shortNote && (
              <div className="text-[12px]" style={{ color: "var(--mute)" }}>
                {t.shortNote}
              </div>
            )}
            {t.submit.error && (
              <ErrorBanner message={(t.submit.error as Error).message} />
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

            {submitButton}
          </div>
        </div>
      </div>
    </div>
  );
}
