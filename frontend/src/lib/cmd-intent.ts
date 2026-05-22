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

export type AssetClass = "stocks" | "crypto";

// Quote currencies in crypto pairs (BTC/USD) — never tickers on their own.
const QUOTE_CCY = new Set(["USD", "USDT", "USDC"]);

// Normalise a parsed symbol. Crypto pairs (with a slash) pass through; in the
// crypto silo a bare coin ("BTC") becomes the USD pair ("BTC/USD") so the
// order ticket / chart / datafeed treat it as crypto.
function toSymbol(raw: string, assetClass?: AssetClass): string {
  const up = raw.toUpperCase();
  if (up.includes("/")) return up;
  return assetClass === "crypto" ? `${up}/USD` : up;
}

function findSymbol(text: string, assetClass?: AssetClass): string | undefined {
  const up = text.toUpperCase();
  // A crypto pair (BTC/USD) wins outright.
  const pair = up.match(/\b[A-Z]{2,5}\/[A-Z]{3,4}\b/);
  if (pair) return pair[0];
  // Tickers: 1–5 uppercase letters, optional .X (e.g. BRK.B). Skip stopwords
  // and bare quote currencies. Take the first match.
  const matches = up.match(/\b[A-Z]{1,5}(?:\.[A-Z])?\b/g);
  const sym = matches?.find((m) => !STOPWORDS.has(m) && !QUOTE_CCY.has(m));
  return sym ? toSymbol(sym, assetClass) : undefined;
}

// All ticker/pair candidates in the text, preserving order. Exported so
// CmdBar can extract symbols from AI response text for dynamic follow-up chips.
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

function parseQty(raw: string): number {
  const s = raw.toLowerCase();
  if (s.endsWith("k")) return Number(s.slice(0, -1)) * 1_000;
  if (s.endsWith("m")) return Number(s.slice(0, -1)) * 1_000_000;
  return Number(s);
}

export function parseIntent(input: string, assetClass?: AssetClass): Intent {
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
    /\b(buy|sell|purchase|short)\s+(\d+(?:\.\d+)?[km]?)\s+([a-z]{1,5}(?:\.[a-z])?(?:\/[a-z]{3,4})?)\b(?:\s+(?:at\s+)?(market|\$?\d+(?:\.\d+)?))?/i,
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
      symbol: toSymbol(sym, assetClass),
      price,
      otype: price != null ? "limit" : "market",
    };
  }

  // ── sell all [sym] → close ── "sell all TSLA", "sell everything TSLA"
  // Triggers when no explicit share count follows "sell all/everything".
  const sellAllMatch = lower.match(
    /\bsell\s+(?:all|everything)\s+(?:my\s+)?([a-z]{1,5}(?:\.[a-z])?(?:\/[a-z]{3,4})?)\b/i,
  );
  if (sellAllMatch) {
    return { type: "close", symbol: toSymbol(sellAllMatch[1], assetClass) };
  }

  // ── close ── "close TSLA", "close my AAPL position"
  const closeMatch = lower.match(
    /\bclose\s+(?:my\s+|out\s+|all\s+)?([a-z]{1,5}(?:\.[a-z])?(?:\/[a-z]{3,4})?)\b/i,
  );
  if (closeMatch) {
    return { type: "close", symbol: toSymbol(closeMatch[1], assetClass) };
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
    return { type: "news", symbol: findSymbol(text, assetClass) };
  }

  // ── orders ── "orders" / "open orders" / "my orders"
  if (/\b(orders|open\s+orders)\b/i.test(lower)) {
    return { type: "orders" };
  }

  // ── market summary ──
  if (
    /\b(market|crypto)\s+summary\b/i.test(lower) ||
    /\b(pull|show|get)\s+(?:latest\s+|my\s+)?(?:market\s+|crypto\s+)?summary\b/i.test(lower) ||
    /\b(daily|morning|midday|eod|end.of.day|overnight|evening)\s+(summary|report|brief|update)\b/i.test(lower) ||
    /^summary$/i.test(lower)
  ) {
    return { type: "market_summary" };
  }

  // ── chart ── "AAPL" alone, "BTC/USD" alone, "how's NVDA", "chart AAPL"
  if (/^[a-z]{1,5}(\.[a-z])?$/i.test(text) || /^[a-z]{2,5}\/[a-z]{3,4}$/i.test(text)) {
    return { type: "chart", symbol: toSymbol(text, assetClass) };
  }
  const chartMatch =
    text.match(/\bchart\s+(?:(?:my|the|our)\s+)?([a-z]{1,5}(?:\.[a-z])?(?:\/[a-z]{3,4})?)\b/i) ||
    text.match(/\bhow(?:'s|s)?\s+(?:(?:my|the|our)\s+)?([a-z]{1,5}(?:\.[a-z])?(?:\/[a-z]{3,4})?)\b/i);
  if (chartMatch) {
    return { type: "chart", symbol: toSymbol(chartMatch[1], assetClass) };
  }

  return { type: "fallback", text };
}
