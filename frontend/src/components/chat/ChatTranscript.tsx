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

export default function ChatTranscript({ turns, busy, onSuggestion, onRetry }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.scrollTo({ top: ref.current.scrollHeight });
  }, [turns, busy]);

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
    </div>
  );
}
