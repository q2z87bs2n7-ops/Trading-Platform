// Ask anything intent parser. Strict-ish regex over a small surface;
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
  | { type: "market_summary" }
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
  "DAILY",
  "LATEST",
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
  "PULL",
  "REPORT",
  "SELL",
  "SHOW",
  "STOP",
  "SUMMARY",
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

// All non-stopword ticker candidates in the text, preserving order.
// Exported so CmdBar can extract symbols from AI response text for
// dynamic follow-up chips.
export function extractSymbols(text: string): string[] {
  const matches = text.toUpperCase().match(/\b[A-Z]{1,5}(?:\.[A-Z])?\b/g) ?? [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const m of matches) {
    if (!STOPWORDS.has(m) && !seen.has(m)) {
      seen.add(m);
      result.push(m);
    }
  }
  return result;
}

function parseQty(raw: string): number {
  const s = raw.toLowerCase();
  if (s.endsWith("k")) return Number(s.slice(0, -1)) * 1_000;
  if (s.endsWith("m")) return Number(s.slice(0, -1)) * 1_000_000;
  return Number(s);
}

export function parseIntent(input: string): Intent {
  const text = input.trim();
  if (!text) return { type: "fallback", text };
  const lower = text.toLowerCase();

  // ── negative routing ── open-ended questions bypass structured intents.
  // Prevents e.g. "why did my order fail" being hijacked by the orders intent.
  // Does NOT catch "how's AAPL" or "what's SPY" — those use contractions and
  // fall through to the chart intent below.
  if (
    /^(why\b|explain\b|what\s+(is|are|does|do|was|were|means?|happened)\b|how\s+(does|do|did|can|should|would|is|are)\b)/i.test(
      lower,
    )
  ) {
    return { type: "fallback", text };
  }

  // ── order ── "buy 100 AAPL at market" / "sell 50 AMD" / "buy 5 TSLA at 240"
  // "purchase" normalises to buy; "short" normalises to sell.
  // Qty accepts k/m suffix: "1k" → 1000, "2.5k" → 2500.
  const orderMatch = lower.match(
    /\b(buy|sell|purchase|short)\s+(\d+(?:\.\d+)?[km]?)\s+([a-z]{1,5}(?:\.[a-z])?)\b(?:\s+(?:at\s+)?(market|\$?\d+(?:\.\d+)?))?/i,
  );
  if (orderMatch) {
    const [, rawSide, rawQty, sym, tail] = orderMatch;
    const side =
      rawSide.toLowerCase() === "purchase"
        ? "buy"
        : rawSide.toLowerCase() === "short"
          ? "sell"
          : (rawSide.toLowerCase() as "buy" | "sell");
    const price =
      tail && tail.toLowerCase() !== "market"
        ? Number(tail.replace(/^\$/, ""))
        : undefined;
    return {
      type: "order",
      side,
      qty: parseQty(rawQty),
      symbol: sym.toUpperCase(),
      price,
      otype: price != null ? "limit" : "market",
    };
  }

  // ── sell all [sym] → close ── "sell all TSLA", "sell everything TSLA"
  // Triggers when no explicit share count follows "sell all/everything".
  const sellAllMatch = lower.match(
    /\bsell\s+(?:all|everything)\s+(?:my\s+)?([a-z]{1,5}(?:\.[a-z])?)\b/i,
  );
  if (sellAllMatch) {
    return { type: "close", symbol: sellAllMatch[1].toUpperCase() };
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

  // ── market summary ──
  if (
    /\bmarket\s+summary\b/i.test(lower) ||
    /\b(pull|show|get)\s+(?:latest\s+|my\s+)?(?:market\s+)?summary\b/i.test(lower) ||
    /\b(daily|morning|midday|eod|end.of.day)\s+(summary|report|brief|update)\b/i.test(lower)
  ) {
    return { type: "market_summary" };
  }

  // ── chart ── "AAPL" alone, "how's NVDA", "chart AAPL"
  if (/^[a-z]{1,5}(\.[a-z])?$/i.test(text)) {
    return { type: "chart", symbol: text.toUpperCase() };
  }
  const chartMatch =
    text.match(/\bchart\s+(?:(?:my|the|our)\s+)?([a-z]{1,5}(?:\.[a-z])?)\b/i) ||
    text.match(/\bhow(?:'s|s)?\s+(?:(?:my|the|our)\s+)?([a-z]{1,5}(?:\.[a-z])?)\b/i);
  if (chartMatch) {
    return { type: "chart", symbol: chartMatch[1].toUpperCase() };
  }

  return { type: "fallback", text };
}
