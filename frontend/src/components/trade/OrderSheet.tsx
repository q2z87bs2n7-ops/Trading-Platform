import { useEffect, useState } from "react";

import { useAccount } from "../../data/hooks";
import { useMobile } from "../../hooks/useMobile";
import {
  useOrderTicket,
  type OType,
  type TIF,
} from "../../hooks/useOrderTicket";
import type { Account } from "../../types";
import ErrorBanner from "../ErrorBanner";

const money = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD" });

const TYPE_LABEL: Record<OType, string> = {
  market: "Market",
  limit: "Limit",
  stop: "Stop",
  stop_limit: "Stop limit",
  trailing_stop: "Trailing",
};

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
  symbol: string;
  defaultSide?: "buy" | "sell";
  defaultQty?: number;
  onClose: () => void;
}

function Chip({
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

function Stepper({
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

function AmountToggle({
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

function DollarInput({
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

        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div>
            <div
              className="text-[11px] font-medium uppercase mb-0.5"
              style={{ color: "var(--mute)", letterSpacing: "0.05em" }}
            >
              New order
            </div>
            <div className="text-[20px] font-semibold tabular-nums flex items-baseline gap-3">
              <span>{t.symbol || "—"}</span>
              {t.quote && (
                <span
                  className="font-mono text-[15px]"
                  style={{ color: "var(--text-2)" }}
                >
                  {money(t.quote.mid)}
                </span>
              )}
              {t.asset && (
                <span
                  className="text-[12px] font-normal"
                  style={{ color: "var(--mute)" }}
                >
                  {t.asset.name}
                </span>
              )}
            </div>
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
              <button
                type="button"
                onClick={() => t.setSide("buy")}
                className="text-[14px] font-semibold cursor-pointer transition-colors"
                style={{
                  padding: "12px 16px",
                  borderRadius: "var(--r)",
                  border: `1.5px solid ${t.side === "buy" ? "var(--pos)" : "var(--border)"}`,
                  background:
                    t.side === "buy" ? "var(--pos-bg)" : "transparent",
                  color: t.side === "buy" ? "var(--pos)" : "var(--text-2)",
                }}
              >
                Buy
              </button>
              <button
                type="button"
                onClick={() => t.setSide("sell")}
                className="text-[14px] font-semibold cursor-pointer transition-colors"
                style={{
                  padding: "12px 16px",
                  borderRadius: "var(--r)",
                  border: `1.5px solid ${t.side === "sell" ? "var(--neg)" : "var(--border)"}`,
                  background:
                    t.side === "sell" ? "var(--neg-bg)" : "transparent",
                  color: t.side === "sell" ? "var(--neg)" : "var(--text-2)",
                }}
              >
                Sell
              </button>
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
            <div
              className="p-5"
              style={{
                background:
                  t.side === "buy" ? "var(--pos-bg)" : "var(--neg-bg)",
                borderRadius: "var(--r-lg)",
              }}
            >
              <div
                className="text-[11px] font-medium uppercase"
                style={{
                  color: t.side === "buy" ? "var(--pos)" : "var(--neg)",
                  letterSpacing: "0.04em",
                }}
              >
                Estimated {t.side === "buy" ? "cost" : "proceeds"}
              </div>
              <div className="font-mono text-[28px] font-semibold tabular-nums mt-1">
                {t.estNotional != null ? money(t.estNotional) : "—"}
              </div>
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

// Compact segmented-control / preset pill style (mobile order form).
function segStyle(active: boolean): React.CSSProperties {
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
function MobileHalfSheet({
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

// Mobile-first order ticket. Same useOrderTicket instance as the parent
// (passed in via `t`) — presentation only, no business logic here.
function OrderSheetMobile({
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
        {/* (a) Header */}
        <div
          className="flex items-center justify-between mb-3"
          style={{ padding: "0 16px" }}
        >
          <div className="text-[20px] font-semibold tabular-nums flex items-baseline gap-3 min-w-0">
            <span>{t.symbol || "—"}</span>
            {t.quote && (
              <span
                className="font-mono text-[15px]"
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
              <DollarInput value={t.notional} onChange={t.setNotional} big />
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
