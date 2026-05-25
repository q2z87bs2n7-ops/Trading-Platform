// Ask anything intent router. A confidence-scored, AI-aware classifier:
// detectors report match facts (detectors.ts), the confidence model turns them
// into scores (scoring.ts), and the router picks the top candidate or defers to
// the AI fallback (router.ts). Symbols validate against the full catalogue
// universe (symbols.ts). The result card per intent is rendered by
// components/ask/cards.tsx.

export { routeQuery, parseIntent } from "./router";
export { extractSymbols } from "./symbols";
export {
  THRESHOLD_AI_ON,
  THRESHOLD_AI_OFF,
} from "./scoring";
export { EMPTY_UNIVERSE } from "./types";
export type {
  AssetClass,
  Intent,
  RouteContext,
  ScoredCandidate,
  SymbolUniverse,
} from "./types";
