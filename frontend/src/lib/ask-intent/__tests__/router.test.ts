import { describe, expect, it } from "vitest";

import { routeQuery } from "../router";
import type { AssetClass, Intent, RouteContext, SymbolUniverse } from "../types";

// Stub catalogue. TECH/BEST/ON are intentionally real tickers *and* common
// English words — the router must not chart them when they're used as prose.
const UNIVERSE: SymbolUniverse = {
  stocks: new Set(["AAPL", "NVDA", "TSLA", "TECH", "BEST", "ON", "AMD"]),
  crypto: new Set(["BTC/USD", "ETH/USD", "SOL/USD"]),
  loaded: true,
};

const ctx = (assetClass: AssetClass, aiEnabled: boolean): RouteContext => ({
  assetClass,
  aiEnabled,
  symbolUniverse: UNIVERSE,
});

type Mode = "on" | "off" | "both";
interface Row {
  input: string;
  silo?: AssetClass;
  mode?: Mode;
  expected: Intent["type"];
}

const rows: Row[] = [
  // ── the core hijack fixes (AI on → defer to the model) ──
  { input: "create a layout to watch the seven best tech companies", mode: "on", expected: "fallback" },
  { input: "what do you make of the best biotech names", mode: "on", expected: "fallback" },
  { input: "tell me about TECH", mode: "on", expected: "fallback" }, // NOT chart
  { input: "should I buy NVDA?", mode: "both", expected: "fallback" },
  { input: "is it a good time to buy ON?", mode: "on", expected: "fallback" },
  { input: "what do you think about TSLA", mode: "on", expected: "fallback" },

  // ── crisp commands still fire instantly, both modes ──
  { input: "top gainers", mode: "both", expected: "movers" },
  { input: "show me the biggest movers", mode: "both", expected: "movers" },
  { input: "biggest losers today", mode: "both", expected: "movers" },
  { input: "what changed today?", mode: "both", expected: "movers" },
  { input: "buy 100 AAPL at market", mode: "both", expected: "order" },
  { input: "sell 50 AMD", mode: "both", expected: "order" },
  { input: "buy 5 TSLA at 240", mode: "both", expected: "order" },
  { input: "AAPL", mode: "both", expected: "chart" },
  { input: "aapl", mode: "both", expected: "chart" },
  { input: "BTC/USD", mode: "both", expected: "chart" },
  { input: "chart NVDA", mode: "both", expected: "chart" },
  { input: "how's my AAPL?", mode: "both", expected: "chart" },
  { input: "news on AAPL", mode: "both", expected: "news" },
  { input: "portfolio", mode: "both", expected: "portfolio" },
  { input: "show my holdings", mode: "both", expected: "portfolio" },
  { input: "open orders", mode: "both", expected: "orders" },
  { input: "close TSLA", mode: "both", expected: "close" },
  { input: "sell all TSLA", mode: "both", expected: "close" },
  { input: "market summary", mode: "both", expected: "market_summary" },
  { input: "summary", mode: "both", expected: "market_summary" },

  // ── workspace deterministic commands ──
  { input: "watch AAPL NVDA TSLA", mode: "both", expected: "workspace" },
  { input: "trader layout", mode: "both", expected: "workspace" },
  { input: "set blue to NVDA", mode: "both", expected: "workspace" },
  { input: "add a news widget", mode: "both", expected: "workspace" },

  // ── non-tickers / junk must not get charted or closed ──
  { input: "close the chart", mode: "both", expected: "fallback" },
  { input: "", mode: "both", expected: "fallback" },

  // ── force-AI escape hatch ──
  { input: "ai: top gainers", mode: "on", expected: "fallback" },
  { input: "ask: portfolio", mode: "on", expected: "fallback" },

  // ── clear interrogatives always defer ──
  { input: "why did my order fail", mode: "both", expected: "fallback" },
  { input: "what is a stop limit order", mode: "both", expected: "fallback" },
];

const modes = (m: Mode): boolean[] =>
  m === "both" ? [true, false] : m === "on" ? [true] : [false];

describe("routeQuery", () => {
  for (const row of rows) {
    const silo = row.silo ?? "stocks";
    for (const ai of modes(row.mode ?? "both")) {
      it(`[${silo}/ai=${ai}] ${row.input || "(empty)"} → ${row.expected}`, () => {
        expect(routeQuery(row.input, ctx(silo, ai)).type).toBe(row.expected);
      });
    }
  }

  it("watch BTC ETH SOL from stocks targets the crypto silo", () => {
    const intent = routeQuery("watch BTC ETH SOL", ctx("stocks", true));
    expect(intent.type).toBe("workspace");
    if (intent.type === "workspace") {
      expect(intent.actions[0].silo).toBe("crypto");
    }
  });

  it("AI-off keeps tolerant recall the strict mode would defer", () => {
    // A buried keyword that scores between the two thresholds.
    const watch = "create a layout to watch the seven best tech companies";
    expect(routeQuery(watch, ctx("stocks", true)).type).toBe("fallback");
    expect(routeQuery(watch, ctx("stocks", false)).type).toBe("workspace");
  });
});
