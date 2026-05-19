import { useActivities } from "../data/hooks";
import type { Activity } from "../types";

// Activities are heterogeneous; show the type plus a best-effort summary
// of whichever fields Alpaca returned for that activity kind.
function summarize(a: Activity): string {
  const s = (k: string) => (a[k] == null ? "" : String(a[k]));
  if (a.symbol) {
    return `${s("side").toUpperCase()} ${s("qty")} ${s("symbol")} @ ${s("price")}`;
  }
  return s("description") || s("net_amount") || s("date") || "";
}

export default function Activities() {
  const { data, error, isPending } = useActivities(25);
  const rows = data?.activities;

  return (
    <div className="bg-panel border border-border rounded-lg p-4">
      <h2 className="text-[13px] uppercase tracking-wide text-muted m-0 mb-3">
        Account Activity
      </h2>
      {error && <div className="text-red text-[13px]">{error.message}</div>}
      {!error && isPending && <div className="text-xs text-muted">Loading…</div>}
      {rows && rows.length === 0 && (
        <div className="text-xs text-muted">No activity</div>
      )}
      {rows &&
        rows.map((a, i) => (
          <div
            className="flex justify-between py-1.5 text-sm"
            key={String(a.id ?? i)}
          >
            <span className="text-muted">{String(a.activity_type ?? "—")}</span>
            <span className="tabular-nums">{summarize(a)}</span>
          </div>
        ))}
    </div>
  );
}
