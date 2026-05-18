import { useEffect, useState } from "react";
import { getClock } from "../api";
import type { MarketClock as Clock } from "../types";

const when = (ts: number) => new Date(ts * 1000).toLocaleString();

export default function MarketClock() {
  const [c, setC] = useState<Clock | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () =>
      getClock()
        .then((d) => alive && (setC(d), setErr(null)))
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
      <h2>Market</h2>
      {err && <div className="error">{err}</div>}
      {!c && !err && <div className="tag">Loading…</div>}
      {c && (
        <>
          <div className="row">
            <span className="label">Status</span>
            <span
              className="price"
              style={{ color: c.is_open ? "var(--green)" : "var(--red)" }}
            >
              {c.is_open ? "OPEN" : "CLOSED"}
            </span>
          </div>
          <div className="row">
            <span className="label">Next Open</span>
            <span className="tag">{when(c.next_open)}</span>
          </div>
          <div className="row">
            <span className="label">Next Close</span>
            <span className="tag">{when(c.next_close)}</span>
          </div>
        </>
      )}
    </div>
  );
}
