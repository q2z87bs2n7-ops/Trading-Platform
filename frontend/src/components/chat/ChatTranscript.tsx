import { useEffect, useRef } from "react";
import type { RenderedTurn } from "../../hooks/useChatSession";
import ChatMessage from "./ChatMessage";
import ChatEmptyState from "./ChatEmptyState";

interface Props {
  turns: RenderedTurn[];
  busy: boolean;
  onSuggestion: (text: string) => void;
  onRetry: () => void;
}

// Compact next-question prompts shown after each completed ChartBot
// reply. Subset of the empty-state list — short, chart-action focused,
// keeps the surface from going dead between turns.
const FOLLOWUPS = [
  "What's the trend?",
  "Add 50 + 200 SMA",
  "Where to place stops",
  "Switch to 4h",
];

function ChatFollowups({ onPick }: { onPick: (text: string) => void }) {
  return (
    <div className="mt-3 mb-1">
      <div
        className="text-[10.5px] uppercase mb-1.5"
        style={{ color: "var(--mute)", letterSpacing: "0.04em" }}
      >
        Try next
      </div>
      <div
        className="flex gap-1.5 overflow-x-auto pb-1"
        style={{ scrollbarWidth: "none" }}
      >
        {FOLLOWUPS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => onPick(s)}
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
  );
}

export default function ChatTranscript({
  turns,
  busy,
  onSuggestion,
  onRetry,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.scrollTo({ top: ref.current.scrollHeight });
  }, [turns, busy]);

  const showFollowups =
    !busy && turns.length > 0 && turns[turns.length - 1]?.role === "assistant";

  return (
    <div
      ref={ref}
      className="flex-1 overflow-y-auto px-3 py-2 text-[14px] leading-relaxed"
    >
      {turns.length === 0 ? (
        <ChatEmptyState onPick={onSuggestion} />
      ) : (
        turns.map((t, i) => (
          <ChatMessage
            key={i}
            turn={t}
            isLastTurn={!busy && i === turns.length - 1}
            onRetry={onRetry}
          />
        ))
      )}
      {busy && <div className="italic text-muted">thinking…</div>}
      {showFollowups && <ChatFollowups onPick={onSuggestion} />}
    </div>
  );
}
