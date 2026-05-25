import type { Channel } from "../workspace/registry";
import type { SiloedAction } from "../workspace/actions";

export type AssetClass = "stocks" | "crypto";

export type Intent =
  | {
      type: "order";
      side: "buy" | "sell";
      qty: number;
      symbol: string;
      price?: number;
      otype: "market" | "limit";
    }
  | { type: "close"; symbol: string }
  | { type: "portfolio" }
  | { type: "movers"; kind: "gainers" | "losers" | "both" }
  | { type: "news"; symbol?: string }
  | { type: "orders" }
  | { type: "chart"; symbol: string }
  | { type: "market_summary" }
  | { type: "workspace"; actions: SiloedAction[] }
  | { type: "fallback"; text: string };

// The catalogue symbol universe the router validates tickers against. FE silo
// "stocks" maps to backend "us_equity". `loaded` is false until the universe
// (or its localStorage snapshot) is available — the router then leans on the
// uppercase/stopword heuristic instead of set membership.
export interface SymbolUniverse {
  stocks: Set<string>;
  crypto: Set<string>;
  loaded: boolean;
}

export const EMPTY_UNIVERSE: SymbolUniverse = {
  stocks: new Set(),
  crypto: new Set(),
  loaded: false,
};

export interface RouteContext {
  assetClass: AssetClass;
  // AI on → strict (ambiguous queries go to the AI fallback); off → tolerant
  // (≈ the pre-AI recall, so canned cards still fire without an AI round-trip).
  aiEnabled: boolean;
  symbolUniverse: SymbolUniverse;
}

// What a detector reports about a candidate match. The scorer turns these
// facts into a confidence score; detectors never decide routing themselves.
export interface DetectorHit {
  intent: Intent;
  // Count of content tokens (non-glue) this detector explains — its trigger
  // keyword(s) plus any argument tokens (symbols, qty).
  matched: number;
  // The trigger is the first content token of the query.
  anchored: boolean;
  // Rigid syntax (order / set-channel / clean watch-list / explicit chart X /
  // bare symbol) — inherently confident, so it gets a high base regardless of
  // surrounding prose coverage.
  grammar: boolean;
  // A symbol argument, for the validated-symbol bonus + casing check.
  symbol?: string;
  // The symbol token appeared uppercase in the raw input (a lowercase prose
  // mention never earns the validity bonus unless it is the whole query).
  symbolUpper?: boolean;
}

export type { Channel };

export interface ScoredCandidate {
  intent: Intent;
  score: number;
}
