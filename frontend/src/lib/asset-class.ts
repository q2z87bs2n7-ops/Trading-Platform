import type { Order, Position } from "../types";

// Single source of truth for crypto detection on the frontend.
//
// A symbol is crypto when its asset_class says so, or — as a synchronous
// fast-path before asset_class is known — when it contains a "/" (crypto pairs
// are "BASE/QUOTE", e.g. BTC/USD). The slash fast-path is load-bearing:
// useOrderTicket applies crypto constraints from it before the async asset
// fetch resolves, and the TradingView datafeed routes on it too.
export const isCryptoSymbol = (symbol: string): boolean => symbol.includes("/");

export const isCryptoPosition = (p: Position): boolean =>
  p.asset_class === "crypto" || isCryptoSymbol(p.symbol);

export const isCryptoOrder = (o: Order): boolean =>
  o.asset_class === "crypto" || isCryptoSymbol(o.symbol);
