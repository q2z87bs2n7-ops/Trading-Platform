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
    <div className="panel">
      <h2>Account Activity</h2>
      {error && <div className="error">{error.message}</div>}
      {!error && isPending && <div className="tag">Loading…</div>}
      {rows && rows.length === 0 && <div className="tag">No activity</div>}
      {rows &&
        rows.map((a, i) => (
          <div className="row" key={String(a.id ?? i)}>
            <span className="label">{String(a.activity_type ?? "—")}</span>
            <span className="price">{summarize(a)}</span>
          </div>
        ))}
    </div>
  );
}
