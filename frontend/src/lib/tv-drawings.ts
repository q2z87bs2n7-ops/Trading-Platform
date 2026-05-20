/**
 * Drawing layer over TradingView's IChartWidgetApi.
 *
 * Wraps createShape / createMultipointShape / createStudy / removeEntity,
 * tags every drawing with our own UUID, and persists the metadata to
 * localStorage (ai_drawings_v1) so drawings survive a page reload.
 *
 * Lifecycle:
 *   - create: caller invokes one of draw*() / addStudy(); we call the TV
 *     API, store the EntityId + metadata, flush to localStorage.
 *   - reload: TVPlatform.tsx calls recreateDrawingsForChart() inside
 *     onChartReady, which replays the stored records and patches the new
 *     EntityIds back into our map.
 *   - symbol switch: caller invokes onSymbolChanged() handler that calls
 *     recreateDrawingsForChart() for the new symbol.
 *   - remove: removeDrawing() calls removeEntity() and drops the record.
 */

import {
  getTVBrokerHost,
  getTVWidget,
  type TVPositionLine,
  type TVShapePoint,
} from "./tv-widget-handle";

const STORAGE_KEY = "ai_drawings_v1";
const SCHEMA_VERSION = 1;

export type DrawingKind =
  | "horizontal_line"
  | "vertical_line"
  | "trend_line"
  | "rectangle"
  | "fib_retracement"
  | "text"
  | "arrow_up"
  | "arrow_down"
  | "mark"
  | "study";

export interface DrawingRecord {
  id: string;
  entityId: string | null;
  symbol: string;
  resolution: string;
  kind: DrawingKind;
  points: TVShapePoint[];
  options: Record<string, unknown>;
  createdAt: number;
}

interface StoredShape {
  version: number;
  drawings: DrawingRecord[];
}

const liveMap = new Map<string, DrawingRecord>();
let hydrated = false;

