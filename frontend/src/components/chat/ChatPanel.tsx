/**
 * ChatPanel — right-edge ChartBot shell. Owns collapse state and width;
 * delegates conversation state to useChatSession. Fixed width — drag
 * handle was scoped out of the redesign as gold-plating.
 */

import { useEffect, useState } from "react";
import { useChatSession } from "../../hooks/useChatSession";
import ChatHeader from "./ChatHeader";
import ChatTranscript from "./ChatTranscript";
import ChatComposer from "./ChatComposer";

const COLLAPSED_KEY = "chartbot_collapsed";
const LEGACY_COLLAPSED_KEY = "ai_chat_panel_collapsed";
const PANEL_WIDTH = 400;

function readCollapsed(): boolean {
  const v = localStorage.getItem(COLLAPSED_KEY) ?? localStorage.getItem(LEGACY_COLLAPSED_KEY);
  return v === "1";
}

interface Props {
  symbol: string;
  resolution?: string;
}

export default function ChatPanel({ symbol, resolution = "D" }: Props) {
  const [collapsed, setCollapsed] = useState<boolean>(readCollapsed);
  const session = useChatSession({ symbol, resolution });

  useEffect(() => {
    localStorage.setItem(COLLAPSED_KEY, collapsed ? "1" : "0");
    localStorage.removeItem(LEGACY_COLLAPSED_KEY);
  }, [collapsed]);

  if (collapsed) {
    return (
      <div className="flex h-[calc(100vh-60px)] w-11 items-start justify-center border-l border-border bg-bg pt-3">
        <button
          type="button"
          aria-label="Open ChartBot"
          onClick={() => setCollapsed(false)}
          className="cursor-pointer border-none bg-transparent text-lg text-text-3 hover:text-text"
        >
          ‹
        </button>
      </div>
    );
  }

  return (
    <div
      className="flex h-[calc(100vh-60px)] flex-col border-l border-border bg-bg text-text"
      style={{ width: PANEL_WIDTH }}
    >
      <ChatHeader
        symbol={symbol}
        canClear={!session.busy && session.turns.length > 0}
        onCollapse={() => setCollapsed(true)}
        onClear={session.clear}
      />
      <ChatTranscript
        turns={session.turns}
        busy={session.busy}
        onSuggestion={(text) => void session.send(text)}
        onRetry={session.retryLast}
      />
      <ChatComposer
        busy={session.busy}
        onSend={(text) => void session.send(text)}
        onCancel={session.cancel}
      />
    </div>
  );
}
