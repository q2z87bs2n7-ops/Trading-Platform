import { useActivities } from "../data/hooks";
import type { Activity } from "../types";
import ErrorBanner from "./ErrorBanner";
import Pill from "./Pill";

// Activities are heterogeneous; show the type plus a best-effort summary
// of whichever fields Alpaca returned for that activity kind.
function summarize(a: Activity): string {
  const s = (k: string) => (a[k] == null ? "" : String(a[k]));
  if (a.symbol) {
    return `${s("side").toUpperCase()} ${s("qty")} ${s("symbol")} @ ${s("price")}`;
  }
  return s("description") || s("net_amount") || s("date") || "";
}

export default function Activities({ bare = false }: { bare?: boolean }) {
  const { data, error, isPending } = useActivities(25);
  const rows = data?.activities;

  const body = (
    <>
      {error && <ErrorBanner message={error.message} />}
      {!error && isPending && (
        <div className="text-xs text-muted">Loading…</div>
      )}
      {rows && rows.length === 0 && (
        <div className="text-xs text-muted">No activity</div>
      )}
      {rows &&
        rows.map((a, i) => (
          <div
            className="flex justify-between py-1 text-[13px]"
            key={String(a.id ?? i)}
          >
            <Pill status={a.activity_type as string | undefined} tone="neutral" />
            <span className="tabular-nums">{summarize(a)}</span>
          </div>
        ))}
    </>
  );

  if (bare) return body;

  return (
    <div className="bg-panel border border-border rounded-lg p-3">
      <h2 className="text-[13px] uppercase tracking-wide text-muted m-0 mb-2">
        Account Activity
      </h2>
      {body}
    </div>
  );
}
