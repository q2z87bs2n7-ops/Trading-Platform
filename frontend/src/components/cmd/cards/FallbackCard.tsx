import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { postAiAsk, type AiAskReport, type AiAskResponse } from "../../../api";
import { qk } from "../../../data/queryClient";
import { useSettings } from "../../../hooks/useSettings";
import type { AssetClass } from "../../../lib/cmd-intent";
import CmdResultCard from "../CmdResultCard";

type OnAiResponse = (resp: AiAskResponse) => void;

function downloadCsv(report: AiAskReport) {
  const blob = new Blob([report.csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = report.filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

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

function AiAskCard({
  text,
  assetClass,
  onAiResponse,
}: {
  text: string;
  assetClass: AssetClass;
  onAiResponse?: OnAiResponse;
}) {
  const [resp, setResp] = useState<AiAskResponse | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, setPending] = useState(true);
  const queryClient = useQueryClient();

  useEffect(() => {
    let cancelled = false;
    setPending(true);
    setErr(null);
    setResp(null);
    postAiAsk(text, [], assetClass)
      .then((r) => {
        if (cancelled) return;
        setResp(r);
        setPending(false);
        onAiResponse?.(r);
        // The bot may have mutated the watchlist server-side; refresh both
        // lists so the Discover view reflects it.
        if (
          r.tool_calls.some(
            (t) =>
              t.ok &&
              (t.name === "add_to_watchlist" || t.name === "remove_from_watchlist"),
          )
        ) {
          queryClient.invalidateQueries({ queryKey: qk.watchlist });
          queryClient.invalidateQueries({ queryKey: qk.cryptoWatchlist });
        }
      })
      .catch((e: Error) => {
        if (cancelled) return;
        setErr(e.message);
        setPending(false);
      });
    return () => {
      cancelled = true;
    };
  }, [text, assetClass]);

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
          {resp.reports && resp.reports.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-3">
              {resp.reports.map((r) => (
                <button
                  key={r.filename}
                  type="button"
                  onClick={() => downloadCsv(r)}
                  className="text-[12.5px] font-medium cursor-pointer"
                  style={{
                    padding: "6px 12px",
                    background: "var(--accent-bg)",
                    color: "var(--accent)",
                    border: "1px solid var(--accent)",
                    borderRadius: "var(--r)",
                  }}
                >
                  ↓ {r.filename}
                </button>
              ))}
            </div>
          )}
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
export function FallbackOrAiCard({
  text,
  assetClass,
  onAiResponse,
}: {
  text: string;
  assetClass: AssetClass;
  onAiResponse?: OnAiResponse;
}) {
  const settings = useSettings();
  return settings.cmdbarAiEnabled ? (
    <AiAskCard text={text} assetClass={assetClass} onAiResponse={onAiResponse} />
  ) : (
    <FallbackCard text={text} />
  );
}
