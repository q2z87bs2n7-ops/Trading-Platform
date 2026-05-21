import { useMemo, useEffect, useRef, useState } from "react";

import type { AiAskResponse } from "../../api";
import { parseIntent, extractSymbols, type Intent } from "../../lib/cmd-intent";
import type { Position } from "../../types";
import { usePositions, useWatchlist } from "../../data/hooks";
import { CmdResult } from "./cards";

interface Turn {
  id: number;
  query: string;
  intent: Intent;
}

function buildSuggestions(
  positions: Position[] | undefined,
  watchlist: string[] | undefined,
): string[] {
  const chips: string[] = [];

  // Time-of-day aware opening chip (US Eastern).
  const etHour = Number(
    new Date().toLocaleString("en-US", {
      hour: "numeric",
      hour12: false,
      timeZone: "America/New_York",
    }),
  );
  if (etHour < 9 || (etHour === 9 && new Date().getMinutes() < 30)) {
    chips.push("Pre-market movers");
  } else if (etHour >= 16) {
    chips.push("After-hours movers");
  } else {
    chips.push("Market summary");
  }

  // Top 2 positions by absolute unrealised P/L.
  if (positions?.length) {
    const sorted = [...positions].sort(
      (a, b) => Math.abs(b.unrealized_pl) - Math.abs(a.unrealized_pl),
    );
    for (const p of sorted.slice(0, 2)) chips.push(`How's my ${p.symbol}?`);
  }

  // Watchlist symbols not already represented via positions.
  const posSyms = new Set(positions?.map((p) => p.symbol) ?? []);
  for (const sym of (watchlist ?? []).filter((s) => !posSyms.has(s)).slice(0, 2)) {
    chips.push(`News on ${sym}`);
  }

  // Fill remaining slots with generic chips.
  for (const g of [
    "Show me top gainers",
    "What changed today?",
    "Open orders",
    "Buy 50 AMD at market",
  ]) {
    if (chips.length >= 7) break;
    chips.push(g);
  }

  return chips;
}

function buildFollowups(lastIntent: Intent | null, aiResp: AiAskResponse | null): string[] {
  // For AI fallback turns: derive chips from the actual response content.
  if (lastIntent?.type === "fallback" && aiResp) {
    const chips: string[] = [];
    const toolNames = new Set(aiResp.tool_calls.filter((t) => t.ok).map((t) => t.name));
    const syms = extractSymbols(aiResp.text);

    if (syms[0]) chips.push(`Chart ${syms[0]}`);
    if (syms[1]) chips.push(`News on ${syms[1]}`);
    if (toolNames.has("get_positions") || toolNames.has("get_account")) chips.push("Portfolio");
    if (toolNames.has("get_orders")) chips.push("Open orders");
    if (toolNames.has("get_movers")) chips.push("What changed today?");

    for (const f of ["Top gainers", "Open orders", "Portfolio", "What changed today?"]) {
      if (chips.length >= 4) break;
      if (!chips.includes(f)) chips.push(f);
    }
    return chips.slice(0, 4);
  }

  // For structured intents: context-aware static chips.
  switch (lastIntent?.type) {
    case "order":
      return ["Portfolio", `How's ${lastIntent.symbol}?`, "Open orders", "Top gainers"];
    case "close":
      return ["Portfolio", "Open orders", "What changed today?", "Top gainers"];
    case "portfolio":
      return ["Open orders", "Top gainers", "Market summary", "What changed today?"];
    case "movers":
      return ["Market summary", "Portfolio", "Open orders", "What changed today?"];
    case "news":
      return lastIntent.symbol
        ? [`Chart ${lastIntent.symbol}`, "Top gainers", "Portfolio", "Open orders"]
        : ["Market summary", "Top gainers", "Portfolio", "What changed today?"];
    case "orders":
      return ["Portfolio", "Top gainers", "Market summary", "What changed today?"];
    case "chart":
      return [`News on ${lastIntent.symbol}`, "Portfolio", "Top gainers", "Open orders"];
    case "market_summary":
      return ["Top gainers", "Portfolio", "Open orders", "What changed today?"];
    default:
      return ["What changed today?", "Top gainers", "Open orders", "Portfolio"];
  }
}

interface Props {
  open: boolean;
  onClose: () => void;
  onOpenInWorkspace: (symbol: string) => void;
}

