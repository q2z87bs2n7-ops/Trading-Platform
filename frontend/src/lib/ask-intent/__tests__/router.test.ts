import { describe, expect, it } from "vitest";

import { routeQuery } from "../router";
import { registerFxcmSymbols } from "../../asset-class";
import type { AssetClass, Intent, RouteContext, SymbolUniverse } from "../types";

// Seed the FXCM classifier cache so the CFD silo can validate instruments
// (resolveCfdSymbol reads it). US30/NAS100 aren't fiat pairs, so they only
// resolve via the cache; EUR/USD & XAU/USD also hit the fiat-pair fallback.
registerFxcmSymbols(["EUR/USD", "GBP/USD", "XAU/USD", "US30", "RBLX.us"]);

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

  // ── CFD silo ──
  { input: "EUR/USD", silo: "cfd", mode: "both", expected: "chart" },
  { input: "chart XAU/USD", silo: "cfd", mode: "both", expected: "chart" },
  { input: "US30", silo: "cfd", mode: "both", expected: "chart" },
  { input: "watch EUR/USD GBP/USD XAU/USD", silo: "cfd", mode: "both", expected: "workspace" },
  { input: "set blue to US30", silo: "cfd", mode: "both", expected: "workspace" },
  { input: "trader layout", silo: "cfd", mode: "both", expected: "workspace" },
  // No local Alpaca trade path in CFD — order/close defer to the AI fallback.
  { input: "buy 1000 EUR/USD", silo: "cfd", mode: "both", expected: "fallback" },
  { input: "close EUR/USD", silo: "cfd", mode: "both", expected: "fallback" },

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

  it("CFD watch/set-channel target the cfd silo", () => {
    const watch = routeQuery("watch EUR/USD GBP/USD XAU/USD", ctx("cfd", true));
    expect(watch.type).toBe("workspace");
    if (watch.type === "workspace") expect(watch.actions[0].silo).toBe("cfd");

    const setCh = routeQuery("set blue to US30", ctx("cfd", true));
    expect(setCh.type).toBe("workspace");
    if (setCh.type === "workspace" && setCh.actions[0].kind === "set_channel") {
      expect(setCh.actions[0].symbol).toBe("US30");
    }
  });

  it("AI-off keeps tolerant recall the strict mode would defer", () => {
    // A buried keyword that scores between the two thresholds.
    const watch = "create a layout to watch the seven best tech companies";
    expect(routeQuery(watch, ctx("stocks", true)).type).toBe("fallback");
    expect(routeQuery(watch, ctx("stocks", false)).type).toBe("workspace");
  });
});
