import { useEffect, useState } from "react";

import {
  streamAiAsk,
  type AiAskResponse,
  type AiAskToolCall,
} from "../../../api";
import { useSettings } from "../../../hooks/useSettings";
import CmdResultCard from "../CmdResultCard";

type OnAiResponse = (resp: AiAskResponse) => void;

function FallbackCard({ text }: { text: string }) {
  return (
    <CmdResultCard title="No match for that phrase" meta={text || "(empty)"}>
      <div className="text-[13px]" style={{ color: "var(--text-2)" }}>
        Ask anything only knows a handful of shortcuts when AI is off.
        Open the settings menu (top-right) to enable the AI fallback,
        or try one of the recognised phrases:
      </div>
      <ul
        className="mt-2 flex flex-col gap-1 text-[12.5px]"
        style={{ color: "var(--mute)" }}
      >
        <li>· "buy 50 AMD at market"</li>
        <li>· "how's NVDA?"</li>
        <li>· "show top gainers"</li>
        <li>· "news on Tesla"</li>
        <li>· "close my TSLA position"</li>
      </ul>
    </CmdResultCard>
  );
}

function AiAskCard({ text, onAiResponse }: { text: string; onAiResponse?: OnAiResponse }) {
  const [displayText, setDisplayText] = useState("");
  const [toolCalls, setToolCalls] = useState<AiAskToolCall[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [isDone, setIsDone] = useState(false);
  const [backendStopped, setBackendStopped] = useState<"" | "max_iterations">("");

  useEffect(() => {
    const controller = new AbortController();
    setDisplayText("");
    setToolCalls([]);
    setErr(null);
    setIsDone(false);
    setBackendStopped("");

    let accText = "";
    const accCalls: AiAskToolCall[] = [];

    (async () => {
      try {
        for await (const event of streamAiAsk(text, [], controller.signal)) {
          if (event.type === "text") {
            accText += event.delta;
            setDisplayText(accText);
          } else if (event.type === "tool_call") {
            accCalls.push({ name: event.name, ok: event.ok });
            setToolCalls([...accCalls]);
          } else if (event.type === "done") {
            setBackendStopped(event.backend_stopped);
            setIsDone(true);
            onAiResponse?.({
              text: accText,
              tool_calls: accCalls,
              usage: null,
              backend_stopped: event.backend_stopped,
            });
          } else if (event.type === "error") {
            setErr(event.message);
          }
        }
      } catch (e) {
        if ((e as Error).name !== "AbortError") setErr((e as Error).message);
      } finally {
        setIsDone(true);
      }
    })();

    return () => controller.abort();
  }, [text]);

  const pending = !displayText && toolCalls.length === 0 && !err;

  return (
    <CmdResultCard title="✦ AI" meta={text || "(empty)"}>
      {pending && (
        <div className="text-[13px]" style={{ color: "var(--mute)" }}>
          Thinking…
        </div>
      )}
      {toolCalls.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {toolCalls.map((tc, i) => (
            <span
              key={i}
              className="font-mono text-[10.5px] px-1.5 py-0.5"
              style={{
                background: tc.ok ? "var(--accent-bg)" : "var(--neg-bg)",
                color: tc.ok ? "var(--accent)" : "var(--neg)",
                borderRadius: 4,
              }}
            >
              {tc.ok ? "✓" : "✕"} {tc.name}
            </span>
          ))}
        </div>
      )}
      {err && (
        <div
          className="text-[12.5px] px-3 py-2"
          style={{ background: "var(--neg-bg)", color: "var(--neg)", borderRadius: 6 }}
        >
          {err}
        </div>
      )}
      {displayText && (
        <div
          className="text-[13.5px] whitespace-pre-wrap leading-relaxed"
          style={{ color: "var(--text)" }}
        >
          {displayText}
          {!isDone && <span className="opacity-50 animate-pulse">▌</span>}
        </div>
      )}
      {backendStopped === "max_iterations" && (
        <div className="text-[11.5px] mt-2" style={{ color: "var(--mute)" }}>
          Stopped after hitting the tool-use iteration cap.
        </div>
      )}
    </CmdResultCard>
  );
}

// Gate the fallback path on the AI setting at render time so toggling
// the setting reflects immediately in the next Ask anything query.
export function FallbackOrAiCard({ text, onAiResponse }: { text: string; onAiResponse?: OnAiResponse }) {
  const settings = useSettings();
  return settings.cmdbarAiEnabled ? (
    <AiAskCard text={text} onAiResponse={onAiResponse} />
  ) : (
    <FallbackCard text={text} />
  );
}
