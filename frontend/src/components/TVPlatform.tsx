/**
 * TVPlatform — mounts the TradingView Charting Library terminal inside our
 * Calm chrome. TV's own top header is hidden via disabled_features; we
 * render ChartTopBar + IndicatorPillsRow above the chart. The left
 * drawing toolbar stays TV-native, retuned via custom_css_url to match
 * our palette.
 */

import { useEffect, useRef, useState } from "react";

import { useTheme } from "../hooks/useTheme";
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
import ChartTopBar from "./chart/ChartTopBar";
import IndicatorPillsRow from "./chart/IndicatorPillsRow";

declare const TradingView: {
  widget: new (config: Record<string, unknown>) => TVWidgetInstance;
};

interface Props {
  symbol: string;
}

// Header items TV would otherwise render — we replace each with our own
// ChartTopBar button so the chrome reads as a single, consistent toolbar.
const DISABLED_HEADER_FEATURES = [
  "header_widget",
  "header_resolutions",
  "header_chart_type",
  "header_indicators",
  "header_compare",
  "header_settings",
  "header_screenshot",
  "header_fullscreen_button",
  "header_undo_redo",
  "header_symbol_search",
  "use_localstorage_for_settings",
];

export default function TVPlatform({ symbol }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetRef = useRef<TVWidgetInstance | null>(null);
  const { theme } = useTheme();
  // The widget can't re-theme on the fly in this build, so we remount it
  // when the user toggles themes. `themeKey` is the dependency.
  const [themeKey, setThemeKey] = useState(theme);
  useEffect(() => setThemeKey(theme), [theme]);

  useEffect(() => {
    if (!containerRef.current) return;

    let destroyed = false;
    let brokerRef: ReturnType<typeof createBroker> | null = null;

    function init() {
      if (destroyed) return;
      if (
        typeof TradingView === "undefined" ||
        typeof TradingView.widget !== "function"
      ) {
        setTimeout(init, 100);
        return;
      }
      if (!containerRef.current) return;

      const widget = new TradingView.widget({
        container: containerRef.current,
        library_path: `${import.meta.env.BASE_URL}charting_library/`,

        symbol: symbol || "AAPL",
        interval: "D",
        locale: "en",
        timezone: "America/New_York",

        theme: themeKey === "dark" ? "Dark" : "Light",
        custom_css_url: `${import.meta.env.BASE_URL}tv-themed.css`,
        overrides: {
          "paneProperties.background":
            themeKey === "dark" ? "#0a0c10" : "#ffffff",
          "paneProperties.backgroundType": "solid",
        },

        datafeed: createDatafeed(),

        broker_factory: (host: Parameters<typeof createBroker>[0]) => {
          brokerRef = createBroker(host, () => {});
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

        enabled_features: ["side_toolbar_in_fullscreen_mode"],
        disabled_features: DISABLED_HEADER_FEATURES,

        autosize: true,
        fullscreen: false,
      });

      widget.onChartReady(() => {
        brokerRef?.connect();
        setTVWidget(widget);
        recreateDrawingsForChart();
        try {
          const sub = widget.activeChart().onSymbolChanged();
          sub.subscribe(null, () => {
            clearEntityIds();
            recreateDrawingsForChart();
          });
        } catch {
          // older builds
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
    // Re-mount on theme switch — `changeTheme` is unavailable on this
    // bundled TV build, so the cleanest re-skin is a full remount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [themeKey]);

  // Push external symbol changes (watchlist / cmd-bar Open-in-workspace)
  // into the running widget.
  useEffect(() => {
    if (!widgetRef.current || !symbol) return;
    try {
      widgetRef.current.activeChart().setSymbol(symbol);
    } catch {
      /* widget not ready */
    }
  }, [symbol]);

  return (
    <div className="flex flex-col gap-2" style={{ width: "100%" }}>
      <ChartTopBar symbol={symbol || "AAPL"} />
      <IndicatorPillsRow />
      <div
        ref={containerRef}
        style={{
          width: "100%",
          height: "calc(100vh - 200px)",
          minHeight: 400,
          borderRadius: "var(--r-lg)",
          overflow: "hidden",
          border: "1px solid var(--border)",
        }}
      />
    </div>
  );
}
