import { useEffect, useRef, useState } from "react";

import { parseIntent, type Intent } from "../../lib/cmd-intent";
import { CmdResult } from "./cards";

interface Turn {
  id: number;
  query: string;
  intent: Intent;
}

const SUGGESTIONS = [
  "What changed today?",
  "Buy 50 AMD at market",
  "How's NVDA?",
  "Show me top gainers",
  "News on Tesla",
  "Close my TSLA position",
];

// Compact next-question prompts shown after each completed turn. Same
// vocabulary as the empty state, trimmed to four so the row scrolls
// horizontally inside the modal width without taking the full screen.
const FOLLOWUPS = [
  "What changed today?",
  "Top gainers",
  "Open orders",
  "Portfolio",
];

interface Props {
  open: boolean;
  onClose: () => void;
  onOpenInWorkspace: (symbol: string) => void;
}

export default function CmdBar({ open, onClose, onOpenInWorkspace }: Props) {
  const [text, setText] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const counter = useRef(0);

  // Focus the textarea each time the modal opens; clear transcript on
  // close so each session starts fresh.
  useEffect(() => {
    if (open) {
      const id = setTimeout(() => inputRef.current?.focus(), 30);
      return () => clearTimeout(id);
    }
    setText("");
    setTurns([]);
  }, [open]);

  // ESC closes.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Lock body scroll while open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Auto-scroll transcript when a new turn lands so the latest answer
  // sits just above the composer.
  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [turns.length]);

  function submit(value: string) {
    const trimmed = value.trim();
    if (!trimmed) return;
    counter.current += 1;
    setTurns((t) => [
      ...t,
      { id: counter.current, query: trimmed, intent: parseIntent(trimmed) },
    ]);
    setText("");
    // Refocus so the user can keep typing follow-ups without re-clicking.
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal
      className="fixed inset-0 z-50"
      style={{
        background: "rgba(20, 22, 28, 0.45)",
        backdropFilter: "blur(4px)",
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="mx-auto flex flex-col"
        style={{
          marginTop: "10vh",
          maxWidth: 680,
          width: "calc(100% - 32px)",
          maxHeight: "80vh",
          background: "var(--panel)",
          borderRadius: "var(--r-xl)",
          boxShadow: "var(--shadow-lg)",
          overflow: "hidden",
          animation: "cmd-up 180ms ease",
        }}
      >
        <style>{`@keyframes cmd-up{from{transform:translateY(-20px);opacity:0}to{transform:translateY(0);opacity:1}}`}</style>

        {/* Header — sparkle brand + close. Keeps a small top frame around
           the transcript without putting input controls up here. */}
        <div
          className="flex items-center gap-2 px-4 py-2.5"
          style={{ borderBottom: "1px solid var(--hairline)" }}
        >
          <span
            className="text-[16px]"
            style={{ color: "var(--accent)" }}
            aria-hidden
          >
            ✦
          </span>
          <span
            className="text-[12px] font-semibold uppercase"
            style={{ color: "var(--mute)", letterSpacing: "0.06em" }}
          >
            Ask anything
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="ml-auto cursor-pointer border-0 text-[14px] grid place-items-center"
            style={{
              background: "var(--panel-2)",
              color: "var(--text-2)",
              width: 28,
              height: 28,
              borderRadius: 6,
            }}
          >
            ✕
          </button>
        </div>

        {/* Transcript / empty state — fills the middle and scrolls. */}
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto px-4 py-4"
          style={{ background: "var(--bg)" }}
        >
          {turns.length === 0 ? (
            <div>
              <div
                className="text-[11px] uppercase mb-3"
                style={{ color: "var(--mute)", letterSpacing: "0.04em" }}
              >
                Try
              </div>
              <div className="flex flex-wrap gap-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => submit(s)}
                    className="text-[13px] cursor-pointer transition-colors"
                    style={{
                      padding: "8px 12px",
                      background: "var(--panel)",
                      border: "1px solid var(--border)",
                      color: "var(--text-2)",
                      borderRadius: "var(--r)",
                    }}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {turns.map((turn) => (
                <div key={turn.id} className="flex flex-col gap-2">
                  <div
                    className="self-end max-w-[80%] text-[13.5px] px-3 py-1.5"
                    style={{
                      background: "var(--accent-bg)",
                      color: "var(--accent-2)",
                      border: "1px solid var(--accent)",
                      borderRadius: "var(--r)",
                      borderBottomRightRadius: 4,
                    }}
                  >
                    {turn.query}
                  </div>
                  <CmdResult
                    intent={turn.intent}
                    onClose={onClose}
                    onOpenInWorkspace={(sym) => {
                      onOpenInWorkspace(sym);
                      onClose();
                    }}
                  />
                </div>
              ))}
              {/* Follow-up prompts after the last result — same idea as
                 the empty-state chips, smaller so they don't crowd the
                 reply above. */}
              <div>
                <div
                  className="text-[10.5px] uppercase mb-1.5"
                  style={{
                    color: "var(--mute)",
                    letterSpacing: "0.04em",
                  }}
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
                      onClick={() => submit(s)}
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
            </div>
          )}
        </div>

        {/* Composer — pinned at the bottom of the modal. Enter submits;
           Shift+Enter inserts a newline. */}
        <div
          className="flex items-end gap-2 px-4 py-3"
          style={{ borderTop: "1px solid var(--hairline)" }}
        >
          <textarea
            ref={inputRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit(text);
              }
            }}
            placeholder="Ask anything — orders, portfolio, news, charts…"
            rows={1}
            className="flex-1 resize-none bg-transparent outline-none text-[15px]"
            style={{
              background: "var(--panel-2)",
              border: "1px solid var(--border)",
              borderRadius: "var(--r)",
              color: "var(--text)",
              fontFamily: "var(--font-sans)",
              minHeight: 36,
              maxHeight: 120,
              padding: "8px 10px",
            }}
          />
          <button
            type="button"
            onClick={() => submit(text)}
            disabled={!text.trim()}
            aria-label="Send"
            className="cursor-pointer border-0 font-semibold disabled:cursor-not-allowed"
            style={{
              background: "var(--accent)",
              color: "white",
              padding: "0 14px",
              height: 36,
              borderRadius: "var(--r)",
              opacity: text.trim() ? 1 : 0.5,
              fontSize: 13,
            }}
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
