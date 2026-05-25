/**
 * TVPlatform — mounts the TradingView Charting Library terminal inside our
 * Calm chrome. TV provides the chart canvas + drawing toolbar + clickable
 * price lines; every piece of trading chrome (account context, blotter,
 * order entry) is ours and matches the other modes.
 */

import { useCallback, useEffect, useRef } from "react";

import { useTheme } from "../hooks/useTheme";
import { useMobile } from "../hooks/useMobile";
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
  assetClass?: "stocks" | "crypto";
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
  // No Volume study by default — user adds it via the Indicator
  // popover if they want it.
  "create_volume_indicator_by_default",
];

// TV's symbol string can include an exchange prefix ("NASDAQ:AAPL");
// the rest of the app (TradeBar, useLiveQuotes, /api/snapshots, …) uses
// bare tickers, so strip the prefix when propagating up.
function normalizeSymbol(raw: string): string {
  if (!raw) return raw;
  const tail = raw.includes(":") ? raw.split(":").pop()! : raw;
  return tail.toUpperCase();
}

export default function TVPlatform({ symbol, onSymbolChange, assetClass }: Props) {
  const selectSym = (s: string) => onSymbolChange?.(s);
  const isMobile = useMobile();
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetRef = useRef<TVWidgetInstance | null>(null);
  const readyRef = useRef(false);
  const { theme } = useTheme();
  // Latest theme for the async onChartReady path (a toggle can land while
  // the widget is still loading).
  const themeRef = useRef(theme);
  useEffect(() => {
    themeRef.current = theme;
  }, [theme]);

  // Re-skin the live widget in place. changeTheme applies TV's standard
  // palette, so re-assert our custom pane background afterwards.
  const applyTheme = useCallback((t: "light" | "dark") => {
    const w = widgetRef.current;
    if (!w) return;
    w.changeTheme(t, { disableUndo: true })
      .then(() => {
        w.applyOverrides({
          "paneProperties.background": t === "dark" ? "#0a0c10" : "#ffffff",
          "paneProperties.backgroundType": "solid",
        });
      })
      .catch(() => {
        /* widget tearing down */
      });
  }, []);

  // The widget effect runs once on mount; its closure captures the
  // initial `onSymbolChange`. App.tsx's setSelected is stable but the
  // `selectSym` wrapper here isn't — route the inside-TV subscription
  // through a ref so it always calls the latest callback.
  const onSymbolChangeRef = useRef(onSymbolChange);
  useEffect(() => {
    onSymbolChangeRef.current = onSymbolChange;
  }, [onSymbolChange]);

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

        theme: themeRef.current === "dark" ? "Dark" : "Light",
        custom_css_url: new URL(`${import.meta.env.BASE_URL}tv-themed.css`, window.location.href).href,
        overrides: {
          "paneProperties.background":
            themeRef.current === "dark" ? "#0a0c10" : "#ffffff",
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
        readyRef.current = true;
        // Cover a theme toggle that happened during the async load.
        applyTheme(themeRef.current);
        recreateDrawingsForChart();
        try {
          const sub = widget.activeChart().onSymbolChanged();
          sub.subscribe(null, () => {
            clearEntityIds();
            recreateDrawingsForChart();
            // Propagate symbol changes initiated inside TV (the symbol
            // search dialog, compare picker, watchlist clicks in TV's
            // own UI, etc.) back up to App.tsx so the surrounding
            // chrome — ChartTopBar header, TradeBar, ChartBot — all
            // follow the active chart.
            try {
              const next = normalizeSymbol(widget.activeChart().symbol());
              if (next) onSymbolChangeRef.current?.(next);
            } catch {
              /* widget tearing down */
            }
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
      readyRef.current = false;
      brokerRef?.disconnect();
      setTVWidget(null);
      clearEntityIds();
      widgetRef.current?.remove();
      widgetRef.current = null;
    };
    // Build the widget once; theme changes are applied in place via
    // changeTheme (see the effect below) rather than remounting.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-skin in place on theme toggle once the chart is ready.
  useEffect(() => {
    if (readyRef.current) applyTheme(theme);
  }, [theme, applyTheme]);

  // Push external symbol changes (Ask anything Open-in-workspace) into the
  // running widget. Bail out when the widget is already on this symbol
  // so an in-TV change that flows out to App.tsx → back into this prop
  // doesn't trigger another setSymbol (which would refire
  // onSymbolChanged and rebuild the drawings list pointlessly).
  useEffect(() => {
    if (!widgetRef.current || !symbol) return;
    try {
      const current = normalizeSymbol(
        widgetRef.current.activeChart().symbol(),
      );
      if (current === normalizeSymbol(symbol)) return;
      widgetRef.current.activeChart().setSymbol(symbol);
    } catch {
      /* widget not ready */
    }
  }, [symbol]);

  return (
    <div className="flex flex-col gap-2" style={{ width: "100%" }}>
      <ChartTopBar
        symbol={symbol || "AAPL"}
        onSelectSymbol={selectSym}
        assetClass={assetClass}
      />
      <IndicatorPillsRow />
      <div
        ref={containerRef}
        className="border border-border"
        style={{
          width: "100%",
          height: isMobile
            ? "calc(100dvh - var(--mob-chrome-top) - var(--mob-chrome-top-2) - 140px)"
            : "calc(100vh - 360px)",
          minHeight: isMobile ? 320 : 360,
          borderRadius: "var(--r-lg)",
          overflow: "hidden",
        }}
      />
      <ChartBlotter onSymbolSelect={(s) => selectSym(s)} assetClass={assetClass} />
      <TradeBar symbol={symbol || "AAPL"} />
    </div>
  );
}
