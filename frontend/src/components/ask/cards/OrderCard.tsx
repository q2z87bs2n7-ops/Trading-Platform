import { useEffect } from "react";

import { useOrderTicket } from "../../../hooks/useOrderTicket";
import { money } from "../../../lib/format";
import AskResultCard from "../AskResultCard";

export function OrderCard({
  side,
  qty,
  symbol,
  price,
  otype,
  onDone,
}: {
  side: "buy" | "sell";
  qty: number;
  symbol: string;
  price?: number;
  otype: "market" | "limit";
  onDone: () => void;
}) {
  const t = useOrderTicket(symbol);

  // Push the parsed intent into the form once on mount.
  useEffect(() => {
    t.setSymbol(symbol);
    t.setSide(side);
    t.setType(otype);
    t.setQty(qty);
    if (otype === "limit" && price != null) t.setLimitPrice(price);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!t.submit.isSuccess) return;
    const id = setTimeout(onDone, 900);
    return () => clearTimeout(id);
  }, [t.submit.isSuccess, onDone]);

  const tint = side === "buy" ? "var(--pos)" : "var(--neg)";
  const tintBg = side === "buy" ? "var(--pos-bg)" : "var(--neg-bg)";

  return (
    <AskResultCard
      title={`${side === "buy" ? "Buy" : "Sell"} ${qty} ${symbol}`}
      meta={otype === "limit" ? `LIMIT ${price ?? "—"}` : "MARKET"}
    >
      <div className="grid gap-3 grid-cols-1 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <span className="text-[11px] uppercase" style={{ color: "var(--mute)" }}>
            Estimated {side === "buy" ? "cost" : "proceeds"}
          </span>
          <span
            className="font-mono text-[20px] font-semibold tabular-nums"
            style={{ color: tint }}
          >
            {t.estNotional != null ? money(t.estNotional) : "—"}
          </span>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-[11px] uppercase" style={{ color: "var(--mute)" }}>
            Bid / Ask
          </span>
          <span className="font-mono text-[14px] tabular-nums">
            {t.quote
              ? `${money(t.quote.bid)} · ${money(t.quote.ask)}`
              : "—"}
          </span>
        </div>
      </div>
      {t.clientError && (
        <div
          className="text-[12px] mt-3 px-2 py-1"
          style={{
            color: "var(--neg)",
            background: "var(--neg-bg)",
            borderRadius: 6,
          }}
        >
          {t.clientError}
        </div>
      )}
      {t.submit.error && (
        <div
          className="text-[12px] mt-3 px-2 py-1"
          style={{
            color: "var(--neg)",
            background: "var(--neg-bg)",
            borderRadius: 6,
          }}
        >
          {(t.submit.error as Error).message}
        </div>
      )}
      {t.submit.isSuccess && t.submit.data && (
        <div
          className="text-[12.5px] mt-3 px-3 py-2"
          style={{
            background: "var(--pos-bg)",
            color: "var(--pos)",
            borderRadius: 6,
          }}
        >
          Submitted · {t.submit.data.status} · id{" "}
          {t.submit.data.id.slice(0, 8)}
        </div>
      )}
      <button
        type="button"
        disabled={!!t.clientError || t.submit.isPending || t.submit.isSuccess}
        onClick={() => t.trySubmit()}
        className="w-full mt-4 text-[14px] font-semibold cursor-pointer border-0"
        style={{
          padding: "11px",
          borderRadius: "var(--r)",
          background: tint,
          color: "white",
          opacity:
            t.clientError || t.submit.isPending || t.submit.isSuccess
              ? 0.6
              : 1,
        }}
      >
        {t.submit.isPending
          ? "Submitting…"
          : `Confirm ${side === "buy" ? "Buy" : "Sell"} ${qty} ${symbol}`}
      </button>
      <div
        className="text-[11px] mt-2 text-center"
        style={{ color: "var(--mute)" }}
      >
        Paper account · no live funds at risk
      </div>
      <div className="hidden" style={{ background: tintBg }} />
    </AskResultCard>
  );
}
