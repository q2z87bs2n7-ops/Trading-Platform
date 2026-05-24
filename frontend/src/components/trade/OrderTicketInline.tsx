import { useEffect } from "react";

import { useAccount } from "../../data/hooks";
import {
  useOrderTicket,
  type OType,
  type TIF,
} from "../../hooks/useOrderTicket";
import { money } from "../../lib/format";
import ErrorBanner from "../ErrorBanner";
import {
  AmountToggle,
  Chip,
  DollarInput,
  Stepper,
  TIF_LABEL,
  TYPE_LABEL,
} from "./OrderSheet";

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

function priceInput(
  value: number | undefined,
  onChange: (n: number | undefined) => void,
) {
  return (
    <input
      type="number"
      min={0}
      step="any"
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value ? Number(e.target.value) : undefined)}
      className="font-mono tabular-nums w-full"
      style={{
        padding: "8px 10px",
        background: "var(--panel-2)",
        border: "1px solid var(--border)",
        borderRadius: "var(--r)",
        color: "var(--text)",
        fontSize: 14,
      }}
    />
  );
}

/**
 * Inline order ticket for the Workspace Trade widget. Same `useOrderTicket`
 * engine as OrderSheet (and reusing its inputs) — just a compact single-column
 * presentation that lives in a dock panel instead of a modal sheet.
 */
export default function OrderTicketInline({ symbol }: { symbol: string }) {
  const t = useOrderTicket(symbol);
  const { data: account } = useAccount();

  const dollars = t.amountMode === "dollars" && t.notionalEligible;
  const bp =
    (t.isCrypto ? account?.non_marginable_buying_power : account?.buying_power) ??
    0;
  const quickFills = [10, 50, 100];
  const dollarFills = [100, 500, 1000];

  // Clear the form a beat after a successful submit so the panel is ready for
  // the next order (keeps the symbol).
  useEffect(() => {
    if (!t.submit.isSuccess) return;
    const id = setTimeout(() => t.reset(), 1500);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t.submit.isSuccess]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[15px] font-semibold">{t.symbol || "—"}</span>
        {t.quote && (
          <span
            className="font-mono text-[13px] tabular-nums"
            style={{ color: "var(--text-2)" }}
          >
            {money(t.quote.mid)}
          </span>
        )}
      </div>

      <div className="grid gap-2" style={{ gridTemplateColumns: "1fr 1fr" }}>
        {(["buy", "sell"] as const).map((s) => {
          const active = t.side === s;
          const color = s === "buy" ? "var(--pos)" : "var(--neg)";
          return (
            <button
              key={s}
              type="button"
              onClick={() => t.setSide(s)}
              className="text-[14px] font-semibold cursor-pointer capitalize"
              style={{
                padding: "10px",
                borderRadius: "var(--r)",
                border: `1.5px solid ${active ? color : "var(--border)"}`,
                background: active ? color : "transparent",
                color: active ? "white" : "var(--text-2)",
              }}
            >
              {s}
            </button>
          );
        })}
      </div>

      <div>
        <Label>Order type</Label>
        <div className="flex flex-wrap gap-1.5">
          {t.availableOrderTypes.map((ot: OType) => (
            <Chip key={ot} active={t.type === ot} onClick={() => t.setType(ot)}>
              {TYPE_LABEL[ot]}
            </Chip>
          ))}
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-1.5">
          <Label>{dollars ? "Amount" : "Quantity"}</Label>
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
        <div className="flex flex-wrap gap-1.5 mt-1.5">
          {dollars
            ? dollarFills.map((n) => (
                <Chip
                  key={n}
                  active={t.notional === n}
                  onClick={() => t.setNotional(n)}
                >
                  {money(n)}
                </Chip>
              ))
            : quickFills.map((n) => (
                <Chip key={n} active={t.qty === n} onClick={() => t.setQty(n)}>
                  {n}
                </Chip>
              ))}
        </div>
      </div>

      {t.needsLimit && (
        <div>
          <Label>Limit price</Label>
          {priceInput(t.limitPrice, t.setLimitPrice)}
        </div>
      )}
      {t.needsStop && (
        <div>
          <Label>Stop price</Label>
          {priceInput(t.stopPrice, t.setStopPrice)}
        </div>
      )}
      {t.needsTrail && (
        <div>
          <Label>Trail %</Label>
          {priceInput(t.trailPct, t.setTrailPct)}
        </div>
      )}

      <div>
        <Label>Time in force</Label>
        <div className="flex flex-wrap gap-1.5">
          {t.availableTifs.map((x: TIF) => (
            <Chip key={x} active={t.tif === x} onClick={() => t.setTif(x)}>
              {TIF_LABEL[x]}
            </Chip>
          ))}
        </div>
      </div>

      {!t.isCrypto && (
        <label className="flex items-center gap-2 text-[12.5px]">
          <input
            type="checkbox"
            checked={t.extHoursOn}
            disabled={!t.extHoursEligible}
            onChange={(e) => t.setExtHours(e.target.checked)}
          />
          <span style={{ color: "var(--mute)" }}>
            Extended hours{!t.extHoursEligible && " — limit + DAY/GTC only"}
          </span>
        </label>
      )}

      <div className="flex justify-between text-[12.5px]">
        <span style={{ color: "var(--mute)" }}>
          Est. {t.side === "buy" ? "cost" : "proceeds"}
        </span>
        <span className="font-mono tabular-nums">
          {t.estNotional != null ? money(t.estNotional) : "—"}
        </span>
      </div>
      <div className="flex justify-between text-[12.5px]">
        <span style={{ color: "var(--mute)" }}>Buying power</span>
        <span className="font-mono tabular-nums">{money(bp)}</span>
      </div>

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
          Submitted · {t.submit.data.status} · id {t.submit.data.id.slice(0, 8)}
        </div>
      )}

      <button
        type="button"
        disabled={!!t.clientError || t.submit.isPending}
        onClick={() => t.trySubmit()}
        className="w-full text-[14px] font-semibold cursor-pointer border-0"
        style={{
          padding: "12px",
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
              : `${t.side === "buy" ? "Buy" : "Sell"} ${t.qty || "—"} ${t.symbol || "—"}`}
      </button>
    </div>
  );
}
