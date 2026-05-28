/**
 * AI chat client + outer tool-use loop.
 *
 * The backend handles read-tool execution inside one HTTP call; the
 * frontend handles drawing-tool execution and re-posts whenever the
 * backend yields control via `pending_tool_use_ids`. This file owns the
 * outer loop and the drawing-tool dispatcher; it doesn't know about
 * React (the panel imports `runAITurn` and renders the resulting
 * events).
 */

import {
  addStudy,
  compareSymbol,
  drawArrow,
  drawFibRetracement,
  drawHorizontalLine,
  drawRectangle,
  drawText,
  drawTrendLine,
  drawVerticalLine,
  exportChartData,
  getChartState,
  getEntityProperties,
  inspectChart,
  listDrawings,
  markBar,
  markExecution,
  modifyDrawing,
  proposeOrder,
  removeDrawing,
  setChartResolution,
  setChartSymbol,
  setChartTimezone,
  setChartType,
  setChartVisibleRange,
  setEntityProperties,
  showPositionLine,
  takeScreenshot,
  type QueuedRecord,
} from "./tv-drawings";

const API_BASE = (import.meta.env.VITE_API_BASE ?? "").replace(/\/$/, "");
const MAX_OUTER_ITERATIONS = 10;

// Context-window concern: keep at most this many messages on the wire and
// in storage. Lives here (not in the panel) because it's about the model,
// not the UI.
export const HISTORY_CAP = 80;

// --- Wire types (match backend ChatRequest / ChatResponse) ------------------

// tool_result.content can be a plain string OR a list of nested blocks
// when the result includes an image (Anthropic's vision input shape).
// take_screenshot is the only tool that uses the array form today.
export type ToolResultContent =
  | string
  | Array<
      | { type: "text"; text: string }
      | {
          type: "image";
          source: {
            type: "base64";
            media_type: "image/png" | "image/jpeg" | "image/webp" | "image/gif";
            data: string;
          };
        }
    >;

export type ContentBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | {
      type: "tool_result";
      tool_use_id: string;
      content: ToolResultContent;
      is_error?: boolean;
    };

export interface APIMessage {
  role: "user" | "assistant";
  content: string | ContentBlock[];
}

export interface ChartContext {
  symbol: string;
  resolution: string;
  asset_class?: "stocks" | "crypto" | "cfd";
}

interface ChatResponse {
  stop_reason: string;
  content: ContentBlock[];
  backend_tool_results: ContentBlock[];
  pending_tool_use_ids: string[];
  usage: Record<string, unknown> | null;
  backend_stopped?: "" | "max_iterations";
}

// --- Public turn events (what the panel renders) ----------------------------

export type TurnEvent =
  | { kind: "assistant_text"; text: string }
  | { kind: "tool_call"; name: string; summary: string; ok: boolean }
  | { kind: "error"; message: string };

export interface RunResult {
  events: TurnEvent[];
  newHistory: APIMessage[];
}

// --- Drawing dispatcher (frontend-executes-draw) ----------------------------

type DrawResult = {
  content: ToolResultContent;
  isError: boolean;
  summary: string;
};

function ok(content: ToolResultContent, summary: string): DrawResult {
  return { content, isError: false, summary };
}
function err(message: string, summary: string): DrawResult {
  return { content: message, isError: true, summary };
}

function summarizeResult(verb: string, r: QueuedRecord): string {
  return r.queued
    ? `${verb} queued for ${r.symbol} (id: ${r.id})`
    : `${verb} (id: ${r.id})`;
}

function queuedToolResult(r: QueuedRecord): string {
  return JSON.stringify(
    r.queued
      ? { drawing_id: r.id, queued: true, queued_for_symbol: r.symbol }
      : { drawing_id: r.id },
  );
}

type Point = { time: number; price: number };

