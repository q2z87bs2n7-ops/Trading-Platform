import type { AssetClass, SymbolUniverse } from "./types";

// Trading-keyword + common-word denylist so we don't classify English words
// ("OPEN", "NEWS", "ALL") as tickers in the regex heuristic path.
export const STOPWORDS = new Set([
  "ALL", "AND", "ARE", "ASK", "AT", "BAR", "BUY", "CHART", "CLOSE", "DAY",
  "FOR", "FROM", "GAINER", "GAINERS", "HAPPENING", "HEADLINES", "HOLDING",
  "HOLDINGS", "HOW", "HOWS", "IN", "IS", "IT", "LIMIT", "LOSER", "LOSERS",
  "DAILY", "LATEST", "MARKET", "ME", "MOVERS", "MY", "NEWS", "NOW", "OF",
  "ON", "OPEN", "ORDER", "ORDERS", "OUT", "PORTFOLIO", "POSITIONS", "PRICE",
  "PULL", "REPORT", "SELL", "SHOW", "STOP", "SUMMARY", "THE", "TO", "TODAY",
  "TOP", "WHAT", "WHATS", "WHEN", "WINNER", "WINNERS", "WORST", "WATCH",
  "WIDGET", "LAYOUT", "YOU", "YOUR",
]);

// Quote currencies in crypto pairs (BTC/USD) — never tickers on their own.
export const QUOTE_CCY = new Set(["USD", "USDT", "USDC"]);

// Grammatical glue, command verbs, and generic descriptive modifiers. Excluded
// from the coverage denominator so a crisp command ("top gainers", "show me the
// biggest movers") scores ~1.0 while a keyword buried among *topical* content
// words ("the best biotech names") scores low. Deliberately does NOT include
// the routing keywords themselves (buy/sell/chart/watch/news/movers…) — those
// are content a detector must explain.
const GLUE = new Set([
  "the", "a", "an", "to", "of", "for", "in", "on", "at", "by", "from", "with",
  "and", "or", "my", "me", "mine", "our", "your", "you", "i", "it", "its",
  "is", "are", "was", "were", "be", "been", "am", "do", "does", "did",
  "please", "kindly", "show", "see", "get", "give", "gimme", "tell", "fetch",
  "display", "bring", "latest", "current", "recent", "now", "today", "top",
  "biggest", "largest", "big", "large", "most", "major", "key", "main",
  "overall", "general", "quick", "brief", "full", "whole", "any", "some",
  "what", "whats", "how", "hows", "when", "whens", "can", "could", "would",
  "should", "want", "need", "let", "us", "about", "open",
]);

// Word-ish tokens: keep `/` and `.` inside a token so "BTC/USD" and "BRK.B"
// stay whole; numbers (incl. "2.5k") are single tokens too.
const TOKEN_RE = /[a-z0-9]+(?:[./][a-z0-9]+)*/gi;

export function tokenize(text: string): string[] {
  return text.toLowerCase().match(TOKEN_RE) ?? [];
}

export function contentTokens(text: string): string[] {
  return tokenize(text).filter((t) => !GLUE.has(t));
}

export function isGlueWord(tok: string): boolean {
  return GLUE.has(tok.toLowerCase());
}

export function contentTokenCount(text: string): number {
  return contentTokens(text).length;
}

export function firstContentToken(text: string): string | undefined {
  return contentTokens(text)[0];
}

// Normalise a parsed symbol. Crypto pairs (with a slash) pass through; in the
// crypto silo a bare coin ("BTC") becomes the USD pair ("BTC/USD").
export function toSymbol(raw: string, assetClass?: AssetClass): string {
  const up = raw.toUpperCase();
  if (up.includes("/")) return up;
  return assetClass === "crypto" ? `${up}/USD` : up;
}

export function findSymbol(
  text: string,
  assetClass?: AssetClass,
): string | undefined {
  const up = text.toUpperCase();
  const pair = up.match(/\b[A-Z]{2,5}\/[A-Z]{3,4}\b/);
  if (pair) return pair[0];
  const matches = up.match(/\b[A-Z]{1,5}(?:\.[A-Z])?\b/g);
  const sym = matches?.find((m) => !STOPWORDS.has(m) && !QUOTE_CCY.has(m));
  return sym ? toSymbol(sym, assetClass) : undefined;
}

// All ticker/pair candidates in the text, preserving order. Used by AskBar to
// derive follow-up chips from AI response text, and by the watch detector.
export function extractSymbols(text: string): string[] {
  const up = text.toUpperCase();
  const seen = new Set<string>();
  const result: string[] = [];
  for (const m of up.match(/\b[A-Z]{2,5}\/[A-Z]{3,4}\b/g) ?? []) {
    if (!seen.has(m)) {
      seen.add(m);
      result.push(m);
    }
  }
  for (const m of up.match(/\b[A-Z]{1,5}(?:\.[A-Z])?\b/g) ?? []) {
    if (!STOPWORDS.has(m) && !QUOTE_CCY.has(m) && !seen.has(m)) {
      seen.add(m);
      result.push(m);
    }
  }
  return result;
}

// True if `tok` resolves to a crypto pair in the universe ("BTC" → "BTC/USD").
export function isCryptoToken(tok: string, universe: SymbolUniverse): boolean {
  const up = tok.toUpperCase();
  if (up.includes("/")) return universe.crypto.has(up);
  return universe.crypto.has(`${up}/USD`);
}

// True if `tok` is a real instrument for `silo` (crypto pairs validate
// cross-silo so "watch BTC ETH" works from the stocks silo). When the universe
// hasn't loaded, fall back to the uppercase/stopword heuristic so cold-start
// routing still behaves like the pre-universe parser.
export function isValidSymbol(
  tok: string,
  universe: SymbolUniverse,
  silo: AssetClass,
): boolean {
  const up = tok.toUpperCase();
  if (!universe.loaded) {
    const bare = up.includes("/") ? up.split("/")[0] : up;
    return !STOPWORDS.has(bare) && !QUOTE_CCY.has(bare);
  }
  if (up.includes("/")) return universe.crypto.has(up);
  if (isCryptoToken(up, universe)) return true;
  return silo === "crypto"
    ? universe.crypto.has(`${up}/USD`)
    : universe.stocks.has(up);
}
