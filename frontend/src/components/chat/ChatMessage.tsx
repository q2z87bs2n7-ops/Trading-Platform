/**
 * ChatMessage — one user OR assistant turn, rendered as a 2px left
 * rail in the role color with events in arrival order (interleaved
 * text + tool_call + error).
 */

import type { RenderedTurn } from "../../hooks/useChatSession";

interface Props {
  turn: RenderedTurn;
  isLastTurn: boolean;
  onRetry?: () => void;
}

export default function ChatMessage({ turn, isLastTurn, onRetry }: Props) {
  const isUser = turn.role === "user";
  const rail = isUser ? "border-accent" : "border-pos";
  const eyebrow = isUser ? "text-accent" : "text-pos";

  // The last event is the only one that gets a Retry banner — older
  // errors are part of completed turns.
  const lastErrorIdx = isLastTurn
    ? (() => {
        for (let i = turn.events.length - 1; i >= 0; i--) {
          if (turn.events[i].kind === "error") return i;
        }
        return -1;
      })()
    : -1;

  return (
    <div className={`mb-4 border-l-2 pl-2 ${rail}`}>
      <div className={`mb-0.5 text-[11px] uppercase tracking-wider ${eyebrow}`}>
        {turn.role}
      </div>
      <div className="space-y-1">
        {turn.events.map((e, i) => {
          if (e.kind === "assistant_text") {
            return (
              <div key={i} className="whitespace-pre-wrap text-[14px]">
                {e.text}
              </div>
            );
          }
          if (e.kind === "tool_call") {
            return (
              <div
                key={i}
                className={`font-mono text-[12px] ${e.ok ? "text-muted" : "text-neg"}`}
              >
                · {e.summary}
              </div>
            );
          }
          // error
          const isRetryable = i === lastErrorIdx && !!onRetry;
          return (
            <div
              key={i}
              className="flex items-center justify-between gap-2 rounded border border-neg/40 bg-neg-bg px-2 py-1 text-[12px] text-neg"
            >
              <span>⚠ {e.message}</span>
              {isRetryable && (
                <button
                  type="button"
                  onClick={onRetry}
                  className="cursor-pointer rounded border border-neg/60 bg-transparent px-2 py-0.5 text-[11px] text-neg hover:bg-neg/10"
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
