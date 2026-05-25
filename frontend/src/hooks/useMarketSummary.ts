import { useEffect, useRef, useState } from "react";

import { postAiAsk } from "../api";
import type { AssetClass } from "../lib/ask-intent";

export type SummaryWindow = "overnight" | "open" | "midday" | "close";

export interface MarketSummaryCache {
  window: SummaryWindow;
  dateStr: string; // YYYY-MM-DD (EST for stocks, UTC for crypto) — day rollover
  content: string;
  generatedAt: number;
  dismissed: boolean;
}

// Per-silo cache so the stocks and crypto summaries never clobber each other.
function lsKey(assetClass: AssetClass): string {
  return assetClass === "crypto"
    ? "crypto_market_summary_v1"
    : "market_summary_v1";
}

const STOCK_WINDOW_LABELS: Record<SummaryWindow, string> = {
  overnight: "Overnight Report",
  open: "Market Open Report",
  midday: "Midday Report",
  close: "Market Close Report",
};

// Crypto trades 24/7; labels show UTC bucket so users in any timezone know
// exactly when each window fires (not misleading local-time names).
const CRYPTO_WINDOW_LABELS: Record<SummaryWindow, string> = {
  overnight: "Crypto Update · 00–06 UTC",
  open: "Crypto Update · 06–12 UTC",
  midday: "Crypto Update · 12–18 UTC",
  close: "Crypto Update · 18–24 UTC",
};

export function windowLabel(w: SummaryWindow, assetClass: AssetClass): string {
  return (assetClass === "crypto" ? CRYPTO_WINDOW_LABELS : STOCK_WINDOW_LABELS)[w];
}

function getDateStr(assetClass: AssetClass): string {
  return new Date().toLocaleDateString("en-CA", {
    timeZone: assetClass === "crypto" ? "UTC" : "America/New_York",
  });
}

export function getCurrentWindow(assetClass: AssetClass): SummaryWindow {
  if (assetClass === "crypto") {
    // Four fixed 6-hour UTC buckets (24/7 market, no open/close).
    const h =
      Number(
        new Date().toLocaleTimeString("en-US", {
          timeZone: "UTC",
          hour12: false,
          hour: "2-digit",
        }),
      ) % 24;
    if (h < 6) return "overnight"; // 00:00–05:59 UTC
    if (h < 12) return "open"; // 06:00–11:59 UTC
    if (h < 18) return "midday"; // 12:00–17:59 UTC
    return "close"; // 18:00–23:59 UTC
  }
  const t = new Date().toLocaleTimeString("en-US", {
    timeZone: "America/New_York",
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
  });
  const [h, m] = t.split(":").map(Number);
  const mins = h * 60 + m;
  if (mins < 9 * 60 + 30) return "overnight"; // 00:00–09:29
  if (mins < 12 * 60) return "open"; // 09:30–11:59
  if (mins < 16 * 60 + 30) return "midday"; // 12:00–16:29
  return "close"; // 16:30–23:59
}

function readCache(assetClass: AssetClass): MarketSummaryCache | null {
  try {
    const raw = localStorage.getItem(lsKey(assetClass));
    return raw ? (JSON.parse(raw) as MarketSummaryCache) : null;
  } catch {
    return null;
  }
}

export function writeMarketSummaryCache(
  assetClass: AssetClass,
  c: MarketSummaryCache,
): void {
  try {
    localStorage.setItem(lsKey(assetClass), JSON.stringify(c));
  } catch {
    // localStorage full or unavailable — fail silently
  }
}

export function readMarketSummaryCache(
  assetClass: AssetClass,
): MarketSummaryCache | null {
  return readCache(assetClass);
}

