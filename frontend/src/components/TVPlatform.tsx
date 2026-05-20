/**
 * TVPlatform — mounts the full TradingView Charting Library terminal.
 * Shown when the user selects "TradingView" mode from the header toggle.
 * The existing custom UI is unchanged and shown when toggled back.
 */

import { useEffect, useRef } from "react";
import { createDatafeed } from "../lib/tv-datafeed";
import { createBroker } from "../lib/tv-broker";
import {
  setTVWidget,
  type TVWidgetInstance,
} from "../lib/tv-widget-handle";
import {
  clearEntityIds,
  recreateDrawingsForChart,
} from "../lib/tv-drawings";

// TradingView widget is injected by charting_library.standalone.js in index.html
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

    let destroyed = false;
    let brokerRef: ReturnType<typeof createBroker> | null = null;

    // charting_library.standalone.js loads its own async chunks; poll until
    // TradingView.widget is callable (typically <200 ms on cold load).
    function init() {
      if (destroyed) return;
      if (typeof TradingView === "undefined" || typeof TradingView.widget !== "function") {
        setTimeout(init, 100);
        return;
      }
      if (!containerRef.current) return;

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

        // Trading panel wired to our broker. TV passes a host with
        // factory.createWatchedValue() that the broker needs to wire up the
        // account summary WatchedValue fields.
        broker_factory: (host: Parameters<typeof createBroker>[0]) => {
          brokerRef = createBroker(host, () => {
            // onUpdate — TV will refetch positions/orders on next poll
          });
          return brokerRef;
        },
        broker_config: {
          configFlags: {
            supportOrderBrackets: false,
            supportEditAmount: true,
            supportClosePosition: true,
            supportPositions: true,
            supportExecutions: true,
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
        brokerRef?.connect();
        setTVWidget(widget);
        // Replay any persisted AI-drawn shapes for this (symbol, resolution).
        recreateDrawingsForChart();
        // Re-replay on symbol change so swapping the chart swaps the drawings.
        try {
          const sub = widget.activeChart().onSymbolChanged();
          const handler = () => {
            clearEntityIds();
            recreateDrawingsForChart();
          };
          sub.subscribe(null, handler);
        } catch {
          // Older TV builds may not expose onSymbolChanged; non-fatal.
        }
      });

      widgetRef.current = widget;
    }

    init();

    return () => {
      destroyed = true;
      brokerRef?.disconnect();
      setTVWidget(null);
      clearEntityIds();
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
