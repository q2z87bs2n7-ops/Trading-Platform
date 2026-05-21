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

const LEGACY_COLLAPSED_KEY = "ai_chat_panel_collapsed";
const STALE_COLLAPSED_KEY = "chartbot_collapsed";
const PANEL_WIDTH = 380;

interface Props {
  symbol: string;
  resolution?: string;
}

export default function ChatPanel({ symbol, resolution = "D" }: Props) {
  // Always start expanded — user can collapse mid-session but it
  // re-opens on every Chart-mode mount. The two prior collapse keys
  // are removed on first mount so old "1" values can't drag the panel
  // back closed.
  const [collapsed, setCollapsed] = useState(false);
  const session = useChatSession({ symbol, resolution });

  useEffect(() => {
    localStorage.removeItem(LEGACY_COLLAPSED_KEY);
    localStorage.removeItem(STALE_COLLAPSED_KEY);
  }, []);

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
      className="flex h-[calc(100vh-60px)] flex-col min-h-0"
      style={{
        width: "min(380px, 100vw)",
        maxWidth: PANEL_WIDTH,
        background: "var(--panel)",
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
      {/* Transcript flex-grows to fill the gap; composer is always the
         last child and so always pinned at the bottom of the panel. */}
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
