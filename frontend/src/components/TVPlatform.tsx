/**
 * TVPlatform — mounts the TradingView Charting Library terminal. TV's
 * native header and Account Manager provide the chart chrome and the
 * positions / orders / account blotter; trade entry stays on our
 * TradeBar + OrderSheet so crypto constraints and the confirm flow are
 * enforced.
 */

import { useCallback, useEffect, useRef } from "react";

import { useTheme } from "../hooks/useTheme";
import { useMobile } from "../hooks/useMobile";
import { useFxcmView } from "../lib/fxcm-view";
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
import TradeBar from "./trade/TradeBar";

declare const TradingView: {
  widget: new (config: Record<string, unknown>) => TVWidgetInstance;
};

interface Props {
  symbol: string;
  onSymbolChange?: (s: string) => void;
  // Drives TV's symbol-search results to the active silo only — without it,
  // searching "BTC" in stocks mode surfaces crypto pairs and vice versa.
  assetClass?: "stocks" | "crypto" | "cfd";
}

// We lean on TV's native header (symbol search, resolutions, chart type,
// indicators, settings, …) and native Account Manager (positions /
// orders / account blotter — enabled but collapsed by default). Only TV's
// trade-*initiation* UI stays suppressed: trade entry runs through our
// TradeBar + OrderSheet so the crypto constraints and confirm flow are
// enforced. The broker stays wired, so price-line overlays draw and the
// Account Manager can close positions.
const DISABLED_FEATURES = [
  "use_localstorage_for_settings",
  // Save/Load chart button: no charts-storage backend is configured, so
  // the native button would be a dead end — leave it suppressed.
  "header_saveload",
  // Account Manager stays available (trading_account_manager is on) but
  // starts collapsed — disabling open_account_manager keeps it from
  // auto-expanding; the user opens it from its bottom toggle bar.
  "open_account_manager",
  // TV-native order-entry UI — superseded by TradeBar + OrderSheet.
  "order_panel",
  "show_order_panel_on_start",
  "buy_sell_buttons",
  "broker_button",
  "trading_notifications",
  "show_trading_notifications_history",
  // Right widgetbar (object tree / data window): starts collapsed; the
  // toolbar button stays available for users who want it.
  "show_right_widgets_panel_by_default",
  // No Volume study by default — user adds it from the native header.
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
  const isMobile = useMobile();
  // CFD silo: keep the charted instrument subscribed so its FXCM bars/quotes
  // stream (only subscribed instruments are priced).
  useFxcmView(symbol, assetClass === "cfd");
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

  // Ref so the datafeed's symbol-search closure always sees the live silo,
  // without recreating the widget when the user toggles stocks/crypto.
  const assetClassRef = useRef(assetClass);
  useEffect(() => {
    assetClassRef.current = assetClass;
  }, [assetClass]);

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

        datafeed: createDatafeed({
          getAssetClass: () => assetClassRef.current ?? "",
          getSearchAssetClass: () =>
            assetClassRef.current === "crypto"
              ? "crypto"
              : assetClassRef.current === "stocks"
                ? "us_equity"
                : "",
        }),

        broker_factory: (host: Parameters<typeof createBroker>[0]) => {
          brokerRef = createBroker(host, () => {}, () => assetClassRef.current ?? "");
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
            // Propagate symbol changes initiated inside TV (the native
            // symbol search dialog, compare picker, watchlist clicks in
            // TV's own UI, etc.) back up to App.tsx so the surrounding
            // chrome — TradeBar, ChartBot — follows the active chart.
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
    <div
      className="flex flex-col gap-2"
      style={
        isMobile
          ? { width: "100%" }
          : { width: "100%", flex: 1, minHeight: 0 }
      }
    >
      <div
        ref={containerRef}
        className="border border-border"
        style={{
          width: "100%",
          ...(isMobile
            ? {
                height:
                  "calc(100dvh - var(--mob-chrome-top) - var(--mob-chrome-top-2) - 96px)",
                minHeight: 320,
              }
            : { flex: 1, minHeight: 360 }),
          borderRadius: "var(--r-lg)",
          overflow: "hidden",
        }}
      />
      {assetClass !== "cfd" && <TradeBar symbol={symbol || "AAPL"} />}
    </div>
  );
}
