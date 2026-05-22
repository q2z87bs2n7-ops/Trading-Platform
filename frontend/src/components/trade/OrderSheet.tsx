import { useEffect } from "react";

import { useAccount } from "../../data/hooks";
import { useMobile } from "../../hooks/useMobile";
import {
  useOrderTicket,
  type OType,
  type TIF,
} from "../../hooks/useOrderTicket";
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

  const quickFills = [10, 50, 100];
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
          : `${t.side === "buy" ? "Buy" : "Sell"} ${t.qty || "—"} ${t.symbol || "—"}` +
            (t.estNotional ? ` · ${money(t.estNotional)}` : "")}
    </button>
  );

  return (
    <div
      role="dialog"
      aria-modal
      className={
        isMobile
          ? "fixed inset-0 z-50 flex"
          : "fixed inset-0 z-50 flex items-end justify-center"
      }
      style={{
        background: "rgba(20, 22, 28, 0.45)",
        backdropFilter: "blur(4px)",
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={
          isMobile
            ? "w-full flex flex-col"
            : "w-full max-w-[1000px] max-h-[92vh] overflow-y-auto"
        }
        style={
          isMobile
            ? {
                height: "100dvh",
                background: "var(--panel)",
                boxShadow: "var(--shadow-lg)",
                paddingTop: "max(var(--safe-top), 12px)",
              }
            : {
                background: "var(--panel)",
                borderTopLeftRadius: "var(--r-xl)",
                borderTopRightRadius: "var(--r-xl)",
                boxShadow: "var(--shadow-lg)",
                padding: "24px 28px 28px",
                animation: "sheet-up 220ms ease",
              }
        }
      >
        <style>{`@keyframes sheet-up{from{transform:translateY(40px);opacity:0}to{transform:translateY(0);opacity:1}}`}</style>

        {/* Header */}
        <div
          className="flex items-center justify-between mb-5"
          style={isMobile ? { padding: "0 16px" } : undefined}
        >
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

        <div
          className={isMobile ? "flex-1 min-h-0 overflow-y-auto" : ""}
          style={isMobile ? { padding: "0 16px" } : undefined}
        >
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

            {/* Quantity */}
            <div>
              <div
                className="text-[11px] font-medium uppercase mb-2"
                style={{ color: "var(--mute)", letterSpacing: "0.04em" }}
              >
                Quantity
              </div>
              <Stepper
                value={t.qty}
                onChange={t.setQty}
                fractional={!!t.asset?.fractionable}
              />
              <div className="flex flex-wrap gap-2 mt-2">
                {quickFills.map((q) => (
                  <Chip key={q} active={t.qty === q} onClick={() => t.setQty(q)}>
                    {q}
                  </Chip>
                ))}
                {maxQty != null && maxQty > 0 && (
                  <Chip
                    active={t.qty === maxQty}
                    onClick={() => t.setQty(maxQty)}
                  >
                    Max ({maxQty})
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
                  {!t.extHoursEligible && " — limit + DAY only"}
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

            {!isMobile && submitButton}
          </div>
        </div>
        </div>

        {/* Mobile sticky footer — summary always visible + pinned CTA. */}
        {isMobile && (
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
            {submitButton}
          </div>
        )}
      </div>
    </div>
  );
}
