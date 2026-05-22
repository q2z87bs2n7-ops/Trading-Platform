import { useEffect, useRef, useState } from "react";

import { postAiAsk } from "../api";
import type { AssetClass } from "../lib/cmd-intent";

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

// Crypto trades 24/7, so the windows are neutral UTC time-of-day buckets
// rather than US market open/close.
const CRYPTO_WINDOW_LABELS: Record<SummaryWindow, string> = {
  overnight: "Overnight Crypto Update",
  open: "Morning Crypto Update",
  midday: "Midday Crypto Update",
  close: "Evening Crypto Update",
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

const STOCK_WINDOW_EXTRA: Record<SummaryWindow, string> = {
  overnight: " Include any notable after-hours price movements for holdings.",
  open: " Note how the portfolio is positioned heading into today's session.",
  midday: "",
  close: " Summarise how the portfolio finished the day overall.",
};

function buildStockPrompt(w: SummaryWindow, watchlistSymbols: string[]): string {
  const ctx: Record<SummaryWindow, string> = {
    overnight: "overnight / after-hours market update",
    open: "market open summary",
    midday: "midday market check-in",
    close: "end-of-day market close summary",
  };
  const wl =
    watchlistSymbols.length > 0
      ? ` Also briefly note the watchlist: ${watchlistSymbols.slice(0, 8).join(", ")} — get a snapshot for each and mention price and day change.`
      : "";
  return (
    `Generate a brief ${ctx[w]}.` +
    ` Check open positions with get_positions and show each holding's current price and day % change.` +
    ` Use get_orders with status=closed and limit=50 to find any symbols sold today that are no longer in current holdings; mention those briefly.` +
    wl +
    ` For the US market overview, call get_news without a symbol to pull real market headlines — summarise the key story in one sentence, naming major companies and indices. Do NOT use get_movers for this section.` +
    STOCK_WINDOW_EXTRA[w] +
    ` Keep the entire response to 150–200 words. Write in plain prose, no markdown headers.`
  );
}

function buildCryptoPrompt(w: SummaryWindow, watchlistSymbols: string[]): string {
  const ctx: Record<SummaryWindow, string> = {
    overnight: "overnight crypto market update",
    open: "morning crypto market update",
    midday: "midday crypto market check-in",
    close: "evening crypto market wrap",
  };
  const wl =
    watchlistSymbols.length > 0
      ? ` Also briefly note the watchlist: ${watchlistSymbols.slice(0, 8).join(", ")} — get a snapshot for each and mention price and 24h change.`
      : "";
  return (
    `Generate a brief ${ctx[w]} for a crypto portfolio.` +
    ` Check open crypto positions with get_positions and show each holding's current price and 24h % change.` +
    ` Use get_orders with status=closed and limit=50 to find any crypto pairs sold recently that are no longer held; mention those briefly.` +
    wl +
    ` For market context, call get_news with symbol BTC to pull real crypto headlines — summarise the key story in one sentence. Do NOT call get_movers (Alpaca has no crypto screener).` +
    ` Keep the entire response to 150–200 words. Write in plain prose, no markdown headers.`
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
