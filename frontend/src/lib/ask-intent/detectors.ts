import type { Channel } from "../workspace/registry";
import type { WidgetId } from "../workspace/actions";
import {
  contentTokens,
  extractSymbols,
  findSymbol,
  firstContentToken,
  isCryptoToken,
  isGlueWord,
  isValidSymbol,
  toSymbol,
} from "./symbols";
import type { AssetClass, DetectorHit, RouteContext } from "./types";

// A detector inspects the query and either reports one candidate hit or passes.
type Detector = (text: string, ctx: RouteContext) => DetectorHit | null;

const lc = (s: string) => s.toLowerCase();
const isAnchored = (text: string, keyword: string) =>
  firstContentToken(text) === keyword.toLowerCase();

// Did the bare ticker appear uppercase in the raw input? (findSymbol upper-cases
// internally, losing the original casing the bonus needs.)
function appearsUpper(text: string, symbol: string): boolean {
  const bare = symbol.split("/")[0];
  return new RegExp(`\\b${bare}\\b`).test(text);
}

function parseQty(raw: string): number {
  const s = raw.toLowerCase();
  if (s.endsWith("k")) return Number(s.slice(0, -1)) * 1_000;
  if (s.endsWith("m")) return Number(s.slice(0, -1)) * 1_000_000;
  return Number(s);
}

// ── order ── "buy 100 AAPL at market" / "sell 50 AMD" / "buy 5 TSLA at 240".
// Rigid grammar (side + qty + symbol), so it stays confident even in prose; the
// order ticket validates the symbol downstream, so it isn't gated here.
const order: Detector = (text) => {
  const m = lc(text).match(
    /\b(buy|sell|purchase|short)\s+(\d+(?:\.\d+)?[km]?)\s+([a-z]{1,5}(?:\.[a-z])?(?:\/[a-z]{3,4})?)\b(?:\s+(?:at\s+)?(market|\$?\d+(?:\.\d+)?))?/i,
  );
  if (!m) return null;
  const [, rawSide, rawQty, sym, tail] = m;
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
    intent: {
      type: "order",
      side,
      qty: parseQty(rawQty),
      symbol: toSymbol(sym, undefined),
      price,
      otype: price != null ? "limit" : "market",
    },
    matched: contentTokens(m[0]).length,
    anchored: isAnchored(text, rawSide),
    grammar: true,
  };
};

// ── close ── "sell all TSLA" / "close TSLA" / "close my AAPL position". The
// captured token must be a real symbol (or the universe hasn't loaded), so
// "close the chart" / "sell all positions" don't fire.
function closeFrom(
  text: string,
  ctx: RouteContext,
  keyword: string,
  raw: string,
): DetectorHit | null {
  if (!isValidSymbol(raw, ctx.symbolUniverse, ctx.assetClass)) return null;
  const symbol = toSymbol(raw, ctx.assetClass);
  return {
    intent: { type: "close", symbol },
    matched: contentTokens(`${keyword} ${raw}`).length,
    anchored: isAnchored(text, keyword),
    grammar: true,
    symbol,
    symbolUpper: appearsUpper(text, symbol),
  };
}

const sellAll: Detector = (text, ctx) => {
  const m = lc(text).match(
    /\bsell\s+(?:all|everything)\s+(?:my\s+)?([a-z]{1,5}(?:\.[a-z])?(?:\/[a-z]{3,4})?)\b/i,
  );
  return m ? closeFrom(text, ctx, "sell", m[1]) : null;
};

const close: Detector = (text, ctx) => {
  const m = lc(text).match(
    /\bclose\s+(?:my\s+|out\s+|all\s+)?([a-z]{1,5}(?:\.[a-z])?(?:\/[a-z]{3,4})?)\b/i,
  );
  return m ? closeFrom(text, ctx, "close", m[1]) : null;
};

// ── portfolio ──
const PORTFOLIO_WORDS = ["portfolio", "positions", "holdings", "book"];
const portfolio: Detector = (text) => {
  const hit = contentTokens(text).find((t) => PORTFOLIO_WORDS.includes(t));
  if (!hit) return null;
  return {
    intent: { type: "portfolio" },
    matched: 1,
    anchored: isAnchored(text, hit),
    grammar: false,
  };
};

