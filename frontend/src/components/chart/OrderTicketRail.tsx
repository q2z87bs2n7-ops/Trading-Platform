import { useEffect } from "react";

import {
  ORDER_TYPES,
  TIFS,
  useOrderTicket,
  type OType,
  type TIF,
} from "../../hooks/useOrderTicket";
import ErrorBanner from "../ErrorBanner";

const money = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD" });

const TYPE_LABEL: Record<OType, string> = {
  market: "MKT",
  limit: "LMT",
  stop: "STP",
  stop_limit: "STP·L",
  trailing_stop: "TRL",
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
  symbol: string;
}

export default function OrderTicketRail({ symbol }: Props) {
  const t = useOrderTicket(symbol);

  // Mirror external symbol changes (watchlist clicks).
  useEffect(() => {
    if (symbol && symbol !== t.symbol) t.setSymbol(symbol);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol]);

  const tint = t.side === "buy" ? "var(--pos)" : "var(--neg)";
  const tintBg = t.side === "buy" ? "var(--pos-bg)" : "var(--neg-bg)";

  return (
    <aside
      className="flex flex-col gap-2.5 p-3"
      style={{
        background: "var(--panel)",
        border: "1px solid var(--border)",
        borderRadius: "var(--r-lg)",
        boxShadow: "var(--shadow-sm)",
        width: 240,
        minWidth: 240,
      }}
    >
      {/* Symbol header */}
      <div className="flex items-baseline justify-between">
        <span className="text-[14px] font-semibold">{t.symbol || "—"}</span>
        {t.quote && (
          <span className="font-mono text-[12px] tabular-nums" style={{ color: "var(--text-2)" }}>
            {money(t.quote.mid)}
          </span>
        )}
      </div>

      {/* Side toggle */}
      <div className="grid gap-1.5" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <button
          type="button"
          onClick={() => t.setSide("buy")}
          className="text-[13px] font-semibold cursor-pointer"
          style={{
            padding: "8px",
            borderRadius: "var(--r)",
            border: `1.5px solid ${t.side === "buy" ? "var(--pos)" : "var(--border)"}`,
            background: t.side === "buy" ? "var(--pos-bg)" : "transparent",
            color: t.side === "buy" ? "var(--pos)" : "var(--text-2)",
          }}
        >
          Buy
        </button>
        <button
          type="button"
          onClick={() => t.setSide("sell")}
          className="text-[13px] font-semibold cursor-pointer"
          style={{
            padding: "8px",
            borderRadius: "var(--r)",
            border: `1.5px solid ${t.side === "sell" ? "var(--neg)" : "var(--border)"}`,
            background: t.side === "sell" ? "var(--neg-bg)" : "transparent",
            color: t.side === "sell" ? "var(--neg)" : "var(--text-2)",
          }}
        >
          Sell
        </button>
      </div>

      {/* Type chips */}
      <div className="flex flex-wrap gap-1">
        {ORDER_TYPES.map((ot) => {
          const active = t.type === ot;
          return (
            <button
              key={ot}
              type="button"
              onClick={() => t.setType(ot)}
              className="font-mono text-[10.5px] font-medium cursor-pointer px-2 py-1"
              style={{
                border: `1px solid ${active ? "var(--accent)" : "var(--border)"}`,
                background: active ? "var(--accent-bg)" : "transparent",
                color: active ? "var(--accent)" : "var(--text-2)",
                borderRadius: 6,
              }}
            >
              {TYPE_LABEL[ot]}
            </button>
          );
        })}
      </div>

      {/* Qty */}
      <label className="flex flex-col gap-1">
        <span className="text-[10.5px] uppercase" style={{ color: "var(--mute)" }}>
          Qty
        </span>
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
            onClick={() => t.setQty(Math.max(0, t.qty - 1))}
            className="px-2 cursor-pointer border-0 text-[14px]"
            style={{ background: "var(--panel-2)", color: "var(--text-2)" }}
          >
            −
          </button>
          <input
            type="number"
            min={0}
            step={t.asset?.fractionable ? 0.01 : 1}
            value={t.qty || ""}
            onChange={(e) => t.setQty(e.target.value ? Number(e.target.value) : 0)}
            className="text-center flex-1 border-0 outline-none font-mono text-[13px] tabular-nums"
            style={{
              background: "var(--panel)",
              color: "var(--text)",
              padding: "6px 4px",
              minWidth: 0,
            }}
          />
          <button
            type="button"
            onClick={() => t.setQty(t.qty + 1)}
            className="px-2 cursor-pointer border-0 text-[14px]"
            style={{ background: "var(--panel-2)", color: "var(--text-2)" }}
          >
            +
          </button>
        </div>
      </label>

      {t.needsLimit && (
        <label className="flex flex-col gap-1">
          <span className="text-[10.5px] uppercase" style={{ color: "var(--mute)" }}>
            Limit
          </span>
          <input
            type="number"
            min={0}
            step="any"
            value={t.limitPrice ?? ""}
            onChange={(e) =>
              t.setLimitPrice(e.target.value ? Number(e.target.value) : undefined)
            }
            className="font-mono tabular-nums"
            style={{
              padding: "6px 8px",
              background: "var(--panel-2)",
              border: "1px solid var(--border)",
              borderRadius: "var(--r)",
              color: "var(--text)",
              fontSize: 13,
            }}
          />
        </label>
      )}
      {t.needsStop && (
        <label className="flex flex-col gap-1">
          <span className="text-[10.5px] uppercase" style={{ color: "var(--mute)" }}>
            Stop
          </span>
          <input
            type="number"
            min={0}
            step="any"
            value={t.stopPrice ?? ""}
            onChange={(e) =>
              t.setStopPrice(e.target.value ? Number(e.target.value) : undefined)
            }
            className="font-mono tabular-nums"
            style={{
              padding: "6px 8px",
              background: "var(--panel-2)",
              border: "1px solid var(--border)",
              borderRadius: "var(--r)",
              color: "var(--text)",
              fontSize: 13,
            }}
          />
        </label>
      )}
      {t.needsTrail && (
        <label className="flex flex-col gap-1">
          <span className="text-[10.5px] uppercase" style={{ color: "var(--mute)" }}>
            Trail %
          </span>
          <input
            type="number"
            min={0}
            step="any"
            value={t.trailPct ?? ""}
            onChange={(e) =>
              t.setTrailPct(e.target.value ? Number(e.target.value) : undefined)
            }
            className="font-mono tabular-nums"
            style={{
              padding: "6px 8px",
              background: "var(--panel-2)",
              border: "1px solid var(--border)",
              borderRadius: "var(--r)",
              color: "var(--text)",
              fontSize: 13,
            }}
          />
        </label>
      )}

      {/* TIF chips */}
      <div className="flex flex-wrap gap-1">
        {TIFS.map((x) => {
          const active = t.tif === x;
          return (
            <button
              key={x}
              type="button"
              onClick={() => t.setTif(x)}
              className="font-mono text-[10.5px] font-medium cursor-pointer px-2 py-1"
              style={{
                border: `1px solid ${active ? "var(--accent)" : "var(--border)"}`,
                background: active ? "var(--accent-bg)" : "transparent",
                color: active ? "var(--accent)" : "var(--text-2)",
                borderRadius: 6,
              }}
            >
              {TIF_LABEL[x]}
            </button>
          );
        })}
      </div>

      {/* Est notional */}
      <div
        className="p-2 mt-1"
        style={{
          background: tintBg,
          borderRadius: "var(--r)",
        }}
      >
        <div className="text-[10px] uppercase" style={{ color: tint, letterSpacing: "0.04em" }}>
          Est {t.side === "buy" ? "cost" : "proceeds"}
        </div>
        <div className="font-mono text-[18px] font-semibold tabular-nums">
          {t.estNotional != null ? money(t.estNotional) : "—"}
        </div>
      </div>

      {t.submit.error && (
        <ErrorBanner message={(t.submit.error as Error).message} />
      )}
      {t.submit.isSuccess && t.submit.data && (
        <div
          className="text-[11.5px] px-2 py-1"
          style={{
            background: "var(--pos-bg)",
            color: "var(--pos)",
            borderRadius: 6,
          }}
        >
          ✓ {t.submit.data.status}
        </div>
      )}

      <button
        type="button"
        disabled={!!t.clientError || t.submit.isPending}
        onClick={() => t.trySubmit({ skipConfirm: true })}
        className="w-full text-[13px] font-semibold cursor-pointer border-0"
        style={{
          padding: "10px",
          borderRadius: "var(--r)",
          background: tint,
          color: "white",
          opacity: t.clientError || t.submit.isPending ? 0.55 : 1,
        }}
      >
        {t.submit.isPending
          ? "Submitting…"
          : t.clientError
            ? "—"
            : `${t.side === "buy" ? "Buy" : "Sell"} ${t.qty || "—"}`}
      </button>
    </aside>
  );
}
