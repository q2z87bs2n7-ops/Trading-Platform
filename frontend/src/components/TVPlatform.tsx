/**
 * TVPlatform — mounts the full TradingView Charting Library terminal.
 * Shown when the user selects "TradingView" mode from the header toggle.
 * The existing custom UI is unchanged and shown when toggled back.
 */

import { useEffect, useRef } from "react";
import { createDatafeed } from "../lib/tv-datafeed";
import { createBroker } from "../lib/tv-broker";

// TradingView widget is injected by charting_library.standalone.js in index.html
interface TVWidgetInstance {
  onChartReady: (cb: () => void) => void;
  remove: () => void;
  activeChart: () => { setSymbol: (s: string) => void };
}
declare const TradingView: {
  widget: new (config: Record<string, unknown>) => TVWidgetInstance;
};

interface Props {
  symbol: string;
}

export default function TVPlatform({ symbol }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetRef = useRef<TVWidgetInstance | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    if (typeof TradingView === "undefined") {
      console.error("[TV] charting_library.standalone.js not loaded");
      return;
    }

    const broker = createBroker(() => {
      // onUpdate callback — TV will call positions()/orders() again on next poll
    });

    const widget = new TradingView.widget({
      // Container
      container: containerRef.current,
      library_path: `${import.meta.env.BASE_URL}charting_library/`,

      // Symbol + interval
      symbol: symbol || "AAPL",
      interval: "D",
      locale: "en",
      timezone: "America/New_York",

      // Theme — dark to match existing app
      theme: "Dark",
      custom_css_url: "",
      overrides: {
        "paneProperties.background": "#0d1117",
        "paneProperties.backgroundType": "solid",
      },

      // Data
      datafeed: createDatafeed(),

      // Trading panel wired to our broker
      broker_factory: () => broker,
      broker_config: {
        configFlags: {
          supportOrderBrackets: false,
          supportEditAmount: true,
          supportClosePosition: true,
          supportPositions: true,
        },
      },

      // Features
      enabled_features: [
        "use_localstorage_for_settings",
        "side_toolbar_in_fullscreen_mode",
      ],
      disabled_features: [
        "header_symbol_search",   // we drive symbol from our watchlist
        "header_compare",
      ],

      // Sizing — fill the container
      autosize: true,
      fullscreen: false,
    });

    widget.onChartReady(() => {
      broker.connect();
    });

    widgetRef.current = widget;

    return () => {
      broker.disconnect();
      widgetRef.current?.remove();
      widgetRef.current = null;
    };
  }, []); // mount once

  // When the symbol changes externally (watchlist click), tell TV to switch
  useEffect(() => {
    if (!widgetRef.current || !symbol) return;
    // TV widget exposes activeChart() after onChartReady; safe to call after mount
    try {
      widgetRef.current.activeChart().setSymbol(symbol);
    } catch {
      // widget not ready yet — symbol passed as default above, ignore
    }
  }, [symbol]);

  return (
    <div
      ref={containerRef}
      style={{ width: "100%", height: "calc(100vh - 60px)" }}
    />
  );
}
