/**
 * AIChatPanel — right-edge collapsible chat for TV mode.
 *
 * Mounts as a sibling of TVPlatform inside the `mode === "tv"` branch of
 * App.tsx. Chat history is in-memory only (drawings persist via
 * tv-drawings.ts, but the conversation does not). Send is disabled
 * while a turn is in flight; trim guard keeps history ≤ 40 messages.
 */

import { useEffect, useRef, useState } from "react";
import { runAITurn, type APIMessage, type TurnEvent } from "../lib/ai-client";

interface Props {
  symbol: string;
  resolution?: string;
}

interface RenderedTurn {
  role: "user" | "assistant";
  text: string;
  events: TurnEvent[];
}

const HISTORY_CAP = 40;
const COLLAPSED_KEY = "ai_chat_panel_collapsed";

export default function AIChatPanel({ symbol, resolution = "D" }: Props) {
  const [collapsed, setCollapsed] = useState<boolean>(
    () => localStorage.getItem(COLLAPSED_KEY) === "1",
  );
  const [apiHistory, setApiHistory] = useState<APIMessage[]>([]);
  const [turns, setTurns] = useState<RenderedTurn[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    localStorage.setItem(COLLAPSED_KEY, collapsed ? "1" : "0");
  }, [collapsed]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [turns, busy]);

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    setTurns((prev) => [...prev, { role: "user", text, events: [] }]);
    setBusy(true);

    const trimmed =
      apiHistory.length > HISTORY_CAP
        ? apiHistory.slice(apiHistory.length - HISTORY_CAP)
        : apiHistory;

    try {
      const { events, newHistory } = await runAITurn(trimmed, text, {
        symbol,
        resolution,
      });
      const assistantText = events
        .filter((e) => e.kind === "assistant_text")
        .map((e) => (e.kind === "assistant_text" ? e.text : ""))
        .join("\n\n");
      setTurns((prev) => [
        ...prev,
        { role: "assistant", text: assistantText, events },
      ]);
      setApiHistory(newHistory);
    } finally {
      setBusy(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  }

  if (collapsed) {
    return (
      <div
        style={{
          width: 36,
          height: "calc(100vh - 60px)",
          borderLeft: "1px solid #1f2937",
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "center",
          background: "#0d1117",
          paddingTop: 12,
        }}
      >
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          title="Open AI chat"
          style={{
            background: "transparent",
            color: "#9ca3af",
            border: "none",
            cursor: "pointer",
            fontSize: 18,
          }}
        >
          ‹
        </button>
      </div>
    );
  }

  return (
    <div
      style={{
        width: 360,
        height: "calc(100vh - 60px)",
        borderLeft: "1px solid #1f2937",
        display: "flex",
        flexDirection: "column",
        background: "#0d1117",
        color: "#e5e7eb",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "8px 12px",
          borderBottom: "1px solid #1f2937",
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 600 }}>
          AI chart assistant
          <span style={{ color: "#6b7280", marginLeft: 6, fontWeight: 400 }}>
            · {symbol}
          </span>
        </div>
        <button
          type="button"
          onClick={() => setCollapsed(true)}
          title="Collapse"
          style={{
            background: "transparent",
            color: "#9ca3af",
            border: "none",
            cursor: "pointer",
            fontSize: 16,
          }}
        >
          ›
        </button>
      </div>

      <div
        ref={scrollRef}
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "8px 12px",
          fontSize: 13,
          lineHeight: 1.5,
        }}
      >
        {turns.length === 0 && (
          <div style={{ color: "#6b7280", marginTop: 8 }}>
            Ask me to annotate the chart. Examples:
            <ul style={{ marginTop: 6, paddingLeft: 18 }}>
              <li>"Draw a horizontal line at the current price"</li>
              <li>"Mark the last swing high on the 1H"</li>
              <li>"Add the 50 and 200 SMA"</li>
              <li>"What's my AAPL position size?"</li>
            </ul>
          </div>
        )}
        {turns.map((t, i) => (
          <div key={i} style={{ marginBottom: 12 }}>
            <div
              style={{
                color: t.role === "user" ? "#60a5fa" : "#a7f3d0",
                fontSize: 11,
                textTransform: "uppercase",
                letterSpacing: 0.5,
                marginBottom: 2,
              }}
            >
              {t.role}
            </div>
            {t.text && (
              <div style={{ whiteSpace: "pre-wrap" }}>{t.text}</div>
            )}
            {t.events
              .filter((e) => e.kind === "tool_call" || e.kind === "error")
              .map((e, j) => (
                <div
                  key={j}
                  style={{
                    fontSize: 11,
                    color: e.kind === "error" ? "#f87171" : "#9ca3af",
                    marginTop: 2,
                  }}
                >
                  {e.kind === "error" ? `⚠ ${e.message}` : `· ${e.summary}`}
                </div>
              ))}
          </div>
        ))}
        {busy && (
          <div style={{ color: "#6b7280", fontStyle: "italic" }}>thinking…</div>
        )}
      </div>

      <div
        style={{
          borderTop: "1px solid #1f2937",
          padding: 8,
          display: "flex",
          gap: 6,
        }}
      >
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Ask the chart…"
          rows={2}
          maxLength={4000}
          disabled={busy}
          style={{
            flex: 1,
            background: "#111827",
            color: "#e5e7eb",
            border: "1px solid #1f2937",
            borderRadius: 4,
            padding: 6,
            fontSize: 13,
            resize: "none",
            fontFamily: "inherit",
          }}
        />
        <button
          type="button"
          onClick={() => void send()}
          disabled={busy || !input.trim()}
          style={{
            background: "#1f2937",
            color: "#e5e7eb",
            border: "1px solid #374151",
            borderRadius: 4,
            padding: "0 12px",
            cursor: busy || !input.trim() ? "not-allowed" : "pointer",
            opacity: busy || !input.trim() ? 0.5 : 1,
          }}
        >
          Send
        </button>
      </div>
    </div>
  );
}
