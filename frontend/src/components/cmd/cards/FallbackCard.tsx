import { useEffect, useState } from "react";

import { postAiAsk, type AiAskResponse } from "../../../api";
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
  const [resp, setResp] = useState<AiAskResponse | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, setPending] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setPending(true);
    setErr(null);
    setResp(null);
    postAiAsk(text)
      .then((r) => {
        if (cancelled) return;
        setResp(r);
        setPending(false);
        onAiResponse?.(r);
      })
      .catch((e: Error) => {
        if (cancelled) return;
        setErr(e.message);
        setPending(false);
      });
    return () => {
      cancelled = true;
    };
  }, [text]);

  return (
    <CmdResultCard title="✦ AI" meta={text || "(empty)"}>
      {pending && (
        <div className="text-[13px]" style={{ color: "var(--mute)" }}>
          Thinking…
        </div>
      )}
      {err && (
        <div
          className="text-[12.5px] px-3 py-2"
          style={{
            background: "var(--neg-bg)",
            color: "var(--neg)",
            borderRadius: 6,
          }}
        >
          {err}
        </div>
      )}
      {resp && (
        <>
          {resp.tool_calls.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-2">
              {resp.tool_calls.map((tc, i) => (
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
          <div
            className="text-[13.5px] whitespace-pre-wrap leading-relaxed"
            style={{ color: "var(--text)" }}
          >
            {resp.text || "(no response)"}
          </div>
          {resp.backend_stopped === "max_iterations" && (
            <div
              className="text-[11.5px] mt-2"
              style={{ color: "var(--mute)" }}
            >
              Stopped after hitting the tool-use iteration cap.
            </div>
          )}
        </>
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
