/**
 * ChatPanel — right-edge ChartBot shell. Owns collapse state and width;
 * delegates conversation state to useChatSession (unchanged). Calm v2
 * visual refresh: violet accent palette, header brand mark, context
 * pills strip below the header, pill composer with circular send.
 */

import { useEffect, useState } from "react";
import { useChatSession } from "../../hooks/useChatSession";
import { useMobile } from "../../hooks/useMobile";
import { useSettings } from "../../hooks/useSettings";
import AiDisabledNotice from "../AiDisabledNotice";
import ChatHeader from "./ChatHeader";
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
  const isMobile = useMobile();
  const enabled = useSettings().chartbotEnabled;
  // Always start expanded — user can collapse mid-session but it
  // re-opens on every Chart-mode mount. The two prior collapse keys
  // are removed on first mount so old "1" values can't drag the panel
  // back closed.
  const [collapsed, setCollapsed] = useState(false);
  // Mobile-only: the panel is a slide-up sheet, closed by default and
  // opened from the floating violet launcher.
  const [open, setOpen] = useState(false);
  const session = useChatSession({ symbol, resolution });

  useEffect(() => {
    localStorage.removeItem(LEGACY_COLLAPSED_KEY);
    localStorage.removeItem(STALE_COLLAPSED_KEY);
  }, []);

  // ── Mobile: floating launcher + slide-up sheet ──
  if (isMobile) {
    if (!open) {
      return (
        <button
          type="button"
          aria-label="Open ChartBot"
          title="ChartBot"
          onClick={() => setOpen(true)}
          style={{
            position: "fixed",
            left: 16,
            bottom: "calc(var(--safe-bottom) + 16px)",
            zIndex: 40,
            width: 48,
            height: 48,
            borderRadius: 999,
            background: "var(--cb-accent)",
            color: "#fff",
            border: 0,
            fontSize: 20,
            boxShadow: "var(--shadow-lg)",
            cursor: "pointer",
          }}
        >
          ✦
        </button>
      );
    }
    return (
      <div
        style={{
          position: "fixed",
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 45,
          background: "var(--panel)",
          color: "var(--text)",
          borderTopLeftRadius: 18,
          borderTopRightRadius: 18,
          boxShadow: "0 -8px 24px rgba(20,22,28,0.18)",
          maxHeight: "62vh",
          paddingBottom: "var(--safe-bottom)",
          display: "flex",
          flexDirection: "column",
          animation: "mob-sheet-in 200ms ease",
        }}
      >
        <button
          type="button"
          aria-label="Close ChartBot"
          onClick={() => setOpen(false)}
          style={{
            display: "flex",
            justifyContent: "center",
            padding: "8px 0 4px",
            background: "transparent",
            border: 0,
            cursor: "pointer",
          }}
        >
          <span
            style={{ width: 36, height: 4, borderRadius: 99, background: "var(--border-2)" }}
          />
        </button>
        <ChatHeader
          canClear={enabled && !session.busy && session.turns.length > 0}
          onCollapse={() => setOpen(false)}
          onClear={session.clear}
        />
        {enabled ? (
          <>
            <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
              <ChatTranscript
                turns={session.turns}
                busy={session.busy}
                onSuggestion={(text) => void session.send(text)}
                onRetry={session.retryLast}
              />
            </div>
            <ChatComposer
              busy={session.busy}
              onSend={(text) => void session.send(text)}
              onCancel={session.cancel}
            />
          </>
        ) : (
          <div style={{ flex: 1, minHeight: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <AiDisabledNotice surface="chartbot" accent="var(--cb-accent)" />
          </div>
        )}
        <style>{`@keyframes mob-sheet-in { from { transform: translateY(100%) } to { transform: none } }`}</style>
      </div>
    );
  }

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
        canClear={enabled && !session.busy && session.turns.length > 0}
        onCollapse={() => setCollapsed(true)}
        onClear={session.clear}
      />
      {enabled ? (
        <>
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
        </>
      ) : (
        <div style={{ flex: 1, minHeight: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <AiDisabledNotice surface="chartbot" accent="var(--cb-accent)" />
        </div>
      )}
    </div>
  );
}
