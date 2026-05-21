import { useState } from "react";

interface Props {
  busy: boolean;
  onSend: (text: string) => void;
  onCancel: () => void;
  initialText?: string;
}

const MAX_LEN = 4000;

export default function ChatComposer({ busy, onSend, onCancel }: Props) {
  const [input, setInput] = useState("");

  function submit() {
    const t = input.trim();
    if (!t || busy) return;
    setInput("");
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
    <div className="border-t border-border p-2">
      <div className="flex gap-1.5">
        <label className="sr-only" htmlFor="chartbot-composer">
          Message ChartBot
        </label>
        <textarea
          id="chartbot-composer"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Ask the chart…"
          rows={2}
          maxLength={MAX_LEN}
          disabled={busy}
          className="flex-1 resize-none rounded border border-border bg-panel-2 px-2 py-1.5 text-[13px] text-text focus:outline-none"
        />
        {busy ? (
          <button
            type="button"
            onClick={onCancel}
            aria-label="Stop generating"
            className="cursor-pointer rounded border border-border-strong bg-panel px-3 text-text"
          >
            Stop
          </button>
        ) : (
          <button
            type="button"
            onClick={submit}
            disabled={!input.trim()}
            aria-label="Send message"
            className="cursor-pointer rounded border border-border-strong bg-panel px-3 text-text disabled:cursor-not-allowed disabled:opacity-50"
          >
            Send
          </button>
        )}
      </div>
      <div
        className={`mt-1 text-right text-[11px] ${overBudget ? "text-neg" : "text-muted"}`}
        aria-live="polite"
      >
        {input.length} / {MAX_LEN}
      </div>
    </div>
  );
}
