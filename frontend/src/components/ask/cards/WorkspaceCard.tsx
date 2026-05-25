import { useEffect, useState } from "react";

import AskResultCard from "../AskResultCard";
import { applyWorkspaceActions } from "../../../lib/workspace/controller";
import type { ApplyResult, SiloedAction } from "../../../lib/workspace/actions";

// Shared renderer for an applied set of Workspace directives — reused by the
// AI FallbackCard (when the bot emits workspace_actions) and the local
// deterministic WorkspaceCard.
export function WorkspaceResult({ result }: { result: ApplyResult }) {
  if (!result.ok) {
    return (
      <div
        className="text-[12.5px] px-3 py-2"
        style={{ background: "var(--neg-bg)", color: "var(--neg)", borderRadius: 6 }}
      >
        {result.error ?? "Couldn't update the workspace."}
      </div>
    );
  }
  if (result.applied.length === 0) {
    return (
      <div className="text-[12.5px]" style={{ color: "var(--mute)" }}>
        Nothing to change.
      </div>
    );
  }
  return (
    <ul
      className="flex flex-col gap-1 text-[12.5px]"
      style={{ color: "var(--text-2)" }}
    >
      {result.applied.map((line, i) => (
        <li key={i}>✓ {line}</li>
      ))}
    </ul>
  );
}

export function WorkspaceCard({ actions }: { actions: SiloedAction[] }) {
  const [result, setResult] = useState<ApplyResult | null>(null);

  useEffect(() => {
    let cancelled = false;
    applyWorkspaceActions(actions).then((r) => {
      if (!cancelled) setResult(r);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <AskResultCard title="Workspace">
      {result ? (
        <WorkspaceResult result={result} />
      ) : (
        <div className="text-[13px]" style={{ color: "var(--mute)" }}>
          Updating workspace…
        </div>
      )}
    </AskResultCard>
  );
}
