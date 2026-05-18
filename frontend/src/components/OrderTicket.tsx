import { useEffect, useState } from "react";

import { useSubmitOrder } from "../data/hooks";
import type { SubmitOrderInput } from "../types";

type OType = SubmitOrderInput["type"];
type TIF = NonNullable<SubmitOrderInput["time_in_force"]>;

const TYPES: OType[] = ["market", "limit", "stop", "stop_limit", "trailing_stop"];
const TIFS: TIF[] = ["day", "gtc", "opg", "cls", "ioc", "fok"];

interface Props {
  symbol: string;
  onSymbolChange: (s: string) => void;
}

// Client-side mirror of backend/app/schemas.py SubmitOrderRequest._check.
// The backend re-validates; this just gives instant feedback.
function validate(f: SubmitOrderInput): string | null {
  if (!f.symbol.trim()) return "symbol is required";
  if (!f.qty || f.qty <= 0) return "qty must be > 0";
  if ((f.type === "limit" || f.type === "stop_limit") && !f.limit_price)
    return `${f.type} order requires a limit price`;
  if ((f.type === "stop" || f.type === "stop_limit") && !f.stop_price)
    return `${f.type} order requires a stop price`;
  if (f.type === "trailing_stop" && !f.trail_percent)
    return "trailing_stop requires a trail %";
  return null;
}

export default function OrderTicket({ symbol, onSymbolChange }: Props) {
  const submit = useSubmitOrder();
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [type, setType] = useState<OType>("market");
  const [qty, setQty] = useState<number>(1);
  const [limitPrice, setLimitPrice] = useState<number | undefined>();
  const [stopPrice, setStopPrice] = useState<number | undefined>();
  const [trailPct, setTrailPct] = useState<number | undefined>();
  const [tif, setTif] = useState<TIF>("day");

  // Stay in sync with the symbol selected elsewhere (watchlist / search).
  const [sym, setSym] = useState(symbol);
  useEffect(() => setSym(symbol), [symbol]);

  const form: SubmitOrderInput = {
    symbol: sym,
    side,
    type,
    qty,
    time_in_force: tif,
    ...(type === "limit" || type === "stop_limit"
      ? { limit_price: limitPrice }
      : {}),
    ...(type === "stop" || type === "stop_limit"
      ? { stop_price: stopPrice }
      : {}),
    ...(type === "trailing_stop" ? { trail_percent: trailPct } : {}),
  };
  const clientError = validate(form);

  const onSubmit = () => {
    if (clientError) return;
    const verb = side.toUpperCase();
    if (
      !window.confirm(
        `${verb} ${qty} ${sym} — ${type}` +
          (limitPrice ? ` @ ${limitPrice}` : "") +
          (stopPrice ? ` stop ${stopPrice}` : "") +
          (trailPct ? ` trail ${trailPct}%` : "") +
          `\n\nPaper account. Submit this order?`,
      )
    )
      return;
    submit.mutate(form);
  };

  const needsLimit = type === "limit" || type === "stop_limit";
  const needsStop = type === "stop" || type === "stop_limit";
  const needsTrail = type === "trailing_stop";

  return (
    <div className="panel">
      <h2>Order Ticket</h2>
      <div className="ticket">
        <label className="field">
          <span className="label">Symbol</span>
          <input
            value={sym}
            onChange={(e) => {
              const v = e.target.value.toUpperCase();
              setSym(v);
              if (v) onSymbolChange(v);
            }}
          />
        </label>

        <div className="side-toggle">
          <button
            className={`btn ${side === "buy" ? "btn-buy active" : ""}`}
            onClick={() => setSide("buy")}
            type="button"
          >
            Buy
          </button>
          <button
            className={`btn ${side === "sell" ? "btn-sell active" : ""}`}
            onClick={() => setSide("sell")}
            type="button"
          >
            Sell
          </button>
        </div>

        <label className="field">
          <span className="label">Type</span>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as OType)}
          >
            {TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span className="label">Qty</span>
          <input
            type="number"
            min={0}
            step="any"
            value={qty}
            onChange={(e) => setQty(Number(e.target.value))}
          />
        </label>

        {needsLimit && (
          <label className="field">
            <span className="label">Limit price</span>
            <input
              type="number"
              min={0}
              step="any"
              value={limitPrice ?? ""}
              onChange={(e) =>
                setLimitPrice(e.target.value ? Number(e.target.value) : undefined)
              }
            />
          </label>
        )}
        {needsStop && (
          <label className="field">
            <span className="label">Stop price</span>
            <input
              type="number"
              min={0}
              step="any"
              value={stopPrice ?? ""}
              onChange={(e) =>
                setStopPrice(e.target.value ? Number(e.target.value) : undefined)
              }
            />
          </label>
        )}
        {needsTrail && (
          <label className="field">
            <span className="label">Trail %</span>
            <input
              type="number"
              min={0}
              step="any"
              value={trailPct ?? ""}
              onChange={(e) =>
                setTrailPct(e.target.value ? Number(e.target.value) : undefined)
              }
            />
          </label>
        )}

        <label className="field">
          <span className="label">Time in force</span>
          <select value={tif} onChange={(e) => setTif(e.target.value as TIF)}>
            {TIFS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>

        <button
          className={`btn btn-submit ${side}`}
          onClick={onSubmit}
          disabled={!!clientError || submit.isPending}
          type="button"
        >
          {submit.isPending
            ? "Submitting…"
            : `${side.toUpperCase()} ${sym || "—"}`}
        </button>

        {clientError && <div className="tag">{clientError}</div>}
        {submit.error && (
          <div className="error">{(submit.error as Error).message}</div>
        )}
        {submit.isSuccess && submit.data && (
          <div className="tag">
            Submitted · {submit.data.status} · id {submit.data.id.slice(0, 8)}
          </div>
        )}
      </div>
    </div>
  );
}
