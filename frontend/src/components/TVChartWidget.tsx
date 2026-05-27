/**
 * TVChartWidget — the bare TradingView Charting Library widget for the
 * Workspace canvas: TV's own native header / toolbars / settings, our datafeed,
 * theme sync, and two-way symbol sync. Deliberately none of the TVPlatform
 * chrome (TradeBar / broker), and it does NOT register the global TV
 * handle (that singleton belongs to
 * Chart-mode's ChartBot) so multiple chart panels stay independent.
 */

import { useCallback, useEffect, useRef } from "react";
import type { DockviewPanelApi } from "dockview-core";

import { useTheme } from "../hooks/useTheme";
import { createDatafeed } from "../lib/tv-datafeed";
import type { TVWidgetInstance } from "../lib/tv-widget-handle";

declare const TradingView: {
  widget: new (config: Record<string, unknown>) => TVWidgetInstance;
};

interface Props {
  symbol: string;
  onSymbolChange?: (s: string) => void;
  // Dockview panel API — used to nudge TV's iframe autosize on
  // visibility/dimension changes (TV's RO misses display:none → visible
  // when the size hasn't changed, leaving the chart stuck).
  panelApi?: DockviewPanelApi;
}

function normalizeSymbol(raw: string): string {
  if (!raw) return raw;
  const tail = raw.includes(":") ? raw.split(":").pop()! : raw;
  return tail.toUpperCase();
}

// Native TV chrome stays (header, drawing toolbar), but suppress the trading
// Account Manager panel and start the right widget bar (object tree / data
// window) collapsed — the toolbar button still opens it on demand.
const DISABLED_FEATURES = [
  "trading_account_manager",
  "open_account_manager",
  "show_right_widgets_panel_by_default",
];

// Below this panel size we declutter on top of TV's own autosize: hide the
// legend (our LinkHeader already shows the symbol) and shrink the scale font.
const SMALL_W = 360;
const SMALL_H = 300;

function applyDensity(w: TVWidgetInstance, small: boolean) {
  w.applyOverrides({
    "paneProperties.legendProperties.showLegend": !small,
    "scalesProperties.fontSize": small ? 10 : 12,
  });
}

export default function TVChartWidget({ symbol, onSymbolChange, panelApi }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetRef = useRef<TVWidgetInstance | null>(null);
  const readyRef = useRef(false);
  const smallRef = useRef<boolean | null>(null);
  const { theme } = useTheme();

  // Latest theme for the async onChartReady path (a toggle can land while the
  // widget is still loading).
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

  // The widget is built once; route symbol-out through a ref so it always hits
  // the latest callback.
  const onSymbolChangeRef = useRef(onSymbolChange);
  useEffect(() => {
    onSymbolChangeRef.current = onSymbolChange;
  }, [onSymbolChange]);

  useEffect(() => {
    if (!containerRef.current) return;
    let destroyed = false;

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
        custom_css_url: new URL(
          `${import.meta.env.BASE_URL}tv-themed.css`,
          window.location.href,
        ).href,
        overrides: {
          "paneProperties.background":
            themeRef.current === "dark" ? "#0a0c10" : "#ffffff",
          "paneProperties.backgroundType": "solid",
        },

        datafeed: createDatafeed(),

        disabled_features: DISABLED_FEATURES,

        autosize: true,
        fullscreen: false,
      });

      widget.onChartReady(() => {
        readyRef.current = true;
        // With use_localstorage_for_settings on, TV can restore a previous
        // session's palette, and a theme toggle can land mid-load — both
        // leave the initial colours out of sync until a manual toggle.
        // Re-assert the current app theme now that the chart is ready.
        applyTheme(themeRef.current);
        if (smallRef.current !== null) {
          try {
            applyDensity(widget, smallRef.current);
          } catch {
            /* tearing down */
          }
        }
        try {
          const sub = widget.activeChart().onSymbolChanged();
          sub.subscribe(null, () => {
            try {
              const next = normalizeSymbol(widget.activeChart().symbol());
              if (next) onSymbolChangeRef.current?.(next);
            } catch {
              /* widget tearing down */
            }
          });
        } catch {
          /* older builds */
        }
      });

      widgetRef.current = widget;
    }

    init();

    return () => {
      destroyed = true;
      readyRef.current = false;
      widgetRef.current?.remove();
      widgetRef.current = null;
    };
    // Build once; theme + symbol changes are applied in place below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Declutter to fit the panel: hide the legend + shrink the scale font below a
  // size threshold (layers on top of TV's built-in autosize).
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => {
      const small = el.clientWidth < SMALL_W || el.clientHeight < SMALL_H;
      if (small === smallRef.current) return;
      smallRef.current = small;
      const w = widgetRef.current;
      if (w && readyRef.current) {
        try {
          applyDensity(w, small);
        } catch {
          /* widget tearing down */
        }
      }
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Dockview hides inactive panels with display:none. iframes stop laying out
  // while hidden; on re-show at the same size, TV's internal ResizeObserver
  // never fires and the chart stays stuck at the old (often collapsed) size.
  // Nudge the container by 1px on visibility/dimensions changes to force the
  // iframe autosize to re-measure.
  useEffect(() => {
    const el = containerRef.current;
    if (!el || !panelApi) return;
    const nudge = () => {
      requestAnimationFrame(() => {
        if (!containerRef.current) return;
        containerRef.current.style.height = "calc(100% - 1px)";
        requestAnimationFrame(() => {
          if (!containerRef.current) return;
          containerRef.current.style.height = "100%";
        });
      });
    };
    const d1 = panelApi.onDidVisibilityChange((e) => {
      if (e.isVisible) nudge();
    });
    const d2 = panelApi.onDidDimensionsChange(() => nudge());
    return () => {
      d1.dispose();
      d2.dispose();
    };
  }, [panelApi]);

  // Re-skin in place on theme toggle once the chart is ready.
  useEffect(() => {
    if (readyRef.current) applyTheme(theme);
  }, [theme, applyTheme]);

  // Push external symbol changes (from the linked workspace channel) into the
  // running widget; bail if it's already there to avoid a refire loop.
  useEffect(() => {
    if (!widgetRef.current || !symbol) return;
    try {
      const current = normalizeSymbol(widgetRef.current.activeChart().symbol());
      if (current === normalizeSymbol(symbol)) return;
      widgetRef.current.activeChart().setSymbol(symbol);
    } catch {
      /* widget not ready */
    }
  }, [symbol]);

  return <div ref={containerRef} style={{ width: "100%", height: "100%" }} />;
}
