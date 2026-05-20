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

// Minimal slice of IOrderLineAdapter / IPositionLineAdapter — we only
// use a handful of setters and the cancel/modify callbacks. Full types
// live in /public/charting_library/charting_library.d.ts.
export interface TVOrderLine {
  setPrice: (v: number) => TVOrderLine;
  setQuantity: (v: string) => TVOrderLine;
  setText: (v: string) => TVOrderLine;
  setTooltip: (v: string) => TVOrderLine;
  setEditable: (v: boolean) => TVOrderLine;
  setCancellable: (v: boolean) => TVOrderLine;
  onModify: (cb: () => void) => TVOrderLine;
  onMove: (cb: () => void) => TVOrderLine;
  onCancel: (cb: () => void) => TVOrderLine;
  getPrice: () => number;
  getQuantity: () => string;
  remove: () => void;
}

export interface TVPositionLine {
  setPrice: (v: number) => TVPositionLine;
  setQuantity: (v: string) => TVPositionLine;
  setText: (v: string) => TVPositionLine;
  setTooltip: (v: string) => TVPositionLine;
  remove: () => void;
}

// Slice of IExecutionLineAdapter. Direction is TV's Side enum (Buy=1,
// Sell=-1).
export interface TVExecutionLine {
  setPrice: (v: number) => TVExecutionLine;
  setTime: (v: number) => TVExecutionLine;
  setDirection: (v: number) => TVExecutionLine;
  setText: (v: string) => TVExecutionLine;
  setTooltip: (v: string) => TVExecutionLine;
  remove: () => void;
}

export interface TVEntityInfo {
  id: string;
  name: string;
}

// IStudyApi slice. Studies don't expose getProperties/setProperties —
// inputs (period, source) and styles (colors, widths) are separate.
export interface TVStudyApi {
  getInputsInfo: () => Array<Record<string, unknown>>;
  getInputValues: () => Array<{ id: string; value: unknown }>;
  setInputValues: (values: Array<{ id: string; value: unknown }>) => void;
  getStyleValues: () => Record<string, unknown>;
}

// ILineDataSourceApi slice (what getShapeById returns).
export interface TVShapeEntityApi {
  getProperties: () => Record<string, unknown>;
  setProperties: (props: Record<string, unknown>) => void;
}

export interface TVTimezoneApi {
  getTimezone: () => { id: string; title?: string };
  setTimezone: (tz: string) => void;
}

// TV's FieldDescriptor is a discriminated union (time / series / study /
// user_time) with no common shape beyond `type`. Loose typing so the
// exportData helper can build keys per-variant without TypeScript
// fighting the union.
export interface TVExportedData {
  schema: Array<Record<string, unknown>>;
  data: Float64Array[];
  displayedData?: string[][];
}

export interface TVChartApi {
  setSymbol: (symbol: string, callback?: () => void) => void;
  setResolution: (
    resolution: string,
    callback?: () => void,
  ) => Promise<boolean>;
  setChartType: (type: number, callback?: () => void) => void;
  setVisibleRange: (range: { from: number; to: number }) => Promise<void>;
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
  createOrderLine: () => Promise<TVOrderLine>;
  createPositionLine: () => Promise<TVPositionLine>;
  createExecutionShape: () => Promise<TVExecutionLine>;
  removeEntity: (id: string) => void;
  getTimezoneApi: () => TVTimezoneApi;
  getAllShapes: () => TVEntityInfo[];
  getAllStudies: () => TVEntityInfo[];
  getShapeById: (id: string) => TVShapeEntityApi;
  getStudyById: (id: string) => TVStudyApi;
  exportData: (opts?: {
    from?: number;
    to?: number;
    includeTime?: boolean;
    includeSeries?: boolean;
    includedStudies?: readonly string[] | "all";
  }) => Promise<TVExportedData>;
}

// Subset of IBrokerConnectionAdapterHost we use from the AI dispatcher.
// The broker captures this on first call and exposes it via
// setTVBrokerHost so `propose_order` can open the order ticket prefilled.
export interface TVBrokerHost {
  showOrderDialog?: (
    order: Record<string, unknown>,
    focus?: number,
  ) => Promise<boolean>;
}

export interface TVWidgetInstance {
  onChartReady: (cb: () => void) => void;
  remove: () => void;
  activeChart: () => TVChartApi;
  takeClientScreenshot: (
    options?: { hideStudies?: boolean; hidePriceLine?: boolean },
  ) => Promise<HTMLCanvasElement>;
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

// Broker host singleton. tv-broker.ts captures it from createBroker so
// the AI dispatcher can call host.showOrderDialog() without threading
// the host through the widget tree.
let brokerHost: TVBrokerHost | null = null;

export function setTVBrokerHost(h: TVBrokerHost | null): void {
  brokerHost = h;
}

export function getTVBrokerHost(): TVBrokerHost | null {
  return brokerHost;
}
