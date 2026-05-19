import { useEffect, useState } from "react";

import { useAsset, useSubmitOrder } from "../data/hooks";
import { useLiveQuotes } from "../data/useLiveQuotes";
import type { Asset, SubmitOrderInput } from "../types";
import ErrorBanner from "./ErrorBanner";

type OType = SubmitOrderInput["type"];
type TIF = NonNullable<SubmitOrderInput["time_in_force"]>;

const TYPES: OType[] = ["market", "limit", "stop", "stop_limit", "trailing_stop"];
const TIFS: TIF[] = ["day", "gtc", "opg", "cls", "ioc", "fok"];

const money = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD" });

interface Props {
  symbol: string;
  onSymbolChange: (s: string) => void;
}

// Client-side mirror of backend/app/schemas.py SubmitOrderRequest._check,
// plus asset-capability gating (Alpaca rejects these too, but blocking
// pre-submit saves a round trip and a confusing 502). `asset` is only
// passed once it has resolved for the symbol being ordered.
function validate(f: SubmitOrderInput, asset?: Asset): string | null {
  if (!f.symbol.trim()) return "symbol is required";
  if (!f.qty || f.qty <= 0) return "qty must be > 0";
  if ((f.type === "limit" || f.type === "stop_limit") && !f.limit_price)
    return `${f.type} order requires a limit price`;
  if ((f.type === "stop" || f.type === "stop_limit") && !f.stop_price)
    return `${f.type} order requires a stop price`;
  if (f.type === "trailing_stop" && !f.trail_percent)
    return "trailing_stop requires a trail %";
  if (asset) {
    if (!asset.tradable) return `${asset.symbol} is not tradable`;
    if (!asset.fractionable && !Number.isInteger(f.qty))
      return `${asset.symbol} trades in whole shares only`;
  }
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
  const [extHours, setExtHours] = useState(false);
  // Alpaca only accepts extended-hours orders that are limit + day TIF;
  // anything else is rejected upstream, so gate the toggle to that combo.
  const extHoursEligible = type === "limit" && tif === "day";
  const extHoursOn = extHoursEligible && extHours;

  // Stay in sync with the symbol selected elsewhere (watchlist / search).
  const [sym, setSym] = useState(symbol);
  useEffect(() => setSym(symbol), [symbol]);

  // Debounce the symbol used for the asset lookup so typing "AAPL" is one
  // request, not four (intermediate symbols 404 -> noisy 502s otherwise).
  const [assetSym, setAssetSym] = useState(symbol);
  useEffect(() => {
    const t = setTimeout(() => setAssetSym(sym.trim().toUpperCase()), 400);
    return () => clearTimeout(t);
  }, [sym]);
  const { data: assetData } = useAsset(assetSym);
  // Only gate on the asset once it matches the symbol in the form, so a
  // stale result from the previous symbol never blocks a new one.
  const asset =
    assetData && assetData.symbol === sym.trim().toUpperCase()
      ? assetData
      : undefined;

  // Live last/bid/ask for the symbol being ordered. Subscribes the ticker
  // to the stream/poll path the watchlist already uses; React Query dedupes
  // the subscription if the symbol is already in the watchlist.
  const symUpper = sym.trim().toUpperCase();
  const { quotes } = useLiveQuotes(symUpper ? [symUpper] : []);
  const quote = quotes[symUpper];

  // Estimated notional: limit/stop_limit use limit price; stop uses stop
  // price; market/trailing use the live mid. Null when qty or price are
  // missing so the submit button label drops the "· ~$X" tail gracefully.
  const priceForEst =
    type === "limit" || type === "stop_limit"
      ? limitPrice
      : type === "stop"
        ? stopPrice
        : quote?.mid;
  const estNotional = qty > 0 && priceForEst ? qty * priceForEst : null;

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
    ...(extHoursOn ? { extended_hours: true } : {}),
  };
  const clientError = validate(form, asset);
  // Non-blocking: selling a non-shortable name is fine if it closes a
  // long, so warn rather than disable.
  const shortNote =
    side === "sell" && asset && !asset.shortable
      ? `${asset.symbol} is not shortable — sell only closes an existing long`
      : null;

  const onSubmit = () => {
    if (clientError) return;
    const verb = side.toUpperCase();
    if (
      !window.confirm(
        `${verb} ${qty} ${sym} — ${type}` +
          (limitPrice ? ` @ ${limitPrice}` : "") +
          (stopPrice ? ` stop ${stopPrice}` : "") +
          (trailPct ? ` trail ${trailPct}%` : "") +
          (extHoursOn ? ` · ext-hours` : "") +
          `\n\nPaper account. Submit this order?`,
      )
    )
      return;
    submit.mutate(form);
  };

  const needsLimit = type === "limit" || type === "stop_limit";
  const needsStop = type === "stop" || type === "stop_limit";
  const needsTrail = type === "trailing_stop";

  const submitLabel = submit.isPending
    ? "Submitting…"
    : `${side.toUpperCase()} ${qty || "—"} ${sym || "—"}` +
      (estNotional ? ` · ~${money(estNotional)}` : "");

  return (
    <div className="bg-panel border border-border rounded-lg p-3">
      <h2 className="text-[13px] uppercase tracking-wide text-muted m-0 mb-2">
        Order Ticket
      </h2>
      <div className="ticket">
        {/* Symbol */}
        <label className="field">
          <span className="text-muted text-xs">Symbol</span>
          <input
            value={sym}
            onChange={(e) => {
              const v = e.target.value.toUpperCase();
              setSym(v);
              if (v) onSymbolChange(v);
            }}
          />
        </label>

        {/* Asset info chip */}
        {asset && (
          <div className="text-xs text-muted">
            {asset.name} · {asset.exchange}
            {!asset.tradable && " · not tradable"}
            {asset.tradable && asset.fractionable && " · fractional ok"}
            {asset.tradable && !asset.shortable && " · no short"}
          </div>
        )}

        {/* Live context strip — Last / Bid / Ask */}
        {quote && (
          <div className="flex justify-between gap-2 bg-bg-elev rounded p-2 tabular-nums">
            <div className="flex flex-col">
              <span className="text-muted text-[10px] uppercase tracking-wider">
                Last
              </span>
              <span className="text-[13px]">{money(quote.mid)}</span>
            </div>
            <div className="flex flex-col">
              <span className="text-muted text-[10px] uppercase tracking-wider">
                Bid
              </span>
              <span className="text-[13px]">{money(quote.bid)}</span>
            </div>
            <div className="flex flex-col">
              <span className="text-muted text-[10px] uppercase tracking-wider">
                Ask
              </span>
              <span className="text-[13px]">{money(quote.ask)}</span>
            </div>
          </div>
        )}

        {/* Big BUY/SELL segment */}
        <div className="side-toggle">
          <button
            className={`btn ${side === "buy" ? "btn-buy active" : ""}`}
            style={{ padding: "10px 12px", fontWeight: 600 }}
            onClick={() => setSide("buy")}
            type="button"
          >
            Buy
          </button>
          <button
            className={`btn ${side === "sell" ? "btn-sell active" : ""}`}
            style={{ padding: "10px 12px", fontWeight: 600 }}
            onClick={() => setSide("sell")}
            type="button"
          >
            Sell
          </button>
        </div>

        {/* Type + TIF — 2-col flex (parallel inputs). Flex + min-w-0 lets
           each column shrink past the native <select>'s intrinsic content
           width (otherwise the longest option "trailing_stop" pushes the
           grid wider than the 280px panel and spills out the right edge). */}
        <div className="flex gap-2">
          <label className="field flex-1 min-w-0">
            <span className="text-muted text-xs">Type</span>
            <select
              className="w-full"
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

          <label className="field flex-1 min-w-0">
            <span className="text-muted text-xs">TIF</span>
            <select
              className="w-full"
              value={tif}
              onChange={(e) => setTif(e.target.value as TIF)}
            >
              {TIFS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
        </div>

        {/* Qty — own row; Est notional as inline subtext (NOT paired) */}
        <label className="field">
          <span className="text-muted text-xs">Qty</span>
          <div className="flex items-center gap-2">
            <input
              className="flex-1"
              type="number"
              min={0}
              step="any"
              value={qty}
              onChange={(e) => setQty(Number(e.target.value))}
            />
            {estNotional != null && (
              <span className="text-xs text-muted tabular-nums whitespace-nowrap">
                ≈ {money(estNotional)}
              </span>
            )}
          </div>
        </label>

        {/* Conditional price rows — each gets its own full-width row since
           limit and stop are mutually conditional based on order type
           (stop_limit is the only combo that requires both) */}
        {needsLimit && (
          <label className="field">
            <span className="text-muted text-xs">Limit price</span>
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
            <span className="text-muted text-xs">Stop price</span>
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
            <span className="text-muted text-xs">Trail %</span>
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

        {/* Extended hours */}
        <label
          className="field"
          style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
        >
          <input
            type="checkbox"
            checked={extHoursOn}
            disabled={!extHoursEligible}
            onChange={(e) => setExtHours(e.target.checked)}
          />
          <span className="text-muted text-xs">
            Extended hours
            {!extHoursEligible && " — limit + day only"}
          </span>
        </label>

        {/* Full-width submit with estimated notional in the label */}
        <button
          className={`btn btn-submit ${side}`}
          style={{ padding: "12px", fontWeight: 600 }}
          onClick={onSubmit}
          disabled={!!clientError || submit.isPending}
          type="button"
        >
          {submitLabel}
        </button>

        {clientError && <div className="text-xs text-muted">{clientError}</div>}
        {!clientError && shortNote && (
          <div className="text-xs text-muted">{shortNote}</div>
        )}
        {submit.error && (
          <ErrorBanner message={(submit.error as Error).message} />
        )}
        {submit.isSuccess && submit.data && (
          <div className="text-xs text-muted">
            Submitted · {submit.data.status} · id {submit.data.id.slice(0, 8)}
          </div>
        )}
      </div>
    </div>
  );
}
