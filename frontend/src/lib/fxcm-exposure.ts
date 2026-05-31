import type { FxcmPosition } from "../types";

// CFD notional / exposure model.
//
// Two honest denominators sit on different axes:
//   - capital   = FXCM account equity (used + free margin)
//   - exposure  = Σ |net notional| across instruments (what's riding the market)
// and leverage = exposure / margin requirement (used_margin), NOT exposure/equity.
//
// Notional is built per instrument (never inferred from margin — FXCM charges a
// fixed margin per contract, so the two are independent):
//   non-FX: |amount| × contract_multiplier × rate   (in contract currency)
//   FX:     |amount|                                  (already the base-ccy face)
// then converted to the account currency via the relevant USD pair, inverted
// when USD is that pair's base. Positions are netted within an instrument first
// (a long+short hedge on the same symbol cancels to ~0 directional exposure),
// then summed gross across instruments.

const ACCT = "USD";
const METALS = new Set(["XAU", "XAG", "XPT", "XPD"]);

// "EUR/USD" → ["EUR","USD"] for true FX pairs only (3-letter codes, base not a
// metal — XAU/USD is a metal CFD, priced via its contract_multiplier).
function fxLegs(instrument: string): [string, string] | null {
  const [a, b, ...rest] = instrument.toUpperCase().split("/");
  if (rest.length || !a || !b) return null;
  if (a.length !== 3 || b.length !== 3) return null;
  if (METALS.has(a)) return null;
  return [a, b];
}

type RateMap = Record<string, number>;

// factor to turn 1 unit of `ccy` into USD using the available pair rates.
// null = no rate found (caller falls back + flags the total approximate).
function toUsd(ccy: string, rates: RateMap): number | null {
  if (ccy === ACCT) return 1;
  const direct = rates[`${ccy}/${ACCT}`]; // ccy/USD → USD is quote → ×rate
  if (direct) return direct;
  const inverse = rates[`${ACCT}/${ccy}`]; // USD/ccy → USD is base → ÷rate
  if (inverse) return 1 / inverse;
  return null;
}

export interface CfdExposure {
  exposureUsd: number; // Σ |net notional|, account ccy
  usedMargin: number; // Σ used_margin
  leverage: number; // exposureUsd / usedMargin (0 when no margin)
  forexUsd: number; // exposure contributed by FX instruments
  cfdUsd: number; // exposure contributed by non-FX instruments
  approximate: boolean; // true if any leg lacked a conversion rate
}

export function computeCfdExposure(positions: FxcmPosition[]): CfdExposure {
  const empty: CfdExposure = {
    exposureUsd: 0,
    usedMargin: 0,
    leverage: 0,
    forexUsd: 0,
    cfdUsd: 0,
    approximate: false,
  };
  if (!positions?.length) return empty;

  const { byInst, rates } = aggregateByInstrument(positions);

  let forexUsd = 0;
  let cfdUsd = 0;
  let usedMargin = 0;
  let approximate = false;

  for (const sym in byInst) {
    const a = byInst[sym];
    usedMargin += a.margin;
    const { usd, approximate: approx } = instrumentNotionalUsd(sym, a, rates);
    if (approx) approximate = true;
    if (a.isFx) forexUsd += usd;
    else cfdUsd += usd;
  }

  const exposureUsd = forexUsd + cfdUsd;
  return {
    exposureUsd,
    usedMargin,
    leverage: usedMargin > 0 ? exposureUsd / usedMargin : 0,
    forexUsd,
    cfdUsd,
    approximate,
  };
}

// Per-instrument |net notional| in the account currency, keyed by symbol — the
// same model computeCfdExposure sums for the splash card, projected one slice
// per instrument so the Portfolio allocation donut can size CFDs by exposure
// (not margin). Fully-hedged (net 0) instruments are dropped.
export function cfdNotionalByInstrument(
  positions: FxcmPosition[],
): Record<string, number> {
  if (!positions?.length) return {};
  const { byInst, rates } = aggregateByInstrument(positions);
  const out: Record<string, number> = {};
  for (const sym in byInst) {
    const { usd } = instrumentNotionalUsd(sym, byInst[sym], rates);
    if (usd > 0) out[sym] = usd;
  }
  return out;
}

interface InstAgg {
  net: number;
  mid: number;
  mult: number;
  ccy: string;
  isFx: boolean;
  margin: number;
}

// Net positions within each instrument (a long+short hedge cancels) and gather
// the per-pair live mids as the conversion-rate book.
function aggregateByInstrument(
  positions: FxcmPosition[],
): { byInst: Record<string, InstAgg>; rates: RateMap } {
  const rates: RateMap = {};
  for (const p of positions) {
    const sym = (p.instrument || "").toUpperCase();
    if (sym && fxLegs(sym) && p.mid) rates[sym] = p.mid;
  }

  const byInst: Record<string, InstAgg> = {};
  for (const p of positions) {
    const sym = (p.instrument || "").toUpperCase();
    if (!sym) continue;
    const legs = fxLegs(sym);
    const sign = p.buy_sell === "S" ? -1 : 1;
    const amt = Math.abs(Number(p.amount ?? 0)) * sign;
    const mid = Number(p.mid ?? p.open_rate ?? 0);
    const a = (byInst[sym] ||= {
      net: 0,
      mid,
      mult: Number(p.contract_multiplier ?? 1) || 1,
      ccy: (p.contract_currency || (legs ? legs[0] : ACCT)).toUpperCase(),
      isFx: !!legs,
      margin: 0,
    });
    a.net += amt;
    if (mid) a.mid = mid;
    a.margin += Number(p.used_margin ?? p.market_value ?? 0);
  }
  return { byInst, rates };
}

// One instrument's |net notional| in the account ccy.
//   non-FX: |net| × contract_multiplier × rate, converted to ACCT
//   FX:     |net| (already base-ccy face), converted to ACCT
// `approximate` flags a missing conversion rate (caller surfaces it).
function instrumentNotionalUsd(
  sym: string,
  a: InstAgg,
  rates: RateMap,
): { usd: number; approximate: boolean } {
  const netAbs = Math.abs(a.net);
  if (netAbs === 0) return { usd: 0, approximate: false };

  if (a.isFx) {
    const [base, quote] = fxLegs(sym)!;
    if (quote === ACCT) return { usd: netAbs * a.mid, approximate: false }; // X/USD
    if (base === ACCT) return { usd: netAbs, approximate: false }; // USD/X
    const f = toUsd(base, rates); // cross
    if (f == null) return { usd: netAbs * a.mid, approximate: true };
    return { usd: netAbs * f, approximate: false };
  }

  const notionalCcy = netAbs * a.mult * a.mid;
  const f = toUsd(a.ccy, rates);
  if (f == null) return { usd: notionalCcy, approximate: true };
  return { usd: notionalCcy * f, approximate: false };
}
