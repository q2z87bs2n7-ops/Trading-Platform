/**
 * ChatMessage — one user OR assistant turn. User turns render as a
 * violet right-aligned bubble (asymmetric bottom-right corner). Assistant
 * turns are flush-left text with a violet eyebrow + tool-result cards
 * carrying a violet border-left rail.
 */

import type { RenderedTurn } from "../../hooks/useChatSession";

interface Props {
  turn: RenderedTurn;
  isLastTurn: boolean;
  onRetry?: () => void;
}

export default function ChatMessage({ turn, isLastTurn, onRetry }: Props) {
  const isUser = turn.role === "user";

  if (isUser) {
    // User bubbles never carry tool calls — they're just text events.
    const text = turn.events
      .filter((e) => e.kind === "assistant_text")
      .map((e) => (e as { text: string }).text)
      .join("\n");
    return (
      <div className="mb-4 flex justify-end">
        <div
          className="max-w-[85%] whitespace-pre-wrap text-[13.5px] px-3 py-2"
          style={{
            background: "var(--cb-accent)",
            color: "white",
            borderRadius: "var(--r)",
            borderBottomRightRadius: 4,
          }}
        >
          {text || turn.events.find((e) => e.kind === "error") ? text : ""}
        </div>
      </div>
    );
  }

  // The last event is the only one that gets a Retry banner.
  const lastErrorIdx = isLastTurn
    ? (() => {
        for (let i = turn.events.length - 1; i >= 0; i--) {
          if (turn.events[i].kind === "error") return i;
        }
        return -1;
      })()
    : -1;

  return (
    <div className="mb-4">
      <div
        className="mb-1 text-[10.5px] uppercase font-semibold"
        style={{ color: "var(--cb-accent)", letterSpacing: "0.04em" }}
      >
        ChartBot
      </div>
      <div className="flex flex-col gap-1.5">
        {turn.events.map((e, i) => {
          if (e.kind === "assistant_text") {
            return (
              <div
                key={i}
                className="whitespace-pre-wrap text-[13.5px] leading-relaxed"
                style={{ color: "var(--text)" }}
              >
                {e.text}
              </div>
            );
          }
          if (e.kind === "tool_call") {
            return (
              <div
                key={i}
                className="font-mono text-[11.5px] px-2.5 py-1.5"
                style={{
                  background: "var(--panel-2)",
                  borderLeft: `2px solid ${e.ok ? "var(--cb-accent)" : "var(--neg)"}`,
                  color: e.ok ? "var(--text-2)" : "var(--neg)",
                  borderRadius: 4,
                }}
              >
                {e.ok ? "✓" : "✕"} {e.summary}
              </div>
            );
          }
          // error
          const isRetryable = i === lastErrorIdx && !!onRetry;
          return (
            <div
              key={i}
              className="flex items-center justify-between gap-2 px-2.5 py-1.5 text-[12px]"
              style={{
                background: "var(--neg-bg)",
                color: "var(--neg)",
                borderRadius: 6,
                border: "1px solid var(--neg)",
              }}
            >
              <span>⚠ {e.message}</span>
              {isRetryable && (
                <button
                  type="button"
                  onClick={onRetry}
                  className="cursor-pointer border-0 text-[11px] font-medium"
                  style={{
                    background: "transparent",
                    color: "var(--neg)",
                    border: "1px solid var(--neg)",
                    padding: "2px 8px",
                    borderRadius: 4,
                  }}
                >
                  Retry
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
