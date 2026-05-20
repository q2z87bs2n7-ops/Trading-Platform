/**
 * Module-level singleton for the TradingView widget instance.
 *
 * Only one widget can exist at a time in TV mode; React context buys
 * nothing here. TVPlatform.tsx calls setTVWidget(widget) inside its
 * onChartReady callback and setTVWidget(null) on cleanup. Drawing
 * wrappers in tv-drawings.ts and the AI chat panel both read via
 * getTVWidget() and bail with a clear error when null.
 *
 * The TVWidgetInstance / TVChartApi types here are a minimal slice of
 * the real IChartingLibraryWidget surface (full types live in
 * /public/charting_library/charting_library.d.ts but aren't on the
 * tsconfig include path). Widen as we need more methods.
 */

export interface TVShapePoint {
  time: number;
  price?: number;
}

export interface TVSubscription {
  subscribe: (obj: unknown, cb: () => void) => void;
  unsubscribe: (obj: unknown, cb: () => void) => void;
}

export interface TVChartApi {
  setSymbol: (symbol: string) => void;
  symbol: () => string;
  resolution: () => string;
  onSymbolChanged: () => TVSubscription;
  createShape: (
    point: TVShapePoint,
    options: Record<string, unknown>,
  ) => Promise<string>;
  createMultipointShape: (
    points: TVShapePoint[],
    options: Record<string, unknown>,
  ) => Promise<string>;
  createStudy: (
    name: string,
    forceOverlay?: boolean,
    lock?: boolean,
    inputs?: Record<string, unknown>,
  ) => Promise<string | null>;
  removeEntity: (id: string) => void;
}

export interface TVWidgetInstance {
  onChartReady: (cb: () => void) => void;
  remove: () => void;
  activeChart: () => TVChartApi;
}

type Listener = (w: TVWidgetInstance | null) => void;

let widget: TVWidgetInstance | null = null;
const listeners = new Set<Listener>();

export function setTVWidget(w: TVWidgetInstance | null): void {
  widget = w;
  listeners.forEach((l) => l(w));
}

export function getTVWidget(): TVWidgetInstance | null {
  return widget;
}

export function subscribeTVWidget(l: Listener): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}