function buildStockPrompt(w: SummaryWindow, watchlistSymbols: string[]): string {
  const ctx: Record<SummaryWindow, string> = {
    overnight: "overnight",
    open: "market open",
    midday: "midday",
    close: "end-of-day",
  };
  const windowAngle: Record<SummaryWindow, string> = {
    overnight: " Lean into any notable after-hours moves.",
    open: " Note how the portfolio is positioned heading into the session.",
    midday: "",
    close: " Give a sense of how the portfolio finished the day.",
  };
  const wl =
    watchlistSymbols.length > 0
      ? ` Pull a price and day-change snapshot for the watchlist: ${watchlistSymbols.slice(0, 8).join(", ")}.`
      : "";
  return (
    `Write a 150–200 word ${ctx[w]} market briefing in the voice of a trading desk note — one continuous paragraph, no section labels or lists.` +
    ` Use these tools to gather the data: get_positions for current holdings and day % change;` +
    ` get_orders with status=closed and limit=50 for anything sold today that is no longer held;` +
    ` get_news without a symbol for a real headline (do NOT use get_movers).` +
    wl +
    ` Blend holdings, recent trades, watchlist moves, and the headline into a single flowing narrative — do not narrate the tool calls.` +
    ` If the portfolio is empty and there are no recent trades, skip the holdings section and focus on the market overview.` +
    windowAngle[w]
  );
}

function buildCryptoPrompt(w: SummaryWindow, watchlistSymbols: string[]): string {
  const ctx: Record<SummaryWindow, string> = {
    overnight: "overnight crypto",
    open: "morning crypto",
    midday: "midday crypto",
    close: "evening crypto",
  };
  const wl =
    watchlistSymbols.length > 0
      ? ` Pull a price and 24h-change snapshot for the watchlist: ${watchlistSymbols.slice(0, 8).join(", ")}.`
      : "";
  return (
    `Write a 150–200 word ${ctx[w]} market briefing in the voice of a trading desk note — one continuous paragraph, no section labels or lists.` +
    ` Use these tools to gather the data: get_positions for current crypto holdings and 24h % change;` +
    ` get_orders with status=closed and limit=50 for any pairs sold recently that are no longer held;` +
    ` get_news with symbol BTC for a real crypto headline (do NOT call get_movers — Alpaca has no crypto screener).` +
    wl +
    ` Blend holdings, recent trades, watchlist moves, and the headline into a single flowing narrative — do not narrate the tool calls.` +
    ` If the portfolio is empty and there are no recent trades, skip the holdings section and focus on the market overview.`
  );
}

function buildPrompt(
  w: SummaryWindow,
  watchlistSymbols: string[],
  assetClass: AssetClass,
): string {
  return assetClass === "crypto"
    ? buildCryptoPrompt(w, watchlistSymbols)
    : buildStockPrompt(w, watchlistSymbols);
}

export function useMarketSummary(
  watchlistSymbols: string[],
  assetClass: AssetClass = "stocks",
) {
  const [cache, setCache] = useState<MarketSummaryCache | null>(() =>
    readCache(assetClass),
  );
  const [isGenerating, setIsGenerating] = useState(false);
  const generatingRef = useRef(false);

  const currentWindow = getCurrentWindow(assetClass);
  const currentDate = getDateStr(assetClass);

  const isCurrent =
    cache !== null &&
    cache.window === currentWindow &&
    cache.dateStr === currentDate;

  // Stringify to get a stable dep without requiring memo in the caller.
  const wlKey = watchlistSymbols.join(",");

  useEffect(() => {
    // Re-read on silo switch so we show that silo's cache, not the prior one.
    setCache(readCache(assetClass));
  }, [assetClass]);

  useEffect(() => {
    if (isCurrent || generatingRef.current) return;
    generatingRef.current = true;
    setIsGenerating(true);

    postAiAsk(buildPrompt(currentWindow, watchlistSymbols, assetClass), [], assetClass)
      .then((res) => {
        const next: MarketSummaryCache = {
          window: currentWindow,
          dateStr: currentDate,
          content: res.text,
          generatedAt: Date.now(),
          dismissed: false,
        };
        writeMarketSummaryCache(assetClass, next);
        setCache(next);
      })
      .catch(() => {
        // Auto-generation failure — silent; user not disturbed
      })
      .finally(() => {
        setIsGenerating(false);
        generatingRef.current = false;
      });
    // wlKey is the stable representation of watchlistSymbols
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCurrent, currentWindow, currentDate, wlKey, assetClass]);

  function dismiss() {
    if (!cache) return;
    const updated = { ...cache, dismissed: true };
    writeMarketSummaryCache(assetClass, updated);
    setCache(updated);
  }

  return {
    cache,
    isGenerating,
    dismiss,
    windowLabel: windowLabel(currentWindow, assetClass),
    currentWindow,
  };
}
