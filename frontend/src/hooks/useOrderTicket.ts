import { useEffect, useMemo, useState } from "react";

import { useAsset, useSubmitOrder } from "../data/hooks";
import { useLiveQuotes } from "../data/useLiveQuotes";
import type { Asset, SubmitOrderInput } from "../types";

export type OType = SubmitOrderInput["type"];
export type TIF = NonNullable<SubmitOrderInput["time_in_force"]>;
export type Side = "buy" | "sell";

export const ORDER_TYPES: OType[] = [
  "market",
  "limit",
  "stop",
  "stop_limit",
  "trailing_stop",
];

// Crypto does not support trailing_stop on Alpaca paper accounts.
export const CRYPTO_ORDER_TYPES: OType[] = ["market", "limit", "stop", "stop_limit"];

export const TIFS: TIF[] = ["day", "gtc", "opg", "cls", "ioc", "fok"];
// Crypto only supports GTC and IOC time-in-force.
export const CRYPTO_TIFS: TIF[] = ["gtc", "ioc"];

// Mirrors backend/app/schemas.py SubmitOrderRequest._check + adds asset-
// capability gating so we fail fast instead of round-tripping a 422.
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

export interface UseOrderTicketResult {
  symbol: string;
  setSymbol: (s: string) => void;
  side: Side;
  setSide: (s: Side) => void;
  type: OType;
  setType: (t: OType) => void;
  qty: number;
  setQty: (q: number) => void;
  limitPrice: number | undefined;
  setLimitPrice: (p: number | undefined) => void;
  stopPrice: number | undefined;
  setStopPrice: (p: number | undefined) => void;
  trailPct: number | undefined;
  setTrailPct: (p: number | undefined) => void;
  tif: TIF;
  setTif: (t: TIF) => void;
  extHours: boolean;
  setExtHours: (b: boolean) => void;
  extHoursEligible: boolean;
  extHoursOn: boolean;
  needsLimit: boolean;
  needsStop: boolean;
  needsTrail: boolean;
  isCrypto: boolean;
  availableOrderTypes: OType[];
  availableTifs: TIF[];
  asset: Asset | undefined;
  quote: { bid: number; ask: number; mid: number } | undefined;
  estNotional: number | null;
  clientError: string | null;
  shortNote: string | null;
  form: SubmitOrderInput;
  submit: ReturnType<typeof useSubmitOrder>;
  /** Run client-side validation, then submit. The calling card IS the
   * confirm UI — no native dialog. */
  trySubmit: () => void;
  reset: () => void;
}

export function useOrderTicket(initialSymbol = ""): UseOrderTicketResult {
  const submit = useSubmitOrder();
  const [symbol, setSymbol] = useState(initialSymbol);
  const [side, setSide] = useState<Side>("buy");
  const [type, setType] = useState<OType>("market");
  const [qty, setQty] = useState<number>(1);
  const [limitPrice, setLimitPrice] = useState<number | undefined>();
  const [stopPrice, setStopPrice] = useState<number | undefined>();
  const [trailPct, setTrailPct] = useState<number | undefined>();
  const [tif, setTif] = useState<TIF>("day");
  const [extHours, setExtHours] = useState(false);

  // Keep internal symbol in sync if the caller re-mounts with a new one.
  useEffect(() => {
    if (initialSymbol && initialSymbol !== symbol) setSymbol(initialSymbol);
    // intentionally exclude `symbol` so user edits aren't clobbered
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialSymbol]);

  // Debounce asset lookup — typing "AAPL" one char at a time would 404
  // intermediate symbols and noise the console.
  const [assetSym, setAssetSym] = useState(initialSymbol);
  useEffect(() => {
    const t = setTimeout(
      () => setAssetSym(symbol.trim().toUpperCase()),
      400,
    );
    return () => clearTimeout(t);
  }, [symbol]);
  const { data: assetData } = useAsset(assetSym);
  const symUpper = symbol.trim().toUpperCase();
  const asset =
    assetData && assetData.symbol === symUpper ? assetData : undefined;

  // Live quote: shares the streaming/poll subscription the watchlist owns.
  const { quotes } = useLiveQuotes(symUpper ? [symUpper] : []);
  const quote = quotes[symUpper];

  // Fast-path: slash in symbol is always crypto; don't wait for the asset API.
  const isCrypto = symbol.trim().includes("/") || asset?.asset_class === "crypto";
  const availableOrderTypes = isCrypto ? CRYPTO_ORDER_TYPES : ORDER_TYPES;
  const availableTifs = isCrypto ? CRYPTO_TIFS : TIFS;

  // Auto-correct TIF when switching to a crypto asset that doesn't support it.
  useEffect(() => {
    if (isCrypto && tif !== "gtc" && tif !== "ioc") setTif("gtc");
  }, [isCrypto, tif]);

  const extHoursEligible = !isCrypto && type === "limit" && tif === "day";
  const extHoursOn = extHoursEligible && extHours;
  const needsLimit = type === "limit" || type === "stop_limit";
  const needsStop = type === "stop" || type === "stop_limit";
  const needsTrail = type === "trailing_stop";

  const priceForEst = needsLimit
    ? limitPrice
    : needsStop && type === "stop"
      ? stopPrice
      : quote?.mid;
  const estNotional = qty > 0 && priceForEst ? qty * priceForEst : null;

  const form: SubmitOrderInput = useMemo(
    () => ({
      symbol,
      side,
      type,
      qty,
      time_in_force: tif,
      ...(needsLimit ? { limit_price: limitPrice } : {}),
      ...(needsStop ? { stop_price: stopPrice } : {}),
      ...(needsTrail ? { trail_percent: trailPct } : {}),
      ...(extHoursOn ? { extended_hours: true } : {}),
    }),
    [
      symbol,
      side,
      type,
      qty,
      tif,
      limitPrice,
      stopPrice,
      trailPct,
      needsLimit,
      needsStop,
      needsTrail,
      extHoursOn,
    ],
  );

  const clientError = validate(form, asset);
  const shortNote =
    !isCrypto && side === "sell" && asset && !asset.shortable
      ? `${asset.symbol} is not shortable — sell only closes an existing long`
      : null;

  function trySubmit() {
    if (clientError) return;
    submit.mutate(form);
  }

  function reset() {
    setSide("buy");
    setType("market");
    setQty(1);
    setLimitPrice(undefined);
    setStopPrice(undefined);
    setTrailPct(undefined);
    setTif(isCrypto ? "gtc" : "day");
    setExtHours(false);
    submit.reset();
  }

  return {
    symbol,
    setSymbol,
    side,
    setSide,
    type,
    setType,
    qty,
    setQty,
    limitPrice,
    setLimitPrice,
    stopPrice,
    setStopPrice,
    trailPct,
    setTrailPct,
    tif,
    setTif,
    extHours,
    setExtHours,
    extHoursEligible,
    extHoursOn,
    needsLimit,
    needsStop,
    needsTrail,
    isCrypto,
    availableOrderTypes,
    availableTifs,
    asset,
    quote,
    estNotional,
    clientError,
    shortNote,
    form,
    submit,
    trySubmit,
    reset,
  };
}
