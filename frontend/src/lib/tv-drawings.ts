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

import { getTVWidget, type TVShapePoint } from "./tv-widget-handle";

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

async function persistShape(
  kind: DrawingKind,
  points: TVShapePoint[],
  options: Record<string, unknown>,
  createPromise: Promise<string>,
): Promise<DrawingRecord> {
  hydrate();
  const ctx = currentContext();
  const entityId = await createPromise;
  const rec: DrawingRecord = {
    id: uuid(),
    entityId,
    symbol: ctx.symbol,
    resolution: ctx.resolution,
    kind,
    points,
    options,
    createdAt: Date.now(),
  };
  liveMap.set(rec.id, rec);
  flush();
  return rec;
}

// --- Single-point drawings ---------------------------------------------------

export function drawHorizontalLine(
  price: number,
  opts: { text?: string; color?: string } = {},
): Promise<DrawingRecord> {
  const chart = requireChart();
  const point: TVShapePoint = { time: nowSec(), price };
  const options: Record<string, unknown> = {
    shape: "horizontal_line",
    text: opts.text,
    showLabel: !!opts.text,
    overrides: opts.color ? { linecolor: opts.color } : undefined,
  };
  return persistShape(
    "horizontal_line",
    [point],
    options,
    chart.createShape(point, options),
  );
}

export function drawVerticalLine(
  time: number,
  opts: { text?: string; color?: string } = {},
): Promise<DrawingRecord> {
  const chart = requireChart();
  const point: TVShapePoint = { time };
  const options: Record<string, unknown> = {
    shape: "vertical_line",
    text: opts.text,
    showLabel: !!opts.text,
    overrides: opts.color ? { linecolor: opts.color } : undefined,
  };
  return persistShape(
    "vertical_line",
    [point],
    options,
    chart.createShape(point, options),
  );
}

export function drawText(
  point: TVShapePoint,
  text: string,
  opts: { color?: string } = {},
): Promise<DrawingRecord> {
  const chart = requireChart();
  const options: Record<string, unknown> = {
    shape: "text",
    text,
    overrides: opts.color ? { color: opts.color } : undefined,
  };
  return persistShape("text", [point], options, chart.createShape(point, options));
}

export function drawArrow(
  point: TVShapePoint,
  direction: "up" | "down",
  opts: { text?: string; color?: string } = {},
): Promise<DrawingRecord> {
  const chart = requireChart();
  const shape = direction === "up" ? "arrow_up" : "arrow_down";
  const options: Record<string, unknown> = {
    shape,
    text: opts.text,
    overrides: opts.color ? { color: opts.color } : undefined,
  };
  return persistShape(shape, [point], options, chart.createShape(point, options));
}

// --- Multi-point drawings ---------------------------------------------------

export function drawTrendLine(
  p1: TVShapePoint,
  p2: TVShapePoint,
  opts: { text?: string; color?: string } = {},
): Promise<DrawingRecord> {
  const chart = requireChart();
  const options: Record<string, unknown> = {
    shape: "trend_line",
    text: opts.text,
    overrides: opts.color ? { linecolor: opts.color } : undefined,
  };
  return persistShape(
    "trend_line",
    [p1, p2],
    options,
    chart.createMultipointShape([p1, p2], options),
  );
}

export function drawRectangle(
  p1: TVShapePoint,
  p2: TVShapePoint,
  opts: { color?: string } = {},
): Promise<DrawingRecord> {
  const chart = requireChart();
  const options: Record<string, unknown> = {
    shape: "rectangle",
    overrides: opts.color ? { color: opts.color } : undefined,
  };
  return persistShape(
    "rectangle",
    [p1, p2],
    options,
    chart.createMultipointShape([p1, p2], options),
  );
}

export function drawFibRetracement(
  p1: TVShapePoint,
  p2: TVShapePoint,
): Promise<DrawingRecord> {
  const chart = requireChart();
  const options: Record<string, unknown> = { shape: "fib_retracement" };
  return persistShape(
    "fib_retracement",
    [p1, p2],
    options,
    chart.createMultipointShape([p1, p2], options),
  );
}

// --- Studies / indicators ----------------------------------------------------

export async function addStudy(
  name: string,
  inputs?: Record<string, unknown>,
): Promise<DrawingRecord> {
  hydrate();
  const chart = requireChart();
  const ctx = currentContext();
  const entityId = await chart.createStudy(name, false, false, inputs);
  if (!entityId) throw new Error(`createStudy returned null for "${name}"`);
  const rec: DrawingRecord = {
    id: uuid(),
    entityId,
    symbol: ctx.symbol,
    resolution: ctx.resolution,
    kind: "study",
    points: [],
    options: { name, inputs: inputs ?? {} },
    createdAt: Date.now(),
  };
  liveMap.set(rec.id, rec);
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
