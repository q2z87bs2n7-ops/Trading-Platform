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
import ChartWatchlist from "./chart/ChartWatchlist";
import OrderTicketRail from "./chart/OrderTicketRail";
import ChartBlotter from "./chart/ChartBlotter";
import TradeBar from "./trade/TradeBar";

declare const TradingView: {
  widget: new (config: Record<string, unknown>) => TVWidgetInstance;
};

interface Props {
  symbol: string;
  onSymbolChange?: (s: string) => void;
}

// Header items TV would otherwise render — we replace each with our own
// ChartTopBar button so the chrome reads as a single, consistent toolbar.
// We also disable TV's native Account Manager / Order Panel / on-chart
// trading notifications: the broker stays wired so price-line clicks
// open *our* OrderTicketRail (lg+) or the TradeBar OrderSheet (below lg),
// and trade activity surfaces in our toast system + ChartBlotter. Right
// widgetbar (object tree, data window) starts collapsed but its button
// stays visible.
const DISABLED_HEADER_FEATURES = [
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
  // TV-native trading UI — we render our own end-to-end.
  "trading_account_manager",
  "open_account_manager",
  "order_panel",
  "show_order_panel_on_start",
  "trading_notifications",
  "show_trading_notifications_history",
  // Right widgetbar starts collapsed (object tree, data window).
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

  // Watchlist drawer state — only used below xl (inline rail above xl).
  const [watchlistOpen, setWatchlistOpen] = useState(false);
  // ESC closes the drawer.
  useEffect(() => {
    if (!watchlistOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setWatchlistOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [watchlistOpen]);

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
      <ChartTopBar
        symbol={symbol || "AAPL"}
        onWatchlistOpen={() => setWatchlistOpen(true)}
      />
      <IndicatorPillsRow />
      <div
        className="flex flex-col xl:flex-row gap-2"
        style={{ width: "100%" }}
      >
        {/* Inline watchlist — xl+ only. Below xl it lives in the drawer. */}
        <div className="hidden xl:block" style={{ width: 180, minWidth: 180 }}>
          <ChartWatchlist
            selected={symbol}
            onSelect={(s) => selectSym(s)}
          />
        </div>
        <div
          ref={containerRef}
          className="border border-border"
          style={{
            flex: 1,
            minWidth: 0,
            height: "calc(100vh - 360px)",
            minHeight: 360,
            borderRadius: "var(--r-lg)",
            overflow: "hidden",
          }}
        />
        {/* Inline order ticket — lg+ only. Below lg the TradeBar below
           takes over (same surface Discover + Portfolio use). */}
        <div className="hidden lg:block">
          <OrderTicketRail symbol={symbol || "AAPL"} />
        </div>
      </div>
      <ChartBlotter onSymbolSelect={(s) => selectSym(s)} />

      {/* Mobile / tablet trade surface — same TradeBar + OrderSheet the
         other modes use. Hidden at lg+ where the inline rail is shown. */}
      <div className="lg:hidden">
        <TradeBar symbol={symbol || "AAPL"} />
      </div>

      {/* Watchlist drawer — visible below xl when the toolbar button is
         tapped. ESC + backdrop click + selecting a symbol all close it. */}
      {watchlistOpen && (
        <div
          role="dialog"
          aria-modal
          className="xl:hidden fixed inset-0 z-40"
          style={{
            background: "rgba(20, 22, 28, 0.45)",
            backdropFilter: "blur(4px)",
          }}
          onClick={() => setWatchlistOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="h-full flex flex-col"
            style={{
              width: "min(280px, 90vw)",
              animation: "wl-in 180ms ease",
            }}
          >
            <style>{`@keyframes wl-in{from{transform:translateX(-20px);opacity:0}to{transform:translateX(0);opacity:1}}`}</style>
            <div
              className="flex items-center justify-between px-3 py-2"
              style={{
                background: "var(--panel)",
                borderBottom: "1px solid var(--hairline)",
              }}
            >
              <span
                className="text-[12px] uppercase font-semibold"
                style={{ color: "var(--mute)", letterSpacing: "0.04em" }}
              >
                Watchlist
              </span>
              <button
                type="button"
                onClick={() => setWatchlistOpen(false)}
                aria-label="Close watchlist"
                className="cursor-pointer border-0 text-[13px] grid place-items-center"
                style={{
                  background: "var(--panel-2)",
                  color: "var(--text-2)",
                  width: 26,
                  height: 26,
                  borderRadius: 6,
                }}
              >
                ✕
              </button>
            </div>
            <div className="flex-1 min-h-0">
              <ChartWatchlist
                selected={symbol}
                onSelect={(s) => {
                  selectSym(s);
                  setWatchlistOpen(false);
                }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
