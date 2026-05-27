import { useState } from "react";

import { useSpeechToText } from "../../hooks/useSpeechToText";
import MicButton from "../MicButton";

interface Props {
  busy: boolean;
  onSend: (text: string) => void;
  onCancel: () => void;
  initialText?: string;
}

const MAX_LEN = 4000;

export default function ChatComposer({ busy, onSend, onCancel }: Props) {
  const [input, setInput] = useState("");
  const [interim, setInterim] = useState("");
  const speech = useSpeechToText({
    onAppend: (delta) => setInput((t) => (t + delta).slice(0, MAX_LEN)),
    onInterim: setInterim,
  });

  function submit() {
    const t = input.trim();
    if (!t || busy) return;
    if (speech.listening) speech.stop();
    setInput("");
    setInterim("");
    onSend(t);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  }

  const overBudget = input.length >= MAX_LEN * 0.9;

  return (
    <div
      className="px-3 py-3"
      style={{ borderTop: "1px solid var(--hairline)" }}
    >
      <div
        className="flex items-end gap-2 px-3 py-2"
        style={{
          background: "var(--panel-2)",
          borderRadius: 999,
          border: "1px solid var(--border)",
        }}
      >
        <label className="sr-only" htmlFor="chartbot-composer">
          Message ChartBot
        </label>
        <textarea
          id="chartbot-composer"
          value={speech.listening && interim ? `${input}${input ? " " : ""}${interim}` : input}
          readOnly={speech.listening}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={speech.listening ? "Listening…" : "Ask the chart…"}
          rows={1}
          maxLength={MAX_LEN}
          disabled={busy}
          className="flex-1 resize-none bg-transparent border-0 outline-none text-[13px]"
          style={{
            color: "var(--text)",
            fontFamily: "var(--font-sans)",
            minHeight: 22,
            maxHeight: 120,
            paddingTop: 4,
            paddingBottom: 4,
          }}
        />
        {speech.supported && !busy && (
          <MicButton
            listening={speech.listening}
            onClick={speech.toggle}
            size={32}
            variant="subtle"
          />
        )}
        {busy ? (
          <button
            type="button"
            onClick={onCancel}
            aria-label="Stop generating"
            className="cursor-pointer border-0 text-[12px] font-medium shrink-0"
            style={{
              background: "var(--panel)",
              color: "var(--text-2)",
              width: 32,
              height: 32,
              borderRadius: 999,
            }}
          >
            ◼
          </button>
        ) : (
          <button
            type="button"
            onClick={submit}
            disabled={!input.trim()}
            aria-label="Send message"
            className="cursor-pointer border-0 text-[14px] font-semibold shrink-0 disabled:cursor-not-allowed"
            style={{
              background:
                "linear-gradient(135deg, var(--cb-accent) 0%, var(--cb-accent-2) 100%)",
              color: "white",
              width: 32,
              height: 32,
              borderRadius: 999,
              opacity: input.trim() ? 1 : 0.4,
            }}
          >
            ↑
          </button>
        )}
      </div>
      <div
        className="mt-1.5 text-right text-[10.5px]"
        style={{ color: overBudget ? "var(--neg)" : "var(--mute)" }}
        aria-live="polite"
      >
        {input.length} / {MAX_LEN}
      </div>
    </div>
  );
}