async function executeDrawTool(
  name: string,
  input: Record<string, unknown>,
): Promise<DrawResult> {
  try {
    switch (name) {
      case "draw_horizontal_line": {
        const r = await drawHorizontalLine(input.price as number, {
          text: input.text as string | undefined,
          color: input.color as string | undefined,
          symbol: input.symbol as string | undefined,
        });
        return ok(queuedToolResult(r), summarizeResult("horizontal line", r));
      }
      case "draw_vertical_line": {
        const r = await drawVerticalLine(input.time as number, {
          text: input.text as string | undefined,
          color: input.color as string | undefined,
          symbol: input.symbol as string | undefined,
        });
        return ok(queuedToolResult(r), summarizeResult("vertical line", r));
      }
      case "draw_trend_line": {
        const r = await drawTrendLine(
          input.point1 as Point,
          input.point2 as Point,
          {
            text: input.text as string | undefined,
            color: input.color as string | undefined,
            symbol: input.symbol as string | undefined,
          },
        );
        return ok(queuedToolResult(r), summarizeResult("trend line", r));
      }
      case "draw_rectangle": {
        const r = await drawRectangle(
          input.point1 as Point,
          input.point2 as Point,
          {
            color: input.color as string | undefined,
            symbol: input.symbol as string | undefined,
          },
        );
        return ok(queuedToolResult(r), summarizeResult("rectangle", r));
      }
      case "draw_fib_retracement": {
        const r = await drawFibRetracement(
          input.point1 as Point,
          input.point2 as Point,
          { symbol: input.symbol as string | undefined },
        );
        return ok(queuedToolResult(r), summarizeResult("fib retracement", r));
      }
      case "draw_text": {
        const r = await drawText(
          input.point as Point,
          input.text as string,
          {
            color: input.color as string | undefined,
            symbol: input.symbol as string | undefined,
          },
        );
        return ok(queuedToolResult(r), summarizeResult("text", r));
      }
      case "draw_arrow": {
        const r = await drawArrow(
          input.point as Point,
          input.direction as "up" | "down",
          {
            text: input.text as string | undefined,
            color: input.color as string | undefined,
            symbol: input.symbol as string | undefined,
          },
        );
        return ok(queuedToolResult(r), summarizeResult("arrow", r));
      }
      case "add_indicator": {
        const r = await addStudy(
          input.name as string,
          input.inputs as Record<string, unknown> | undefined,
          { symbol: input.symbol as string | undefined },
        );
        const verb = `added "${input.name}" study`;
        return ok(queuedToolResult(r), summarizeResult(verb, r));
      }
      case "list_drawings": {
        const all = listDrawings();
        return ok(JSON.stringify({ drawings: all }), `listed ${all.length} drawings`);
      }
      case "remove_drawing": {
        const id = input.drawing_id as string;
        const removed = removeDrawing(id);
        return ok(JSON.stringify({ removed }), removed ? `removed ${id}` : `not found: ${id}`);
      }
      case "modify_drawing": {
        const id = input.drawing_id as string;
        const r = await modifyDrawing(id, {
          price: input.price as number | undefined,
          time: input.time as number | undefined,
          point: input.point as Point | undefined,
          point1: input.point1 as Point | undefined,
          point2: input.point2 as Point | undefined,
          text: input.text as string | undefined,
          color: input.color as string | undefined,
        });
        return ok(
          JSON.stringify({ drawing_id: r.id }),
          `modified ${r.kind} (id: ${r.id})`,
        );
      }
      case "set_symbol": {
        const sym = (input.symbol as string).toUpperCase();
        // Await the data-loaded callback before returning — downstream
        // tool calls (notably set_visible_range) race the data fetch
        // otherwise and throw "Value is null" inside TV's time scale.
        await setChartSymbol(sym);
        return ok(JSON.stringify({ symbol: sym }), `chart → ${sym}`);
      }
      case "set_resolution": {
        const res = input.resolution as string;
        await setChartResolution(res);
        return ok(JSON.stringify({ resolution: res }), `timeframe → ${res}`);
      }
      case "set_chart_type": {
        const t = input.type as string;
        setChartType(t);
        return ok(JSON.stringify({ type: t }), `chart type → ${t}`);
      }
      case "set_visible_range": {
        const from = input.from as number;
        const to = input.to as number;
        await setChartVisibleRange(from, to);
        return ok(
          JSON.stringify({ from, to }),
          `zoomed to range (${from}–${to})`,
        );
      }
      case "propose_order": {
        const r = await proposeOrder({
          side: input.side as "buy" | "sell",
          type: input.type as "market" | "limit" | "stop" | "stop_limit",
          quantity: input.quantity as number,
          limit_price: input.limit_price as number | undefined,
          stop_price: input.stop_price as number | undefined,
          symbol: input.symbol as string | undefined,
        });
        const bits: string[] = [];
        if (r.line_drawn) bits.push("line drawn");
        if (r.staged) bits.push("ticket opened");
        const detail = bits.length ? bits.join(" + ") : "no chart action (ticket unavailable)";
        return ok(
          JSON.stringify(r),
          `proposed ${input.side} ${input.quantity} ${r.symbol} — ${detail}`,
        );
      }
      case "show_position_line": {
        const r = await showPositionLine(input.symbol as string | undefined);
        const verb = r.shown.length
          ? `shown position line${r.shown.length > 1 ? "s" : ""} for ${r.shown.map((s) => s.symbol).join(", ")}`
          : "no matching open position on this chart";
        return ok(JSON.stringify(r), verb);
      }
      case "mark_bar": {
        const r = await markBar(input.time as number, input.text as string, {
          color: input.color as string | undefined,
          symbol: input.symbol as string | undefined,
        });
        return ok(queuedToolResult(r), summarizeResult("event marker", r));
      }
      case "mark_execution": {
        const r = await markExecution({
          price: input.price as number,
          time: input.time as number,
          side: input.side as "buy" | "sell",
          text: input.text as string | undefined,
          symbol: input.symbol as string | undefined,
        });
        const verb = r.drawn
          ? `marked ${input.side} execution on ${r.symbol}`
          : `skipped execution mark (chart on different symbol)`;
        return ok(JSON.stringify(r), verb);
      }
      case "compare_symbol": {
        const r = await compareSymbol(input.symbol as string);
        return ok(
          queuedToolResult(r),
          summarizeResult(`compared with ${(input.symbol as string).toUpperCase()}`, r),
        );
      }
      case "get_chart_state": {
        const s = getChartState();
        return ok(JSON.stringify(s), `chart state: ${s.symbol} ${s.resolution}`);
      }
      case "inspect_chart": {
        const r = inspectChart();
        return ok(
          JSON.stringify(r),
          `inspected: ${r.shapes.length} shape(s), ${r.studies.length} study(ies)`,
        );
      }
      case "get_drawing_properties": {
        const id = input.entity_id as string;
        const r = getEntityProperties(id);
        return ok(
          JSON.stringify({ entity_id: id, ...r }),
          `read ${r.kind} properties of ${id}`,
        );
      }
      case "set_drawing_properties": {
        const id = input.entity_id as string;
        setEntityProperties(id, input.properties as Record<string, unknown>);
        return ok(JSON.stringify({ entity_id: id, updated: true }), `updated properties of ${id}`);
      }
      case "set_timezone": {
        const tz = input.timezone as string;
        setChartTimezone(tz);
        return ok(JSON.stringify({ timezone: tz }), `timezone → ${tz}`);
      }
      case "take_screenshot": {
        const r = await takeScreenshot();
        // Strip the "data:image/png;base64," prefix — Anthropic wants raw
        // base64 in source.data.
        const b64 = r.data_url.replace(/^data:image\/png;base64,/, "");
        return ok(
          [
            {
              type: "text",
              text: `Chart screenshot (${r.width}x${r.height}). Describe what you see.`,
            },
            {
              type: "image",
              source: { type: "base64", media_type: "image/png", data: b64 },
            },
          ],
          `screenshot taken (${r.width}x${r.height})`,
        );
      }
      case "export_chart_data": {
        const r = await exportChartData({
          from: input.from as number | undefined,
          to: input.to as number | undefined,
          include_studies: input.include_studies as boolean | undefined,
        });
        return ok(
          JSON.stringify(r),
          `exported ${r.bars.length} bars (${r.schema.length} fields)`,
        );
      }
      default:
        return err(`unknown draw tool: ${name}`, `unknown tool ${name}`);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return err(`error: ${msg}`, `${name} failed: ${msg}`);
  }
}

// --- Backend POST -----------------------------------------------------------

async function postChat(
  messages: APIMessage[],
  chartContext: ChartContext,
  signal?: AbortSignal,
): Promise<ChatResponse> {
  const res = await fetch(`${API_BASE}/api/ai/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages, chart_context: chartContext }),
    signal,
  });
  if (!res.ok) {
    let detail = `${res.status} ${res.statusText}`;
    try {
      const body = (await res.json()) as { detail?: string };
      if (body.detail) detail = body.detail;
    } catch {
      // body wasn't JSON; keep the status string
    }
    throw new Error(detail);
  }
  return (await res.json()) as ChatResponse;
}

// --- Outer loop -------------------------------------------------------------

export interface RunOptions {
  /** Fired as each event is produced (text, tool_call, error). */
  onEvent?: (event: TurnEvent) => void;
  /** Abort the in-flight backend POST and stop the loop after the next yield. */
  signal?: AbortSignal;
}

/**
 * Run one user turn: append the user message to history, drive the
 * backend → frontend tool-use loop, return display events + the new
 * api-shaped history slice to keep for the next turn.
 *
 * If `onEvent` is supplied, each event is delivered live; the returned
 * `events` array is still the full ordered list.
 */
export async function runAITurn(
  history: APIMessage[],
  userText: string,
  chartContext: ChartContext,
  options: RunOptions = {},
): Promise<RunResult> {
  const { onEvent, signal } = options;
  const events: TurnEvent[] = [];
  const push = (e: TurnEvent) => {
    events.push(e);
    onEvent?.(e);
  };

  let messages: APIMessage[] = [
    ...history,
    { role: "user", content: userText },
  ];

  for (let i = 0; i < MAX_OUTER_ITERATIONS; i++) {
    if (signal?.aborted) {
      push({ kind: "error", message: "Cancelled." });
      return { events, newHistory: history };
    }

    let resp: ChatResponse;
    try {
      resp = await postChat(messages, chartContext, signal);
    } catch (e) {
      const aborted = e instanceof DOMException && e.name === "AbortError";
      const msg = aborted ? "Cancelled." : e instanceof Error ? e.message : String(e);
      push({ kind: "error", message: msg });
      return { events, newHistory: history }; // don't poison history with failed/cancelled turn
    }

    // Append the assistant message Claude just produced.
    messages = [...messages, { role: "assistant", content: resp.content }];

    // Surface text blocks + backend-executed tool_calls in arrival order.
    for (const block of resp.content) {
      if (block.type === "text" && block.text) {
        push({ kind: "assistant_text", text: block.text });
      } else if (block.type === "tool_use") {
        const wasBackendExecuted = !resp.pending_tool_use_ids.includes(block.id);
        if (wasBackendExecuted) {
          push({
            kind: "tool_call",
            name: block.name,
            summary: `ran ${block.name}`,
            ok: true,
          });
        }
      }
    }

    if (resp.stop_reason !== "tool_use") {
      if (resp.backend_stopped === "max_iterations") {
        push({
          kind: "error",
          message: "Stopped after backend hit max tool iterations — ask again to continue.",
        });
      }
      return { events, newHistory: messages };
    }

    // Execute pending drawing tools.
    const frontendResults: ContentBlock[] = [];
    for (const block of resp.content) {
      if (block.type !== "tool_use") continue;
      if (!resp.pending_tool_use_ids.includes(block.id)) continue;
      const result = await executeDrawTool(block.name, block.input);
      push({
        kind: "tool_call",
        name: block.name,
        summary: result.summary,
        ok: !result.isError,
      });
      frontendResults.push({
        type: "tool_result",
        tool_use_id: block.id,
        content: result.content,
        is_error: result.isError || undefined,
      });
    }

    // Combine backend + frontend tool_results into the next user message.
    const combined: ContentBlock[] = [
      ...resp.backend_tool_results,
      ...frontendResults,
    ];
    messages = [...messages, { role: "user", content: combined }];
  }

  push({
    kind: "error",
    message: `Stopped after ${MAX_OUTER_ITERATIONS} frontend rounds — ask again to continue.`,
  });
  return { events, newHistory: messages };
}
