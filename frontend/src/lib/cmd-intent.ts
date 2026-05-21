// ⌘K command-bar intent parser. Strict-ish regex over a small surface;
// returns the first matching intent or { type: "fallback" }. The result
// card per intent is rendered by components/cmd/cards.tsx.

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
  | { type: "fallback"; text: string };

// Filter symbol candidates so we don't classify common English words
// ("OPEN", "NEWS", "ALL") as tickers.
const STOPWORDS = new Set([
  "ALL",
  "AND",
  "ARE",
  "ASK",
  "AT",
  "BAR",
  "BUY",
  "CHART",
  "CLOSE",
  "DAY",
  "FOR",
  "FROM",
  "GAINER",
  "GAINERS",
  "HAPPENING",
  "HEADLINES",
  "HOLDING",
  "HOLDINGS",
  "HOW",
  "HOWS",
  "IN",
  "IS",
  "IT",
  "LIMIT",
  "LOSER",
  "LOSERS",
  "MARKET",
  "ME",
  "MOVERS",
  "MY",
  "NEWS",
  "NOW",
  "OF",
  "ON",
  "OPEN",
  "ORDER",
  "ORDERS",
  "OUT",
  "PORTFOLIO",
  "POSITIONS",
  "PRICE",
  "SELL",
  "SHOW",
  "STOP",
  "THE",
  "TO",
  "TODAY",
  "TOP",
  "WHAT",
  "WHATS",
  "WHATS",
  "WHEN",
  "WINNER",
  "WINNERS",
  "WORST",
  "YOU",
  "YOUR",
]);

function findSymbol(text: string): string | undefined {
  // Tickers: 1–5 uppercase letters, optional .X (e.g. BRK.B). Take the
  // first non-stopword match.
  const matches = text.toUpperCase().match(/\b[A-Z]{1,5}(\.[A-Z])?\b/g);
  if (!matches) return undefined;
  return matches.find((m) => !STOPWORDS.has(m));
}

export function parseIntent(input: string): Intent {
  const text = input.trim();
  if (!text) return { type: "fallback", text };
  const lower = text.toLowerCase();

  // ── order ── "buy 100 AAPL at market" / "sell 50 AMD" / "buy 5 TSLA at 240"
  const orderMatch = lower.match(
    /\b(buy|sell)\s+(\d+(?:\.\d+)?)\s+([a-z]{1,5}(?:\.[a-z])?)\b(?:\s+(?:at\s+)?(market|\$?\d+(?:\.\d+)?))?/i,
  );
  if (orderMatch) {
    const [, side, qty, sym, tail] = orderMatch;
    const price =
      tail && tail.toLowerCase() !== "market"
        ? Number(tail.replace(/^\$/, ""))
        : undefined;
    return {
      type: "order",
      side: side.toLowerCase() as "buy" | "sell",
      qty: Number(qty),
      symbol: sym.toUpperCase(),
      price,
      otype: price != null ? "limit" : "market",
    };
  }

  // ── close ── "close TSLA", "close my AAPL position"
  const closeMatch = lower.match(
    /\bclose\s+(?:my\s+|out\s+|all\s+)?([a-z]{1,5}(?:\.[a-z])?)\b/i,
  );
  if (closeMatch) {
    return { type: "close", symbol: closeMatch[1].toUpperCase() };
  }

  // ── portfolio ── any of "portfolio", "positions", "holdings", "book"
  if (/\b(portfolio|positions|holdings|book)\b/i.test(lower)) {
    return { type: "portfolio" };
  }

  // ── movers (specific) ──
  const gainHit = /\b(gainer|gainers|winner|winners|best)\b/i.test(lower);
  const loseHit = /\b(loser|losers|laggard|laggards|worst)\b/i.test(lower);
  if (gainHit && !loseHit) return { type: "movers", kind: "gainers" };
  if (loseHit && !gainHit) return { type: "movers", kind: "losers" };
  if (
    /\bmovers\b/i.test(lower) ||
    /\bwhat\s+changed\b/i.test(lower) ||
    (gainHit && loseHit)
  ) {
    return { type: "movers", kind: "both" };
  }

  // ── news ──
  if (/\b(news|happening|headlines)\b/i.test(lower)) {
    return { type: "news", symbol: findSymbol(text) };
  }

  // ── orders ── "orders" / "open orders" / "my orders"
  if (/\b(orders|open\s+orders)\b/i.test(lower)) {
    return { type: "orders" };
  }

  // ── chart ── "AAPL" alone, "how's NVDA", "chart AAPL"
  if (/^[a-z]{1,5}(\.[a-z])?$/i.test(text)) {
    return { type: "chart", symbol: text.toUpperCase() };
  }
  const chartMatch =
    text.match(/\bchart\s+([a-z]{1,5}(?:\.[a-z])?)\b/i) ||
    text.match(/\bhow(?:'s|s)?\s+([a-z]{1,5}(?:\.[a-z])?)\b/i);
  if (chartMatch) {
    return { type: "chart", symbol: chartMatch[1].toUpperCase() };
  }

  return { type: "fallback", text };
}
