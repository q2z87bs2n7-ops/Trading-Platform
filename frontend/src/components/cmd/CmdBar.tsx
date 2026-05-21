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
  // close so each session starts fresh (matches the handoff).
  useEffect(() => {
    if (open) {
      // Allow the modal to mount before focusing.
      const id = setTimeout(() => inputRef.current?.focus(), 30);
      return () => clearTimeout(id);
    }
    setText("");
    setTurns([]);
  }, [open]);

  // ESC closes; Cmd/Ctrl+Enter submits (Enter alone also submits).
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

  // Auto-scroll transcript when a new turn lands.
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
  }

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal
      className="fixed inset-0 z-50 flex flex-col justify-end"
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
          marginBottom: 24,
          maxWidth: 680,
          width: "calc(100% - 32px)",
          maxHeight: "min(80vh, calc(100vh - 48px))",
          background: "var(--panel)",
          borderRadius: "var(--r-xl)",
          boxShadow: "var(--shadow-lg)",
          overflow: "hidden",
          animation: "cmd-up 180ms ease",
        }}
      >
        <style>{`@keyframes cmd-up{from{transform:translateY(20px);opacity:0}to{transform:translateY(0);opacity:1}}`}</style>

        {/* Header: sparkle icon + textarea + ✕ close + Esc kbd */}
        <div
          className="flex items-start gap-3 px-4 py-3"
          style={{ borderBottom: "1px solid var(--hairline)" }}
        >
          <span
            className="text-[18px] mt-1.5"
            style={{ color: "var(--accent)" }}
            aria-hidden
          >
            ✦
          </span>
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
            className="flex-1 resize-none bg-transparent border-0 outline-none text-[15px] py-1.5"
            style={{
              color: "var(--text)",
              fontFamily: "var(--font-sans)",
              minHeight: 24,
              maxHeight: 120,
            }}
          />
          <kbd
            className="font-mono text-[11px] px-1.5 py-0.5 mt-1.5 hidden sm:inline-block"
            style={{
              background: "var(--panel-2)",
              color: "var(--mute)",
              borderRadius: 4,
            }}
          >
            Esc
          </kbd>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="cursor-pointer border-0 text-[14px] grid place-items-center shrink-0"
            style={{
              background: "var(--panel-2)",
              color: "var(--text-2)",
              width: 28,
              height: 28,
              borderRadius: 6,
              marginTop: 1,
            }}
          >
            ✕
          </button>
        </div>

        {/* Body: empty-state suggestions OR transcript */}
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
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
