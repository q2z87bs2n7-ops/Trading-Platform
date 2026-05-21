/**
 * TVPlatform — mounts the TradingView Charting Library terminal inside our
 * Calm chrome. TV provides the chart canvas + drawing toolbar + clickable
 * price lines; every piece of trading chrome (account context, blotter,
 * order entry) is ours and matches the other modes.
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
import ChartBlotter from "./chart/ChartBlotter";
import TradeBar from "./trade/TradeBar";

declare const TradingView: {
  widget: new (config: Record<string, unknown>) => TVWidgetInstance;
};

interface Props {
  symbol: string;
  onSymbolChange?: (s: string) => void;
}

// Features we suppress so the platform reads as a single Calm-native
// experience around TV's canvas:
// - Header items: replaced by our ChartTopBar.
// - TV trading UI (Account Manager, Order Panel, buy/sell legend
//   buttons, broker-button, on-chart notifications): we render all
//   trade entry through TradeBar + OrderSheet, and account / blotter
//   info through our TopBar + ChartBlotter. The broker stays wired so
//   TV's price-line overlays still draw — only TV's trade-initiation
//   UI is removed.
// - Right widgetbar (object tree / data window): starts collapsed; the
//   toolbar button stays available for users who want it.
const DISABLED_FEATURES = [
  // Header
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
  // TV-native trading UI
  "trading_account_manager",
  "open_account_manager",
  "order_panel",
  "show_order_panel_on_start",
  "trading_notifications",
  "show_trading_notifications_history",
  "buy_sell_buttons",
  "broker_button",
  // Right widgetbar
  "show_right_widgets_panel_by_default",
];

export default function TVPlatform({ symbol, onSymbolChange }: Props) {
  const selectSym = (s: string) => onSymbolChange?.(s);
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
        disabled_features: DISABLED_FEATURES,

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

  // Push external symbol changes (cmd-bar Open-in-workspace) into the
  // running widget.
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
        className="border border-border"
        style={{
          width: "100%",
          height: "calc(100vh - 360px)",
          minHeight: 360,
          borderRadius: "var(--r-lg)",
          overflow: "hidden",
        }}
      />
      <ChartBlotter onSymbolSelect={(s) => selectSym(s)} />
      <TradeBar symbol={symbol || "AAPL"} />
    </div>
  );
}