function uuid(): string {
  return (
    crypto.randomUUID?.() ??
    `dr-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
  );
}

function nowSec(): number {
  return Math.floor(Date.now() / 1000);
}

function hydrate(): void {
  if (hydrated) return;
  hydrated = true;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as StoredShape;
    if (parsed.version !== SCHEMA_VERSION) return;
    for (const d of parsed.drawings) {
      // EntityIds from a prior session don't apply to this widget instance.
      liveMap.set(d.id, { ...d, entityId: null });
    }
  } catch {
    // Corrupt localStorage — start fresh; don't crash the chat panel.
  }
}

function flush(): void {
  const stored: StoredShape = {
    version: SCHEMA_VERSION,
    drawings: Array.from(liveMap.values()),
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
  } catch {
    // Quota exceeded or storage disabled — drawings still work in-session.
  }
}

function requireChart() {
  const w = getTVWidget();
  if (!w) throw new Error("Chart not ready");
  return w.activeChart();
}

function currentContext(): { symbol: string; resolution: string } {
  const chart = requireChart();
  return { symbol: chart.symbol(), resolution: chart.resolution() };
}

function normalize(s: string): string {
  return s.toUpperCase();
}

// Persist a drawing record. If `targetSymbol` is given and doesn't match
// the chart's current symbol, the record is saved but the actual
// createShape call is skipped — recreateDrawingsForChart() will materialize
// it the next time that symbol is loaded. Returns the record either way;
// `queued` flag tells the caller whether it actually rendered.
async function persistShape(
  kind: DrawingKind,
  points: TVShapePoint[],
  options: Record<string, unknown>,
  targetSymbol: string | undefined,
  draw: () => Promise<string>,
): Promise<DrawingRecord & { queued: boolean }> {
  hydrate();
  const ctx = currentContext();
  const recordSymbol = normalize(targetSymbol ?? ctx.symbol);
  const queued = recordSymbol !== normalize(ctx.symbol);
  const entityId = queued ? null : await draw();
  const rec: DrawingRecord = {
    id: uuid(),
    entityId,
    symbol: recordSymbol,
    resolution: ctx.resolution,
    kind,
    points,
    options,
    createdAt: Date.now(),
  };
  liveMap.set(rec.id, rec);
  flush();
  return { ...rec, queued };
}

// --- Single-point drawings ---------------------------------------------------

type DrawOpts = { text?: string; color?: string; symbol?: string };
export type QueuedRecord = DrawingRecord & { queued: boolean };

export function drawHorizontalLine(
  price: number,
  opts: DrawOpts = {},
): Promise<QueuedRecord> {
  const chart = requireChart();
  const point: TVShapePoint = { time: nowSec(), price };
  const options: Record<string, unknown> = {
    shape: "horizontal_line",
    text: opts.text,
    showLabel: !!opts.text,
    overrides: opts.color ? { linecolor: opts.color } : undefined,
  };
  return persistShape("horizontal_line", [point], options, opts.symbol, () =>
    chart.createShape(point, options),
  );
}

export function drawVerticalLine(
  time: number,
  opts: DrawOpts = {},
): Promise<QueuedRecord> {
  const chart = requireChart();
  const point: TVShapePoint = { time };
  const options: Record<string, unknown> = {
    shape: "vertical_line",
    text: opts.text,
    showLabel: !!opts.text,
    overrides: opts.color ? { linecolor: opts.color } : undefined,
  };
  return persistShape("vertical_line", [point], options, opts.symbol, () =>
    chart.createShape(point, options),
  );
}

export function drawText(
  point: TVShapePoint,
  text: string,
  opts: { color?: string; symbol?: string } = {},
): Promise<QueuedRecord> {
  const chart = requireChart();
  const options: Record<string, unknown> = {
    shape: "text",
    text,
    overrides: opts.color ? { color: opts.color } : undefined,
  };
  return persistShape("text", [point], options, opts.symbol, () =>
    chart.createShape(point, options),
  );
}

export function drawArrow(
  point: TVShapePoint,
  direction: "up" | "down",
  opts: DrawOpts = {},
): Promise<QueuedRecord> {
  const chart = requireChart();
  const shape = direction === "up" ? "arrow_up" : "arrow_down";
  const options: Record<string, unknown> = {
    shape,
    text: opts.text,
    overrides: opts.color ? { color: opts.color } : undefined,
  };
  return persistShape(shape, [point], options, opts.symbol, () =>
    chart.createShape(point, options),
  );
}

// --- Multi-point drawings ---------------------------------------------------

export function drawTrendLine(
  p1: TVShapePoint,
  p2: TVShapePoint,
  opts: DrawOpts = {},
): Promise<QueuedRecord> {
  const chart = requireChart();
  const options: Record<string, unknown> = {
    shape: "trend_line",
    text: opts.text,
    overrides: opts.color ? { linecolor: opts.color } : undefined,
  };
  return persistShape("trend_line", [p1, p2], options, opts.symbol, () =>
    chart.createMultipointShape([p1, p2], options),
  );
}

export function drawRectangle(
  p1: TVShapePoint,
  p2: TVShapePoint,
  opts: { color?: string; symbol?: string } = {},
): Promise<QueuedRecord> {
  const chart = requireChart();
  const options: Record<string, unknown> = {
    shape: "rectangle",
    overrides: opts.color ? { color: opts.color } : undefined,
  };
  return persistShape("rectangle", [p1, p2], options, opts.symbol, () =>
    chart.createMultipointShape([p1, p2], options),
  );
}

export function drawFibRetracement(
  p1: TVShapePoint,
  p2: TVShapePoint,
  opts: { symbol?: string } = {},
): Promise<QueuedRecord> {
  const chart = requireChart();
  const options: Record<string, unknown> = { shape: "fib_retracement" };
  return persistShape("fib_retracement", [p1, p2], options, opts.symbol, () =>
    chart.createMultipointShape([p1, p2], options),
  );
}

// --- Studies / indicators ----------------------------------------------------

export async function addStudy(
  name: string,
  inputs?: Record<string, unknown>,
  opts: { symbol?: string } = {},
): Promise<QueuedRecord> {
  hydrate();
  const chart = requireChart();
  const ctx = currentContext();
  const recordSymbol = normalize(opts.symbol ?? ctx.symbol);
  const queued = recordSymbol !== normalize(ctx.symbol);
  let entityId: string | null = null;
  if (!queued) {
    entityId = await chart.createStudy(name, false, false, inputs);
    if (!entityId) throw new Error(`createStudy returned null for "${name}"`);
  }
  const rec: DrawingRecord = {
    id: uuid(),
    entityId,
    symbol: recordSymbol,
    resolution: ctx.resolution,
    kind: "study",
    points: [],
    options: { name, inputs: inputs ?? {} },
    createdAt: Date.now(),
  };
  liveMap.set(rec.id, rec);
  flush();
  return { ...rec, queued };
}

// --- Modification -----------------------------------------------------------

interface ModifyUpdates {
  price?: number;
  time?: number;
  point?: TVShapePoint;
  point1?: TVShapePoint;
  point2?: TVShapePoint;
  text?: string;
  color?: string;
}

export async function modifyDrawing(
  id: string,
  updates: ModifyUpdates,
): Promise<DrawingRecord> {
  hydrate();
  const rec = liveMap.get(id);
  if (!rec) throw new Error(`drawing not found: ${id}`);
  if (rec.kind === "study") {
    throw new Error("indicators can't be modified; remove and re-add");
  }

  // Build new points by merging updates into the existing record.
  const newPoints: TVShapePoint[] = [];
  if (rec.kind === "horizontal_line") {
    newPoints.push({
      time: rec.points[0]?.time ?? nowSec(),
      price: updates.price ?? rec.points[0]?.price,
    });
  } else if (rec.kind === "vertical_line") {
    newPoints.push({
      time: updates.time ?? rec.points[0]?.time ?? nowSec(),
    });
  } else if (
    rec.kind === "text" ||
    rec.kind === "arrow_up" ||
    rec.kind === "arrow_down" ||
    rec.kind === "mark"
  ) {
    newPoints.push(updates.point ?? rec.points[0]);
  } else {
    // trend_line / rectangle / fib_retracement
    newPoints.push(updates.point1 ?? rec.points[0]);
    newPoints.push(updates.point2 ?? rec.points[1]);
  }

  // Merge text + color into options. Keep the color path aligned with the
  // original create paths above: "text" shapes set `overrides.color`,
  // everything else sets `overrides.linecolor`.
  const newOptions: Record<string, unknown> = { ...rec.options };
  if (updates.text !== undefined) {
    newOptions.text = updates.text;
    newOptions.showLabel = !!updates.text;
  }
  if (updates.color !== undefined) {
    const existing = (newOptions.overrides as Record<string, unknown>) ?? {};
    newOptions.overrides = {
      ...existing,
      ...(rec.kind === "text" ? { color: updates.color } : { linecolor: updates.color }),
    };
  }

  // If the entity is currently on screen, remove it before recreating.
  const w = getTVWidget();
  if (w && rec.entityId) {
    try {
      w.activeChart().removeEntity(rec.entityId);
    } catch {
      // entity already gone — proceed with recreate
    }
  }

  // Recreate only if we're looking at the record's symbol; otherwise queue.
  let entityId: string | null = null;
  if (w) {
    const chart = w.activeChart();
    if (normalize(chart.symbol()) === normalize(rec.symbol)) {
      if (newPoints.length === 1) {
        entityId = await chart.createShape(newPoints[0], newOptions);
      } else {
        entityId = await chart.createMultipointShape(newPoints, newOptions);
      }
    }
  }

  rec.entityId = entityId;
  rec.points = newPoints;
  rec.options = newOptions;
  flush();
  return rec;
}

// --- Inspection / removal ----------------------------------------------------

export function listDrawings(filter?: {
  symbol?: string;
  resolution?: string;
}): DrawingRecord[] {
  hydrate();
  const all = Array.from(liveMap.values());
  if (!filter) return all;
  return all.filter(
    (d) =>
      (!filter.symbol || d.symbol === filter.symbol) &&
      (!filter.resolution || d.resolution === filter.resolution),
  );
}

export function removeDrawing(id: string): boolean {
  hydrate();
  const rec = liveMap.get(id);
  if (!rec) return false;
  if (rec.entityId) {
    try {
      requireChart().removeEntity(rec.entityId);
    } catch {
      // Chart unavailable — still drop the record so localStorage is consistent.
    }
  }
  liveMap.delete(id);
  flush();
  return true;
}

// --- Reload / symbol-switch recreation --------------------------------------

/**
 * Replay stored drawings for the (symbol, resolution) currently on the
 * chart. Call from TVPlatform.tsx after onChartReady, and again when
 * the user switches symbols.
 */
export async function recreateDrawingsForChart(): Promise<void> {
  hydrate();
  const w = getTVWidget();
  if (!w) return;
  const chart = w.activeChart();
  const symbol = chart.symbol();
  const resolution = chart.resolution();

  for (const rec of liveMap.values()) {
    if (rec.symbol !== symbol || rec.resolution !== resolution) continue;
    if (rec.entityId) continue; // already drawn on this widget instance
    try {
      let entityId: string | null = null;
      if (rec.kind === "study") {
        const opts = rec.options as { name: string; inputs?: Record<string, unknown> };
        entityId = await chart.createStudy(opts.name, false, false, opts.inputs);
      } else if (rec.points.length === 1) {
        entityId = await chart.createShape(rec.points[0], rec.options);
      } else if (rec.points.length === 2) {
        entityId = await chart.createMultipointShape(rec.points, rec.options);
      }
      if (entityId) rec.entityId = entityId;
    } catch {
      // Skip — drawing stays in store, will retry on next reload.
    }
  }
  flush();
}

/**
 * Drop all in-memory entityIds (called when the widget itself unmounts;
 * records stay in localStorage).
 */
export function clearEntityIds(): void {
  hydrate();
  for (const rec of liveMap.values()) rec.entityId = null;
}

// --- Event marker (persistent, single-point icon-style shape) ---------------

export function markBar(
  time: number,
  text: string,
  opts: { color?: string; symbol?: string } = {},
): Promise<QueuedRecord> {
  const chart = requireChart();
  const point: TVShapePoint = { time };
  // TV's `SupportedLineTools` union lists "flag" but `createShape` rejects
  // it at runtime ("Cannot create 'flag' shape"). Fall back to "text",
  // which is universally accepted — the caller-supplied emoji + label
  // renders inline at the bar's time and still reads as an event marker.
  const options: Record<string, unknown> = {
    shape: "text",
    text,
    overrides: opts.color ? { color: opts.color } : undefined,
  };
  return persistShape("mark", [point], options, opts.symbol, () =>
    chart.createShape(point, options),
  );
}

// --- Chart navigation (no persistence; affects active chart only) -----------

// TV resolves the Promise returned by setSymbol/setResolution as soon as
// the change is *initiated*, not when the new data has loaded. Calls
// that depend on the loaded time scale (notably `setVisibleRange`) race
// the data fetch and throw "Value is null". The callback form, however,
// fires after data is loaded — promisify against that.
export function setChartSymbol(symbol: string): Promise<void> {
  const chart = requireChart();
  return new Promise<void>((resolve) => {
    chart.setSymbol(normalize(symbol), () => resolve());
  });
}

export function setChartResolution(resolution: string): Promise<void> {
  const chart = requireChart();
  return new Promise<void>((resolve) => {
    chart.setResolution(resolution, () => resolve());
  });
}

// Map our string enum to TradingView's SeriesType integer enum. Values
// taken from charting_library.d.ts SeriesType.
const CHART_TYPE_MAP: Record<string, number> = {
  bars: 0,
  candles: 1,
  line: 2,
  area: 3,
  renko: 4,
  heikin_ashi: 8,
  hollow_candles: 9,
  baseline: 10,
};

export function setChartType(type: string): void {
  const code = CHART_TYPE_MAP[type];
  if (code === undefined) throw new Error(`unknown chart type: ${type}`);
  requireChart().setChartType(code);
}

export function setChartVisibleRange(from: number, to: number): Promise<void> {
  return requireChart().setVisibleRange({ from, to });
}

// --- Trading visualization (session-only; not persisted) --------------------

// Position lines are keyed by symbol so a second call for the same symbol
// replaces the prior line instead of stacking duplicates. Order-line
// proposals are fire-and-forget — they own their own cleanup via onCancel.
const activePositionLines = new Map<string, TVPositionLine>();

export interface ProposeOrderOpts {
  side: "buy" | "sell";
  type: "market" | "limit" | "stop" | "stop_limit";
  quantity: number;
  limit_price?: number;
  stop_price?: number;
  symbol?: string;
}

export interface ProposeOrderResult {
  symbol: string;
  staged: boolean;
  line_drawn: boolean;
  line_price: number;
}

export async function proposeOrder(opts: ProposeOrderOpts): Promise<ProposeOrderResult> {
  const chart = requireChart();
  const chartSymbol = normalize(chart.symbol());
  const symbol = normalize(opts.symbol ?? chartSymbol);

  // The visible order line only makes sense when (a) we have a real price
  // level (market orders don't — TV's order line throws "Value is null"
  // on setPrice(0)) and (b) the chart is showing the proposal symbol.
  // Otherwise just open the ticket; the chart line is purely cosmetic.
  const linePrice = opts.limit_price ?? opts.stop_price;
  const canDrawLine = linePrice != null && symbol === chartSymbol;

  let lineDrawn = false;
  if (canDrawLine) {
    try {
      const line = await chart.createOrderLine();
      // TV occasionally resolves the promise with null when the chart
      // isn't fully mounted; guard before chaining setters.
      if (line) {
        line
          .setPrice(linePrice)
          .setQuantity(String(opts.quantity))
          .setText(
            `${opts.side.toUpperCase()} ${opts.quantity} ${symbol} (${opts.type})`,
          )
          .setTooltip(
            "AI proposal — drag to adjust, click ✎ to open ticket, ✕ to dismiss",
          )
          .setEditable(true)
          .setCancellable(true);
        line.onCancel(() => {
          try {
            line.remove();
          } catch {
            /* already gone */
          }
        });
        line.onModify(() => {
          void openOrderTicket(symbol, opts, line.getPrice());
        });
        lineDrawn = true;
      }
    } catch {
      // TV refused to draw — fall through to ticket-only mode rather than
      // throwing. The user still gets the proposal via the order ticket.
    }
  }

  // Always try to open the ticket — that's the actionable half of the
  // proposal. linePrice can be undefined (market order); openOrderTicket
  // handles that.
  const staged = await openOrderTicket(symbol, opts, linePrice ?? 0);

  return {
    symbol,
    staged,
    line_drawn: lineDrawn,
    line_price: linePrice ?? 0,
  };
}

// TV OrderType enum: Limit=1, Market=2, Stop=3, StopLimit=4. Keep aligned
// with tv-broker.ts:toTVOrder — flipping these silently mis-routes orders.
const ORDER_TYPE_CODE: Record<ProposeOrderOpts["type"], number> = {
  limit: 1,
  market: 2,
  stop: 3,
  stop_limit: 4,
};

async function openOrderTicket(
  symbol: string,
  opts: ProposeOrderOpts,
  price: number,
): Promise<boolean> {
  const host = getTVBrokerHost();
  if (!host) {
    console.warn("[AI] propose_order: broker host not captured yet");
    return false;
  }
  if (!host.showOrderDialog) {
    console.warn("[AI] propose_order: host.showOrderDialog not exposed on this TV build");
    return false;
  }
  const order: Record<string, unknown> = {
    symbol,
    side: opts.side === "buy" ? 1 : -1,
    type: ORDER_TYPE_CODE[opts.type],
    qty: opts.quantity,
  };
  if (opts.limit_price != null) order.limitPrice = opts.limit_price;
  else if (opts.type === "limit") order.limitPrice = price;
  if (opts.stop_price != null) order.stopPrice = opts.stop_price;
  else if (opts.type === "stop") order.stopPrice = price;

  // Fire-and-forget. showOrderDialog returns Promise<boolean> that resolves
  // when the dialog CLOSES — true if the user placed, false if they
  // dismissed. We don't want the tool result to block on user interaction,
  // and conflating "ticket opened" with "order placed" wrongly reports
  // staged=false whenever the user reviews-then-dismisses (the normal
  // case for AI-suggested trades). Kick it off, record the placement
  // outcome in the console for diagnostics, and return true on
  // successful invocation.
  try {
    host
      .showOrderDialog(order)
      .then((placed) => {
        console.info(
          `[AI] order ticket closed for ${symbol} — ${placed ? "placed" : "dismissed"}`,
        );
      })
      .catch((e) => {
        console.error(`[AI] order ticket rejected for ${symbol}:`, e);
      });
    return true;
  } catch (e) {
    console.error(`[AI] showOrderDialog threw synchronously for ${symbol}:`, e);
    return false;
  }
}

export interface ShowPositionLineResult {
  shown: Array<{ symbol: string; qty: number; avg_price: number }>;
}

// Fetch positions and render one position line per matching symbol on the
// current chart. Lines for symbols that don't match the chart are skipped
// (TV's position-line API renders against the active series).
export async function showPositionLine(
  filterSymbol?: string,
): Promise<ShowPositionLineResult> {
  const chart = requireChart();
  const chartSymbol = normalize(chart.symbol());
  const apiBase = (import.meta.env.VITE_API_BASE ?? "").replace(/\/$/, "");
  const res = await fetch(`${apiBase}/api/positions`);
  if (!res.ok) throw new Error(`failed to fetch positions: ${res.status}`);
  const data = (await res.json()) as {
    positions?: Array<Record<string, unknown>>;
  };
  const all = data.positions ?? [];
  const wanted = filterSymbol
    ? all.filter(
        (p) => String(p.symbol).toUpperCase() === normalize(filterSymbol),
      )
    : all;

  const shown: ShowPositionLineResult["shown"] = [];
  for (const p of wanted) {
    const sym = String(p.symbol).toUpperCase();
    if (sym !== chartSymbol) continue;
    const qty = parseFloat(String(p.qty ?? "0"));
    const avg = parseFloat(String(p.avg_entry_price ?? "0"));
    const pl = parseFloat(String(p.unrealized_pl ?? "0"));

    // Replace any prior line for this symbol.
    const prior = activePositionLines.get(sym);
    if (prior) {
      try {
        prior.remove();
      } catch {
        /* already gone */
      }
    }

    const line = await chart.createPositionLine();
    line
      .setPrice(avg)
      .setQuantity(String(qty))
      .setText(`${qty > 0 ? "LONG" : "SHORT"} ${Math.abs(qty)} @ ${avg.toFixed(2)}`)
      .setTooltip(`Unrealized P/L: ${pl >= 0 ? "+" : ""}${pl.toFixed(2)}`);
    activePositionLines.set(sym, line);
    shown.push({ symbol: sym, qty, avg_price: avg });
  }
  return { shown };
}
