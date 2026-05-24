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

// Alpaca crypto supports only market, limit, and stop_limit — no plain stop,
// no trailing_stop.
export const CRYPTO_ORDER_TYPES: OType[] = ["market", "limit", "stop_limit"];

export type AmountMode = "shares" | "dollars";

export const TIFS: TIF[] = ["day", "gtc", "opg", "cls", "ioc", "fok"];
// Crypto only supports GTC and IOC time-in-force.
export const CRYPTO_TIFS: TIF[] = ["gtc", "ioc"];

// Mirrors backend/app/schemas.py SubmitOrderRequest._check + adds asset-
// capability gating so we fail fast instead of round-tripping a 422.
function validate(
  f: SubmitOrderInput,
  asset: Asset | undefined,
  useNotional: boolean,
): string | null {
  if (!f.symbol.trim()) return "symbol is required";
  if (useNotional) {
    if (!f.notional || f.notional <= 0) return "amount must be > 0";
  } else if (!f.qty || f.qty <= 0) {
    return "qty must be > 0";
  }
  if ((f.type === "limit" || f.type === "stop_limit") && !f.limit_price)
    return `${f.type} order requires a limit price`;
  if ((f.type === "stop" || f.type === "stop_limit") && !f.stop_price)
    return `${f.type} order requires a stop price`;
  if (f.type === "trailing_stop" && !f.trail_percent)
    return "trailing_stop requires a trail %";
  if (asset) {
    if (!asset.tradable) return `${asset.symbol} is not tradable`;
    if (!useNotional && !asset.fractionable && f.qty != null && !Number.isInteger(f.qty))
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
  amountMode: AmountMode;
  setAmountMode: (m: AmountMode) => void;
  notional: number | undefined;
  setNotional: (n: number | undefined) => void;
  notionalEligible: boolean;
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
  const [amountMode, setAmountMode] = useState<AmountMode>("shares");
  const [notional, setNotional] = useState<number | undefined>();
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

  // Dollar (notional) orders: Alpaca allows them on market/limit only, and for
  // equities the asset must be fractionable. Crypto is always fractionable.
  const notionalEligible =
    (type === "market" || type === "limit") &&
    (isCrypto || !!asset?.fractionable);
  const useNotional = amountMode === "dollars" && notionalEligible;

  // Equity notional orders are day-only; crypto keeps its gtc/ioc set.
  const availableTifs = isCrypto
    ? CRYPTO_TIFS
    : useNotional
      ? (["day"] as TIF[])
      : TIFS;

  // Auto-correct TIF when switching to a crypto asset that doesn't support it.
  useEffect(() => {
    if (isCrypto && tif !== "gtc" && tif !== "ioc") setTif("gtc");
  }, [isCrypto, tif]);

  // Equity notional is day-only.
  useEffect(() => {
    if (useNotional && !isCrypto && tif !== "day") setTif("day");
  }, [useNotional, isCrypto, tif]);

  // Fall back to share entry when the current type/asset can't take notional.
  useEffect(() => {
    if (amountMode === "dollars" && !notionalEligible) setAmountMode("shares");
  }, [amountMode, notionalEligible]);

  const extHoursEligible =
    !isCrypto && type === "limit" && (tif === "day" || tif === "gtc") && !useNotional;
  const extHoursOn = extHoursEligible && extHours;
  const needsLimit = type === "limit" || type === "stop_limit";
  const needsStop = type === "stop" || type === "stop_limit";
  const needsTrail = type === "trailing_stop";

  const priceForEst = needsLimit
    ? limitPrice
    : needsStop && type === "stop"
      ? stopPrice
      : quote?.mid;
  const estNotional = useNotional
    ? (notional ?? null)
    : qty > 0 && priceForEst
      ? qty * priceForEst
      : null;

  const form: SubmitOrderInput = useMemo(
    () => ({
      symbol,
      side,
      type,
      ...(useNotional ? { notional } : { qty }),
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
      useNotional,
      notional,
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

  const clientError = validate(form, asset, useNotional);
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
    setAmountMode("shares");
    setNotional(undefined);
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
    amountMode,
    setAmountMode,
    notional,
    setNotional,
    notionalEligible,
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
