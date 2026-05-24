/**
 * TVChartWidget — the bare TradingView Charting Library widget for the
 * Workspace canvas: TV's own native header / toolbars / settings, our datafeed,
 * theme sync, and two-way symbol sync. Deliberately none of the TVPlatform
 * chrome (ChartTopBar / IndicatorPillsRow / ChartBlotter / TradeBar / broker),
 * and it does NOT register the global TV handle (that singleton belongs to
 * Chart-mode's ChartBot) so multiple chart panels stay independent.
 */

import { useEffect, useRef } from "react";

import { useTheme } from "../hooks/useTheme";
import { createDatafeed } from "../lib/tv-datafeed";
import type { TVWidgetInstance } from "../lib/tv-widget-handle";

declare const TradingView: {
  widget: new (config: Record<string, unknown>) => TVWidgetInstance;
};

interface Props {
  symbol: string;
  onSymbolChange?: (s: string) => void;
}

function normalizeSymbol(raw: string): string {
  if (!raw) return raw;
  const tail = raw.includes(":") ? raw.split(":").pop()! : raw;
  return tail.toUpperCase();
}

export default function TVChartWidget({ symbol, onSymbolChange }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetRef = useRef<TVWidgetInstance | null>(null);
  const readyRef = useRef(false);
  const { theme } = useTheme();

  // Latest theme for the async onChartReady path (a toggle can land while the
  // widget is still loading).
  const themeRef = useRef(theme);
  useEffect(() => {
    themeRef.current = theme;
  }, [theme]);

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

        autosize: true,
        fullscreen: false,
      });

      widget.onChartReady(() => {
        readyRef.current = true;
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

  // Re-skin in place on theme toggle once the chart is ready.
  useEffect(() => {
    const w = widgetRef.current;
    if (!w || !readyRef.current) return;
    w.changeTheme(theme, { disableUndo: true })
      .then(() => {
        w.applyOverrides({
          "paneProperties.background": theme === "dark" ? "#0a0c10" : "#ffffff",
          "paneProperties.backgroundType": "solid",
        });
      })
      .catch(() => {
        /* widget tearing down */
      });
  }, [theme]);

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
