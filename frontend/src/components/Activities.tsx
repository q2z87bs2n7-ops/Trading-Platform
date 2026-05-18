import { useEffect, useState } from "react";
import { getActivities } from "../api";
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
  const [rows, setRows] = useState<Activity[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () =>
      getActivities(25)
        .then((d) => alive && (setRows(d.activities), setErr(null)))
        .catch((e) => alive && setErr(e.message));
    load();
    const id = setInterval(load, 30000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  return (
    <div className="panel">
      <h2>Account Activity</h2>
      {err && <div className="error">{err}</div>}
      {!rows && !err && <div className="tag">Loading…</div>}
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