// ── movers ──
const GAIN_WORDS = ["gainer", "gainers", "winner", "winners", "best"];
const LOSE_WORDS = ["loser", "losers", "laggard", "laggards", "worst"];
const movers: Detector = (text) => {
  const lower = lc(text);
  const content = contentTokens(text);
  const gain = content.some((t) => GAIN_WORDS.includes(t));
  const lose = content.some((t) => LOSE_WORDS.includes(t));
  const moversWord = /\bmovers\b/.test(lower);
  const changed = /\bwhat\s+changed\b/.test(lower);
  let kind: "gainers" | "losers" | "both" | null = null;
  if (gain && !lose) kind = "gainers";
  else if (lose && !gain) kind = "losers";
  else if (moversWord || changed || (gain && lose)) kind = "both";
  if (!kind) return null;
  const matched = content.filter(
    (t) =>
      GAIN_WORDS.includes(t) ||
      LOSE_WORDS.includes(t) ||
      t === "movers" ||
      t === "changed",
  ).length;
  const anchorWord = content.find(
    (t) =>
      GAIN_WORDS.includes(t) ||
      LOSE_WORDS.includes(t) ||
      t === "movers" ||
      t === "changed",
  );
  return {
    intent: { type: "movers", kind },
    matched: Math.max(1, matched),
    anchored: anchorWord ? isAnchored(text, anchorWord) : false,
    grammar: false,
  };
};

// ── news ──
const NEWS_WORDS = ["news", "happening", "headlines"];
const news: Detector = (text, ctx) => {
  const hit = contentTokens(text).find((t) => NEWS_WORDS.includes(t));
  if (!hit) return null;
  const symbol = findSymbol(text, ctx.assetClass);
  return {
    intent: { type: "news", symbol },
    matched: 1 + (symbol ? 1 : 0),
    anchored: isAnchored(text, hit),
    grammar: false,
    symbol,
    symbolUpper: symbol ? appearsUpper(text, symbol) : undefined,
  };
};

// ── orders ──
const orders: Detector = (text) => {
  if (!/\borders\b/i.test(text)) return null;
  return {
    intent: { type: "orders" },
    matched: 1,
    anchored: isAnchored(text, "orders"),
    grammar: false,
  };
};

// ── market summary ──
const marketSummary: Detector = (text) => {
  const lower = lc(text);
  const m =
    lower.match(/\b(market|crypto)\s+summary\b/) ||
    lower.match(
      /\b(?:pull|show|get)\s+(?:latest\s+|my\s+)?(?:market\s+|crypto\s+)?summary\b/,
    ) ||
    lower.match(
      /\b(daily|morning|midday|eod|end.of.day|overnight|evening)\s+(?:summary|report|brief|update)\b/,
    ) ||
    lower.match(/^summary$/);
  if (!m) return null;
  return {
    intent: { type: "market_summary" },
    matched: Math.max(1, contentTokens(m[0]).length),
    anchored: firstContentToken(text) === "summary" || /^summary/i.test(text.trim()) ||
      isAnchored(text, "market") || isAnchored(text, "crypto"),
    grammar: false,
  };
};

