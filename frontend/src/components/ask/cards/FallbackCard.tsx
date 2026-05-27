import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import {
  postAiAsk,
  type AiAskMessage,
  type AiAskReport,
  type AiAskResponse,
} from "../../../api";
import { qk } from "../../../data/queryClient";
import { useSettings } from "../../../hooks/useSettings";
import type { AssetClass } from "../../../lib/ask-intent";
import { applyWorkspaceActions } from "../../../lib/workspace/controller";
import type { ApplyResult } from "../../../lib/workspace/actions";
import AskResultCard from "../AskResultCard";
import AiDisabledNotice from "../../AiDisabledNotice";
import { WorkspaceResult } from "./WorkspaceCard";

type OnResolved = (resp: AiAskResponse) => void;

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
    <AskResultCard title="Ask anything" meta={text || "(empty)"}>
      <AiDisabledNotice surface="ask" compact />
    </AskResultCard>
  );
}

function AiAskCard({
  text,
  assetClass,
  history = [],
  cachedResp,
  onResolved,
}: {
  text: string;
  assetClass: AssetClass;
  history?: AiAskMessage[];
  cachedResp?: AiAskResponse;
  onResolved?: OnResolved;
}) {
  const [resp, setResp] = useState<AiAskResponse | null>(cachedResp ?? null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, setPending] = useState(!cachedResp);
  const [wsResult, setWsResult] = useState<ApplyResult | null>(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    // Replaying a cached turn — no fetch, no side effects. Workspace
    // actions and watchlist invalidations already fired when the turn
    // originally resolved.
    if (cachedResp) return;
    let cancelled = false;
    setPending(true);
    setErr(null);
    setResp(null);
    setWsResult(null);
    postAiAsk(text, history, assetClass)
      .then((r) => {
        if (cancelled) return;
        setResp(r);
        setPending(false);
        onResolved?.(r);
        // Replay any Workspace directives the bot emitted against the canvas.
        if (r.workspace_actions && r.workspace_actions.length) {
          applyWorkspaceActions(r.workspace_actions).then((res) => {
            if (!cancelled) setWsResult(res);
          });
        }
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
    // history intentionally excluded — submitting a turn freezes its
    // history snapshot; cachedResp toggles only on fresh resolution.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, assetClass, cachedResp]);

  return (
    <AskResultCard title="✦ AI" meta={text || "(empty)"}>
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
          {wsResult && (
            <div className="mt-3">
              <WorkspaceResult result={wsResult} />
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
    </AskResultCard>
  );
}

// Gate the fallback path on the AI setting at render time so toggling
// the setting reflects immediately in the next Ask anything query.
export function FallbackOrAiCard({
  text,
  assetClass,
  history = [],
  cachedResp,
  onResolved,
}: {
  text: string;
  assetClass: AssetClass;
  history?: AiAskMessage[];
  cachedResp?: AiAskResponse;
  onResolved?: OnResolved;
}) {
  const settings = useSettings();
  return settings.askAiEnabled ? (
    <AiAskCard
      text={text}
      assetClass={assetClass}
      history={history}
      cachedResp={cachedResp}
      onResolved={onResolved}
    />
  ) : (
    <FallbackCard text={text} />
  );
}
