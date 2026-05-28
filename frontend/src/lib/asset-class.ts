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
//      registration so the cache only holds forex pairs, metals, indices,
//      and stock CFDs.
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

// Filter out crypto-shape pairs at registration time. FXCM's instrument list
// includes BTC/USD CFDs that overlap with Alpaca's crypto symbols; without
// this guard the cache hit would shadow Alpaca's classification and the whole
// crypto silo (positions, orders, blotters) goes blank.
export function registerFxcmSymbols(symbols: Iterable<string>): void {
  const set = new Set<string>();
  for (const s of symbols) {
    if (!s) continue;
    const m = PAIR_RE.exec(s);
    if (m && !FIAT_OR_METAL.has(m[1])) continue; // crypto-shape — Alpaca owns it
    set.add(s);
  }
  _fxcmSymbols = set;
}

export function isForexSymbol(symbol: string): boolean {
  if (!symbol) return false;
  if (_fxcmSymbols && _fxcmSymbols.has(symbol)) return true;
  const m = PAIR_RE.exec(symbol);
  return !!m && FIAT_OR_METAL.has(m[1]) && FIAT_OR_METAL.has(m[2]);
}

// Load-bearing synchronous check — useOrderTicket reads it before the async
// asset fetch resolves, and the TradingView datafeed routes on it.
export const isCryptoSymbol = (symbol: string): boolean =>
  !!symbol && symbol.includes("/") && !isForexSymbol(symbol);

export const isCryptoPosition = (p: Position): boolean =>
  p.asset_class === "crypto" || isCryptoSymbol(p.symbol);

export const isCryptoOrder = (o: Order): boolean =>
  o.asset_class === "crypto" || isCryptoSymbol(o.symbol);
