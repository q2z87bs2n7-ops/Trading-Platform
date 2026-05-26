/**
 * ChatPanel — right-edge ChartBot shell. Owns collapse state and width;
 * delegates conversation state to useChatSession (unchanged). Calm v2
 * visual refresh: violet accent palette, header brand mark, context
 * pills strip below the header, pill composer with circular send.
 */

import { useEffect, useState } from "react";
import { useChatSession } from "../../hooks/useChatSession";
import { useFirstOpenHint } from "../../hooks/useFirstOpenHint";
import { useMobile } from "../../hooks/useMobile";
import { useSettings } from "../../hooks/useSettings";
import AiDisabledNotice from "../AiDisabledNotice";
import ChatHeader from "./ChatHeader";
import ChatTranscript from "./ChatTranscript";
import ChatComposer from "./ChatComposer";

function ConventionHint({ onDismiss }: { onDismiss: () => void }) {
  return (
    <button
      type="button"
      onClick={onDismiss}
      className="cursor-pointer border-0 bg-transparent text-left"
      style={{
        fontSize: 9.5,
        fontStyle: "italic",
        color: "var(--mute)",
        padding: "0 12px 4px",
      }}
      aria-label="Dismiss tip"
      title="Dismiss"
    >
      <span style={{ color: "var(--cb-accent)", fontStyle: "normal" }}>Violet</span>
      {" — cloud AI · ~3–5 s per turn. "}
      <span style={{ color: "var(--mute)" }}>(tap to hide)</span>
    </button>
  );
}

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
  const hint = useFirstOpenHint("chartbot_convention");
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
          symbol={symbol}
          resolution={resolution}
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
            {hint.show && <ConventionHint onDismiss={hint.dismiss} />}
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
    // Full-height 36 px vertical rail. Reads as a permanent feature of the UI
    // (not a floating widget). Anywhere on the rail expands.
    return (
      <button
        type="button"
        aria-label="Open ChartBot"
        title="Open ChartBot"
        onClick={() => setCollapsed(false)}
        className="flex h-full flex-col items-center justify-between cursor-pointer"
        style={{
          width: 36,
          padding: "12px 0",
          background: "oklch(60% 0.17 290 / 0.18)",
          borderLeft: "1px solid oklch(60% 0.17 290 / 0.4)",
          border: 0,
        }}
      >
        <span
          aria-hidden
          style={{ color: "var(--cb-accent)", fontSize: 17, lineHeight: 1 }}
        >
          ✦
        </span>
        <span
          aria-hidden
          className="font-mono"
          style={{
            fontSize: 10,
            color: "var(--cb-accent)",
            letterSpacing: "0.18em",
            opacity: 0.8,
            whiteSpace: "nowrap",
            writingMode: "vertical-rl",
            transform: "rotate(180deg)",
          }}
        >
          CHARTBOT
        </span>
        <span
          aria-hidden
          style={{ color: "var(--cb-accent)", fontSize: 14, opacity: 0.5 }}
        >
          ‹
        </span>
      </button>
    );
  }

  return (
    <div
      className="flex h-full flex-col min-h-0"
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
        symbol={symbol}
        resolution={resolution}
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
          {hint.show && <ConventionHint onDismiss={hint.dismiss} />}
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
