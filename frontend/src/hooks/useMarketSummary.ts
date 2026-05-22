import { useEffect, useRef, useState } from "react";

import { streamAiAsk } from "../api";

export type SummaryWindow = "overnight" | "open" | "midday" | "close";

export interface MarketSummaryCache {
  window: SummaryWindow;
  dateStr: string; // YYYY-MM-DD in EST — detects day rollover
  content: string;
  generatedAt: number;
  dismissed: boolean;
}

const LS_KEY = "market_summary_v1";

export const WINDOW_LABELS: Record<SummaryWindow, string> = {
  overnight: "Overnight Report",
  open: "Market Open Report",
  midday: "Midday Report",
  close: "Market Close Report",
};

function getEstDateStr(): string {
  return new Date().toLocaleDateString("en-CA", {
    timeZone: "America/New_York",
  });
}

export function getCurrentWindow(): SummaryWindow {
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

function readCache(): MarketSummaryCache | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? (JSON.parse(raw) as MarketSummaryCache) : null;
  } catch {
    return null;
  }
}

export function writeMarketSummaryCache(c: MarketSummaryCache): void {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(c));
  } catch {
    // localStorage full or unavailable — fail silently
  }
}

export function readMarketSummaryCache(): MarketSummaryCache | null {
  return readCache();
}

const WINDOW_EXTRA: Record<SummaryWindow, string> = {
  overnight:
    " Include any notable after-hours price movements for holdings.",
  open: " Note how the portfolio is positioned heading into today's session.",
  midday: "",
  close: " Summarise how the portfolio finished the day overall.",
};

function buildPrompt(w: SummaryWindow, watchlistSymbols: string[]): string {
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
    WINDOW_EXTRA[w] +
    ` Keep the entire response to 150–200 words. Write in plain prose, no markdown headers.`
  );
}

export function useMarketSummary(watchlistSymbols: string[]) {
  const [cache, setCache] = useState<MarketSummaryCache | null>(readCache);
  const [isGenerating, setIsGenerating] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const generatingRef = useRef(false);

  const currentWindow = getCurrentWindow();
  const currentDate = getEstDateStr();

  const isCurrent =
    cache !== null &&
    cache.window === currentWindow &&
    cache.dateStr === currentDate;

  // Stringify to get a stable dep without requiring memo in the caller.
  const wlKey = watchlistSymbols.join(",");

  useEffect(() => {
    if (isCurrent || generatingRef.current) return;
    generatingRef.current = true;
    setIsGenerating(true);
    setStreamingContent("");

    const controller = new AbortController();
    let accText = "";

    (async () => {
      try {
        for await (const event of streamAiAsk(
          buildPrompt(currentWindow, watchlistSymbols),
          [],
          controller.signal,
        )) {
          if (event.type === "text") {
            accText += event.delta;
            setStreamingContent(accText);
          } else if (event.type === "done") {
            const next: MarketSummaryCache = {
              window: currentWindow,
              dateStr: currentDate,
              content: accText,
              generatedAt: Date.now(),
              dismissed: false,
            };
            writeMarketSummaryCache(next);
            setCache(next);
            setStreamingContent("");
          }
        }
      } catch {
        // Auto-generation failure — silent; user not disturbed
      } finally {
        setIsGenerating(false);
        generatingRef.current = false;
      }
    })();

    return () => controller.abort();
    // wlKey is the stable representation of watchlistSymbols
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCurrent, currentWindow, currentDate, wlKey]);

  function dismiss() {
    if (!cache) return;
    const updated = { ...cache, dismissed: true };
    writeMarketSummaryCache(updated);
    setCache(updated);
  }

  return {
    cache,
    isGenerating,
    streamingContent,
    dismiss,
    windowLabel: WINDOW_LABELS[currentWindow],
    currentWindow,
  };
}