// ── chart ── "AAPL" alone, "BTC/USD" alone, "chart AAPL", "how's NVDA". The
// symbol must validate (or the universe hasn't loaded) so a non-ticker doesn't
// get charted.
const chart: Detector = (text, ctx) => {
  const t = text.trim();
  // Bare single symbol.
  if (/^[a-z]{1,5}(\.[a-z])?$/i.test(t) || /^[a-z]{2,5}\/[a-z]{3,4}$/i.test(t)) {
    if (!isValidSymbol(t, ctx.symbolUniverse, ctx.assetClass)) return null;
    const symbol = toSymbol(t, ctx.assetClass);
    return {
      intent: { type: "chart", symbol },
      matched: 1,
      anchored: true,
      grammar: true,
      symbol,
      symbolUpper: t === t.toUpperCase() && /[A-Z]/.test(t),
    };
  }
  // Explicit "chart X" / "how's X".
  const m =
    t.match(
      /\bchart\s+(?:(?:my|the|our)\s+)?([a-z]{1,5}(?:\.[a-z])?(?:\/[a-z]{3,4})?)\b/i,
    ) ||
    t.match(
      /\bhow(?:'s|s)?\s+(?:(?:my|the|our)\s+)?([a-z]{1,5}(?:\.[a-z])?(?:\/[a-z]{3,4})?)\b/i,
    );
  if (!m) return null;
  const raw = m[1];
  if (isGlueWord(raw)) return null; // "how's it going", "chart the trend"
  if (!isValidSymbol(raw, ctx.symbolUniverse, ctx.assetClass)) return null;
  const symbol = toSymbol(raw, ctx.assetClass);
  const keyword = /^chart\b/i.test(m[0]) ? "chart" : "how";
  return {
    intent: { type: "chart", symbol },
    matched: contentTokens(m[0]).length || 1,
    anchored: isAnchored(text, keyword),
    grammar: true,
    symbol,
    symbolUpper: appearsUpper(text, symbol),
  };
};

// ── workspace control ── deterministic commands; subtler asks fall to the AI.
const WORKSPACE_WIDGETS: Record<string, WidgetId> = {
  chart: "chart",
  minichart: "minichart",
  news: "news",
  watchlist: "watchlist",
  positions: "positions",
  orders: "orders",
  activity: "activity",
  account: "account",
  trade: "trade",
  tradeticket: "trade",
  profile: "profile",
  fundamentals: "fundamentals",
  financials: "fundamentals",
  earnings: "earnings",
  earningscalendar: "earnings",
  trending: "trending",
  trendingstocks: "trending",
  smartscore: "smartscore",
  smart: "smartscore",
  sentiment: "sentiment",
  analysts: "analysts",
  analystratings: "analysts",
  ratings: "analysts",
  hedgefunds: "hedgefunds",
  hedgefund: "hedgefunds",
  hedgies: "hedgefunds",
  insiders: "insiders",
  insider: "insiders",
};

function watchSilo(syms: string[], ctx: RouteContext): AssetClass {
  const crypto = syms.filter((s) => isCryptoToken(s, ctx.symbolUniverse)).length;
  if (crypto === syms.length) return "crypto";
  if (crypto === 0) return "stocks";
  return ctx.assetClass;
}

const workspace: Detector = (text, ctx) => {
  const lower = lc(text);

  // Apply a named preset: "trader layout", "use the researcher layout".
  const preset = lower.match(/\b(trader|researcher|watcher|focus)\b/);
  if (preset && /\blayout\b/.test(lower)) {
    return {
      intent: { type: "workspace", actions: [{ kind: "apply_preset", preset: preset[1] }] },
      matched: 2,
      anchored: isAnchored(text, preset[1]),
      grammar: true,
    };
  }

  // Set a channel's instrument: "set blue to NVDA".
  const setCh = lower.match(
    /\bset\s+(?:the\s+)?(main|blue|green|amber)\s+(?:channel\s+)?to\s+([a-z]{1,5}(?:\.[a-z])?(?:\/[a-z]{3,4})?)\b/,
  );
  if (setCh) {
    const symbol = toSymbol(setCh[2], ctx.assetClass);
    return {
      intent: {
        type: "workspace",
        actions: [{ kind: "set_channel", channel: setCh[1] as Channel, symbol }],
      },
      matched: 3,
      anchored: isAnchored(text, "set"),
      grammar: true,
      symbol,
      symbolUpper: appearsUpper(text, symbol),
    };
  }

  // Watch grid: "watch AAPL NVDA TSLA" → one standalone chart per symbol.
  const watch = lower.match(/\bwatch\s+(.+)$/);
  if (watch) {
    const remContent = contentTokens(watch[1]);
    const validSyms = remContent.filter((s) =>
      isValidSymbol(s, ctx.symbolUniverse, ctx.assetClass),
    );
    if (validSyms.length) {
      const silo = watchSilo(validSyms, ctx);
      const syms = validSyms.map((s) => toSymbol(s, silo));
      return {
        intent: {
          type: "workspace",
          actions: [
            {
              kind: "build_layout",
              silo,
              spec: {
                widgets: syms.map((s) => ({ kind: "chart" as WidgetId, symbol: s })),
                arrangement: "grid",
              },
            },
          ],
        },
        matched: validSyms.length + 1,
        anchored: isAnchored(text, "watch"),
        // Clean only when every content token after "watch" is a valid symbol.
        grammar: validSyms.length === remContent.length,
      };
    }
  }

  // Add a single widget: "add a chart", "add a news widget", "add chart of AAPL".
  const add = lower.match(
    /\badd\s+(?:a\s+|an\s+)?(chart|mini\s?chart|news|watchlist|positions|orders|activity|account|trade(?:\s*ticket)?|profile|fundamentals|financials|earnings(?:\s*calendar)?|trending(?:\s*stocks)?|smart\s?score|smart|sentiment|analyst\s?ratings|analysts|ratings|hedge\s?funds?|hedgies|insiders?)\b(?:.*?\b(?:of|for)\s+([a-z]{1,5}(?:\.[a-z])?(?:\/[a-z]{3,4})?)\b)?/,
  );
  if (add) {
    const widget = WORKSPACE_WIDGETS[add[1].replace(/\s+/g, "")];
    if (widget) {
      const symbol = add[2] ? toSymbol(add[2], ctx.assetClass) : undefined;
      return {
        intent: { type: "workspace", actions: [{ kind: "add_widget", widget, symbol }] },
        matched: 2,
        anchored: isAnchored(text, "add"),
        grammar: true,
      };
    }
  }

  return null;
};

// Priority order doubles as the tie-break when two candidates score equally.
export const DETECTORS: Detector[] = [
  workspace,
  order,
  sellAll,
  close,
  portfolio,
  movers,
  news,
  orders,
  marketSummary,
  chart,
];

export { extractSymbols };