export default function CmdBar({ open, onClose, onOpenInWorkspace }: Props) {
  const [text, setText] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [lastAiResp, setLastAiResp] = useState<AiAskResponse | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const counter = useRef(0);

  const { data: posData } = usePositions();
  const { data: wl } = useWatchlist();

  const suggestions = useMemo(
    () => buildSuggestions(posData?.positions, wl?.symbols),
    // Recompute when data arrives or the modal reopens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [posData, wl, open],
  );

  const lastTurn = turns[turns.length - 1];
  const followups = useMemo(
    () => buildFollowups(lastTurn?.intent ?? null, lastAiResp),
    [lastTurn?.id, lastAiResp],
  );

  // Focus the textarea each time the modal opens; clear transcript on
  // close so each session starts fresh.
  useEffect(() => {
    if (open) {
      const id = setTimeout(() => inputRef.current?.focus(), 30);
      return () => clearTimeout(id);
    }
    setText("");
    setTurns([]);
    setLastAiResp(null);
  }, [open]);

  // ESC closes.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Lock body scroll while open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Auto-scroll transcript when a new turn lands so the latest answer
  // sits just above the composer.
  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [turns.length]);

  function submit(value: string) {
    const trimmed = value.trim();
    if (!trimmed) return;
    counter.current += 1;
    setLastAiResp(null);
    setTurns((t) => [
      ...t,
      { id: counter.current, query: trimmed, intent: parseIntent(trimmed) },
    ]);
    setText("");
    // Refocus so the user can keep typing follow-ups without re-clicking.
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal
      className="fixed inset-0 z-50"
      style={{
        background: "rgba(20, 22, 28, 0.45)",
        backdropFilter: "blur(4px)",
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="mx-auto flex flex-col"
        style={{
          marginTop: "10vh",
          maxWidth: 680,
          width: "calc(100% - 32px)",
          maxHeight: "80vh",
          background: "var(--panel)",
          borderRadius: "var(--r-xl)",
          boxShadow: "var(--shadow-lg)",
          overflow: "hidden",
          animation: "cmd-up 180ms ease",
        }}
      >
        <style>{`@keyframes cmd-up{from{transform:translateY(-20px);opacity:0}to{transform:translateY(0);opacity:1}}`}</style>

        {/* Header — sparkle brand + close. Keeps a small top frame around
           the transcript without putting input controls up here. */}
        <div
          className="flex items-center gap-2 px-4 py-2.5"
          style={{ borderBottom: "1px solid var(--hairline)" }}
        >
          <span
            className="text-[16px]"
            style={{ color: "var(--accent)" }}
            aria-hidden
          >
            ✦
          </span>
          <span
            className="text-[12px] font-semibold uppercase"
            style={{ color: "var(--mute)", letterSpacing: "0.06em" }}
          >
            Ask anything
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="ml-auto cursor-pointer border-0 text-[14px] grid place-items-center"
            style={{
              background: "var(--panel-2)",
              color: "var(--text-2)",
              width: 28,
              height: 28,
              borderRadius: 6,
            }}
          >
            ✕
          </button>
        </div>

        {/* Transcript / empty state — fills the middle and scrolls. */}
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto px-4 py-4"
          style={{ background: "var(--bg)" }}
        >
          {turns.length === 0 ? (
            <div>
              <div
                className="text-[11px] uppercase mb-3"
                style={{ color: "var(--mute)", letterSpacing: "0.04em" }}
              >
                Try
              </div>
              <div className="flex flex-wrap gap-2">
                {suggestions.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => submit(s)}
                    className="text-[13px] cursor-pointer transition-colors"
                    style={{
                      padding: "8px 12px",
                      background: "var(--panel)",
                      border: "1px solid var(--border)",
                      color: "var(--text-2)",
                      borderRadius: "var(--r)",
                    }}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {turns.map((turn) => (
                <div key={turn.id} className="flex flex-col gap-2">
                  <div
                    className="self-end max-w-[80%] text-[13.5px] px-3 py-1.5"
                    style={{
                      background: "var(--accent-bg)",
                      color: "var(--accent-2)",
                      border: "1px solid var(--accent)",
                      borderRadius: "var(--r)",
                      borderBottomRightRadius: 4,
                    }}
                  >
                    {turn.query}
                  </div>
                  <CmdResult
                    intent={turn.intent}
                    onClose={onClose}
                    onOpenInWorkspace={(sym) => {
                      onOpenInWorkspace(sym);
                      onClose();
                    }}
                    onAiResponse={setLastAiResp}
                  />
                </div>
              ))}
              {/* Follow-up prompts after the last result — same idea as
                 the empty-state chips, smaller so they don't crowd the
                 reply above. */}
              <div>
                <div
                  className="text-[10.5px] uppercase mb-1.5"
                  style={{
                    color: "var(--mute)",
                    letterSpacing: "0.04em",
                  }}
                >
                  Try next
                </div>
                <div
                  className="flex gap-1.5 overflow-x-auto pb-1"
                  style={{ scrollbarWidth: "none" }}
                >
                  {followups.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => submit(s)}
                      className="cursor-pointer text-[11.5px] whitespace-nowrap transition-colors"
                      style={{
                        padding: "4px 10px",
                        background: "transparent",
                        border: "1px solid var(--border)",
                        color: "var(--text-2)",
                        borderRadius: 999,
                      }}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Composer — pinned at the bottom of the modal. Enter submits;
           Shift+Enter inserts a newline. */}
        <div
          className="flex items-end gap-2 px-4 py-3"
          style={{ borderTop: "1px solid var(--hairline)" }}
        >
          <textarea
            ref={inputRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit(text);
              }
            }}
            placeholder="Ask anything — orders, portfolio, news, charts…"
            rows={1}
            className="flex-1 resize-none bg-transparent outline-none text-[15px]"
            style={{
              background: "var(--panel-2)",
              border: "1px solid var(--border)",
              borderRadius: "var(--r)",
              color: "var(--text)",
              fontFamily: "var(--font-sans)",
              minHeight: 36,
              maxHeight: 120,
              padding: "8px 10px",
            }}
          />
          <button
            type="button"
            onClick={() => submit(text)}
            disabled={!text.trim()}
            aria-label="Send"
            className="cursor-pointer border-0 font-semibold disabled:cursor-not-allowed"
            style={{
              background: "var(--accent)",
              color: "white",
              padding: "0 14px",
              height: 36,
              borderRadius: "var(--r)",
              opacity: text.trim() ? 1 : 0.5,
              fontSize: 13,
            }}
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
