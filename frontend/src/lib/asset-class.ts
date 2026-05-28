import type { Order, Position } from "../types";

// Single source of truth for FXCM-vs-crypto detection on the frontend.
//
// Crypto and FXCM symbols both use the BASE/QUOTE form (BTC/USD vs EUR/USD vs
// XAU/USD), so the slash alone is ambiguous. FXCM also serves non-pair symbols
// (US30, NAS100, SPX500). Two-tier check:
//   1. _fxcmSymbols cache, populated from /api/fxcm/instruments at app boot.
//      Authoritative — catches indices, metals, commodities.
//   2. ISO 4217 fiat regex fallback for the synchronous pre-boot path. Covers
//      every common forex pair before the bridge fetch resolves.
// Anything classified as FXCM is, by definition, NOT crypto.

const FIAT_CURRENCIES: ReadonlySet<string> = new Set([
  "USD", "EUR", "GBP", "JPY", "CHF", "AUD", "CAD", "NZD",
  "SEK", "NOK", "DKK", "MXN", "ZAR", "HKD", "SGD", "TRY",
  "CNH", "PLN", "HUF", "CZK", "ILS",
]);

const PAIR_RE = /^([A-Z]{3})\/([A-Z]{3})$/;

let _fxcmSymbols: ReadonlySet<string> | null = null;

// Called once at app boot with the FXCM instrument set. Safe to call repeatedly
// (later calls replace the cache). Errors during the fetch should silently no-op
// — the ISO fallback covers common pairs.
export function registerFxcmSymbols(symbols: Iterable<string>): void {
  _fxcmSymbols = new Set(symbols);
}

export function isForexSymbol(symbol: string): boolean {
  if (!symbol) return false;
  if (_fxcmSymbols && _fxcmSymbols.has(symbol)) return true;
  const m = PAIR_RE.exec(symbol);
  return !!m && FIAT_CURRENCIES.has(m[1]) && FIAT_CURRENCIES.has(m[2]);
}

// Load-bearing synchronous check — useOrderTicket reads it before the async
// asset fetch resolves, and the TradingView datafeed routes on it.
export const isCryptoSymbol = (symbol: string): boolean =>
  !!symbol && symbol.includes("/") && !isForexSymbol(symbol);

export const isCryptoPosition = (p: Position): boolean =>
  p.asset_class === "crypto" || isCryptoSymbol(p.symbol);

export const isCryptoOrder = (o: Order): boolean =>
  o.asset_class === "crypto" || isCryptoSymbol(o.symbol);
