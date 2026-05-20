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
  drawArrow,
  drawFibRetracement,
  drawHorizontalLine,
  drawRectangle,
  drawText,
  drawTrendLine,
  drawVerticalLine,
  listDrawings,
  removeDrawing,
  type DrawingRecord,
} from "./tv-drawings";

const API_BASE = (import.meta.env.VITE_API_BASE ?? "").replace(/\/$/, "");
const MAX_OUTER_ITERATIONS = 5;

// --- Wire types (match backend ChatRequest / ChatResponse) ------------------

export type ContentBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | { type: "tool_result"; tool_use_id: string; content: string; is_error?: boolean };

export interface APIMessage {
  role: "user" | "assistant";
  content: string | ContentBlock[];
}

export interface ChartContext {
  symbol: string;
  resolution: string;
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

type DrawResult = { content: string; isError: boolean; summary: string };

function ok(content: string, summary: string): DrawResult {
  return { content, isError: false, summary };
}
function err(message: string, summary: string): DrawResult {
  return { content: message, isError: true, summary };
}

function recSummary(verb: string, r: DrawingRecord): string {
  return `${verb} (id: ${r.id})`;
}

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
        });
        return ok(JSON.stringify({ drawing_id: r.id }), recSummary("horizontal line", r));
      }
      case "draw_vertical_line": {
        const r = await drawVerticalLine(input.time as number, {
          text: input.text as string | undefined,
          color: input.color as string | undefined,
        });
        return ok(JSON.stringify({ drawing_id: r.id }), recSummary("vertical line", r));
      }
      case "draw_trend_line": {
        const r = await drawTrendLine(
          input.point1 as { time: number; price: number },
          input.point2 as { time: number; price: number },
          {
            text: input.text as string | undefined,
            color: input.color as string | undefined,
          },
        );
        return ok(JSON.stringify({ drawing_id: r.id }), recSummary("trend line", r));
      }
      case "draw_rectangle": {
        const r = await drawRectangle(
          input.point1 as { time: number; price: number },
          input.point2 as { time: number; price: number },
          { color: input.color as string | undefined },
        );
        return ok(JSON.stringify({ drawing_id: r.id }), recSummary("rectangle", r));
      }
      case "draw_fib_retracement": {
        const r = await drawFibRetracement(
          input.point1 as { time: number; price: number },
          input.point2 as { time: number; price: number },
        );
        return ok(JSON.stringify({ drawing_id: r.id }), recSummary("fib retracement", r));
      }
      case "draw_text": {
        const r = await drawText(
          input.point as { time: number; price: number },
          input.text as string,
          { color: input.color as string | undefined },
        );
        return ok(JSON.stringify({ drawing_id: r.id }), recSummary("text", r));
      }
      case "draw_arrow": {
        const r = await drawArrow(
          input.point as { time: number; price: number },
          input.direction as "up" | "down",
          {
            text: input.text as string | undefined,
            color: input.color as string | undefined,
          },
        );
        return ok(JSON.stringify({ drawing_id: r.id }), recSummary("arrow", r));
      }
      case "add_indicator": {
        const r = await addStudy(
          input.name as string,
          input.inputs as Record<string, unknown> | undefined,
        );
        return ok(JSON.stringify({ drawing_id: r.id }), `added "${input.name}" study`);
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
): Promise<ChatResponse> {
  const res = await fetch(`${API_BASE}/api/ai/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages, chart_context: chartContext }),
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

/**
 * Run one user turn: append the user message to history, drive the
 * backend → frontend tool-use loop, return display events + the new
 * api-shaped history slice to keep for the next turn.
 */
export async function runAITurn(
  history: APIMessage[],
  userText: string,
  chartContext: ChartContext,
): Promise<RunResult> {
  const events: TurnEvent[] = [];
  let messages: APIMessage[] = [
    ...history,
    { role: "user", content: userText },
  ];

  for (let i = 0; i < MAX_OUTER_ITERATIONS; i++) {
    let resp: ChatResponse;
    try {
      resp = await postChat(messages, chartContext);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      events.push({ kind: "error", message: msg });
      return { events, newHistory: history }; // don't poison history with failed turn
    }

    // Append the assistant message Claude just produced.
    messages = [...messages, { role: "assistant", content: resp.content }];

    // Surface text blocks to the panel.
    for (const block of resp.content) {
      if (block.type === "text" && block.text) {
        events.push({ kind: "assistant_text", text: block.text });
      }
    }

    if (resp.stop_reason !== "tool_use") {
      if (resp.backend_stopped === "max_iterations") {
        events.push({
          kind: "error",
          message: "Stopped after backend hit max tool iterations — ask again to continue.",
        });
      }
      return { events, newHistory: messages };
    }

    // Surface backend-executed tool_results as compact "I ran X" lines.
    for (const block of resp.content) {
      if (block.type === "tool_use") {
        const wasBackendExecuted = !resp.pending_tool_use_ids.includes(block.id);
        if (wasBackendExecuted) {
          events.push({
            kind: "tool_call",
            name: block.name,
            summary: `ran ${block.name}`,
            ok: true,
          });
        }
      }
    }

    // Execute pending drawing tools.
    const frontendResults: ContentBlock[] = [];
    for (const block of resp.content) {
      if (block.type !== "tool_use") continue;
      if (!resp.pending_tool_use_ids.includes(block.id)) continue;
      const result = await executeDrawTool(block.name, block.input);
      events.push({
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

  events.push({
    kind: "error",
    message: `Stopped after ${MAX_OUTER_ITERATIONS} frontend rounds — ask again to continue.`,
  });
  return { events, newHistory: messages };
}
