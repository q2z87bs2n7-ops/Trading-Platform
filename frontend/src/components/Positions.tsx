import { useEffect, useState } from "react";
import { getPositions } from "../api";
import type { Position } from "../types";

const money = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD" });
const pct = (n: number) => `${(n * 100).toFixed(2)}%`;

export default function Positions() {
  const [rows, setRows] = useState<Position[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () =>
      getPositions()
        .then((d) => alive && (setRows(d.positions), setErr(null)))
        .catch((e) => alive && setErr(e.message));
    load();
    const id = setInterval(load, 15000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  return (
    <div className="panel">
      <h2>Open Positions</h2>
      {err && <div className="error">{err}</div>}
      {!rows && !err && <div className="tag">Loading…</div>}
      {rows && rows.length === 0 && <div className="tag">No open positions</div>}
      {rows &&
        rows.map((p) => {
          const up = p.unrealized_pl >= 0;
          return (
            <div className="row" key={p.symbol}>
              <span className="label">
                {p.symbol} · {p.qty} @ {money(p.avg_entry_price)}
              </span>
              <span
                className="price"
                style={{ color: up ? "var(--green)" : "var(--red)" }}
              >
                {money(p.market_value)} ({up ? "+" : ""}
                {money(p.unrealized_pl)} / {pct(p.unrealized_plpc)})
              </span>
            </div>
          );
        })}
    </div>
  );
}
