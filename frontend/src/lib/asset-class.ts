import type { Order, Position } from "../types";

// Single source of truth for FXCM-vs-crypto detection on the frontend.
//
// Crypto and FXCM symbols both use the BASE/QUOTE form (BTC/USD vs EUR/USD vs
// XAU/USD), so the slash alone is ambiguous. FXCM also serves non-pair symbols
// (US30, NAS100, SPX500) AND crypto CFDs that overlap with Alpaca's crypto
// silo (BTC/USD, ETH/USD, SOL/USD, ...). We must never let an FXCM-cache hit
// shadow a crypto pair the user trades on Alpaca.
//
// Two-tier check:
//   1. _fxcmSymbols cache, populated from /api/fxcm/instruments at app boot
//      via registerFxcmSymbols. CRYPTO-SHAPE PAIRS ARE FILTERED OUT during
//      registration so the cache only holds CFD pairs (fiat forex, metals,
//      indices, stock CFDs).
//   2. ISO 4217 fiat + metal regex fallback for the synchronous pre-boot
//      path.
// Anything classified as FXCM is, by definition, NOT crypto.

// ISO 4217 fiat + metal codes. A slash-form symbol qualifies as FXCM only if
// BOTH legs are in this set. BTC/ETH/etc. are deliberately absent — they
// belong to Alpaca's crypto silo even when FXCM serves them as CFDs.
const FIAT_OR_METAL: ReadonlySet<string> = new Set([
  // Fiat
  "USD", "EUR", "GBP", "JPY", "CHF", "AUD", "CAD", "NZD",
  "SEK", "NOK", "DKK", "MXN", "ZAR", "HKD", "SGD", "TRY",
  "CNH", "PLN", "HUF", "CZK", "ILS",
  // Metals (ISO 4217 reserves X-prefix codes for them)
  "XAU", "XAG", "XPT", "XPD",
]);

const PAIR_RE = /^([A-Z]{3})\/([A-Z]{3})$/;

let _fxcmSymbols: ReadonlySet<string> | null = null;
// Lowercase → canonical FXCM name (e.g. "rblx.us" → "RBLX.us"), so the
// Ask-intent parser (which lowercases tokens) can validate + normalise CFD
// instruments back to their exact API casing.
let _fxcmLower: ReadonlyMap<string, string> | null = null;

// Filter out crypto-shape pairs at registration time. FXCM's instrument list
// includes BTC/USD CFDs that overlap with Alpaca's crypto symbols; without
// this guard the cache hit would shadow Alpaca's classification and the whole
// crypto silo (positions, orders, blotters) goes blank.
export function registerFxcmSymbols(symbols: Iterable<string>): void {
  const set = new Set<string>();
  const lower = new Map<string, string>();
  for (const s of symbols) {
    if (!s) continue;
    const m = PAIR_RE.exec(s);
    if (m && !FIAT_OR_METAL.has(m[1])) continue; // crypto-shape — Alpaca owns it
    set.add(s);
    lower.set(s.toLowerCase(), s);
  }
  _fxcmSymbols = set;
  _fxcmLower = lower;
}

// Case-insensitive resolve of a (possibly lowercased) token to the canonical
// FXCM instrument name, or null if it isn't a CFD instrument. Cache hit first
// (covers indices/metals/stock CFDs incl. mixed-case suffixes), then the
// ISO-fiat pair regex as a pre-boot / cache-miss fallback (returns the
// upper-cased pair). Used by the Ask-intent parser for CFD silo validation.
export function resolveCfdSymbol(token: string): string | null {
  if (!token) return null;
  const hit = _fxcmLower?.get(token.toLowerCase());
  if (hit) return hit;
  const up = token.toUpperCase();
  const m = PAIR_RE.exec(up);
  if (m && FIAT_OR_METAL.has(m[1]) && FIAT_OR_METAL.has(m[2])) return up;
  return null;
}

// True for a fiat/fiat forex pair (EUR/USD, USD/JPY) — i.e. the FXCM
// instrument_type 1 class that trades in 1,000-unit lots. Excludes metals
// (XAU/XAG/… are slash-pairs too but trade in base-unit lots). Used as a
// subscription-free fallback for the CFD order ticket's lot-size rule when the
// live /prices row (which carries the authoritative instrument_type) is absent.
export function isForexPair(symbol: string): boolean {
  const m = PAIR_RE.exec(symbol.toUpperCase());
  if (!m) return false;
  const fiat = (c: string) => FIAT_OR_METAL.has(c) && !c.startsWith("X");
  return fiat(m[1]) && fiat(m[2]);
}

export function isCfdSymbol(symbol: string): boolean {
  if (!symbol) return false;
  if (_fxcmSymbols && _fxcmSymbols.has(symbol)) return true;
  const m = PAIR_RE.exec(symbol);
  return !!m && FIAT_OR_METAL.has(m[1]) && FIAT_OR_METAL.has(m[2]);
}

// Load-bearing synchronous check — useOrderTicket reads it before the async
// asset fetch resolves, and the TradingView datafeed routes on it.
export const isCryptoSymbol = (symbol: string): boolean =>
  !!symbol && symbol.includes("/") && !isCfdSymbol(symbol);

// Stock CFDs are the only FXCM instruments carrying a dot-suffix exchange tag
// (RBLX.us, ASML.nl, BMW.de) — FX pairs, indices, metals and commodities never
// do. Used to gate the research widgets (Profile/Fundamentals work for stock
// CFDs via /api/asset-profile; FX/index/metal/commodity have no such data).
export const isStockCfdSymbol = (symbol: string): boolean =>
  isCfdSymbol(symbol) && symbol.includes(".");

// US-listed stock CFDs map to the bare US ticker Tipranks / FMP know
// (RBLX.us → RBLX). Two suffixes are US shares: `.us` (regular session) and
// `.ext` (the 24-hour US share product) — both resolve to the same underlying.
// Returns null for non-US stock CFDs and non-stock CFDs — Tipranks research
// only covers US equities, so those stay notice-only.
export function cfdUsUnderlying(symbol: string): string | null {
  if (!isCfdSymbol(symbol)) return null;
  const m = /^(.+)\.(?:us|ext)$/i.exec(symbol);
  return m ? m[1].toUpperCase() : null;
}

export const isCryptoPosition = (p: Position): boolean =>
  p.asset_class === "crypto" || isCryptoSymbol(p.symbol);

export const isCryptoOrder = (o: Order): boolean =>
  o.asset_class === "crypto" || isCryptoSymbol(o.symbol);
