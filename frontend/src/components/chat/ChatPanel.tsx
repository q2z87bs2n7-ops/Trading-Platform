/**
 * ChatPanel — right-edge ChartBot shell. Owns collapse state and width;
 * delegates conversation state to useChatSession (unchanged). Calm v2
 * visual refresh: violet accent palette, header brand mark, context
 * pills strip below the header, pill composer with circular send.
 */

import { useEffect, useState } from "react";
import { useChatSession } from "../../hooks/useChatSession";
import ChatHeader from "./ChatHeader";
import ChatContextPills from "./ChatContextPills";
import ChatTranscript from "./ChatTranscript";
import ChatComposer from "./ChatComposer";

const COLLAPSED_KEY = "chartbot_collapsed";
const LEGACY_COLLAPSED_KEY = "ai_chat_panel_collapsed";
const PANEL_WIDTH = 380;

// Default open — only collapsed if the user explicitly closed it.
function readCollapsed(): boolean {
  const v =
    localStorage.getItem(COLLAPSED_KEY) ??
    localStorage.getItem(LEGACY_COLLAPSED_KEY);
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
      <div
        className="flex h-[calc(100vh-60px)] w-11 items-start justify-center pt-3"
        style={{
          background:
            "linear-gradient(180deg, var(--cb-accent-soft) 0%, var(--bg) 100%)",
          borderLeft: "1px solid var(--border)",
        }}
      >
        <button
          type="button"
          aria-label="Open ChartBot"
          onClick={() => setCollapsed(false)}
          className="cursor-pointer border-0 bg-transparent text-[18px]"
          style={{ color: "var(--cb-accent)" }}
          title="Open ChartBot"
        >
          ✦
        </button>
      </div>
    );
  }

  return (
    <div
      className="flex h-[calc(100vh-60px)] flex-col"
      style={{
        width: "min(380px, 100vw)",
        maxWidth: PANEL_WIDTH,
        background: "var(--bg)",
        color: "var(--text)",
        borderLeft: "1px solid var(--border)",
      }}
    >
      <ChatHeader
        canClear={!session.busy && session.turns.length > 0}
        onCollapse={() => setCollapsed(true)}
        onClear={session.clear}
      />
      <ChatContextPills symbol={symbol} />
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
