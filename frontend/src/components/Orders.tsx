import { useEffect, useState } from "react";
import { getOrders } from "../api";
import type { Order } from "../types";

export default function Orders() {
  const [rows, setRows] = useState<Order[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () =>
      getOrders("all", 25)
        .then((d) => alive && (setRows(d.orders), setErr(null)))
        .catch((e) => alive && setErr(e.message));
    load();
    const id = setInterval(load, 20000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  return (
    <div className="panel">
      <h2>Recent Orders</h2>
      {err && <div className="error">{err}</div>}
      {!rows && !err && <div className="tag">Loading…</div>}
      {rows && rows.length === 0 && <div className="tag">No orders</div>}
      {rows &&
        rows.map((o) => (
          <div className="row" key={o.id}>
            <span className="label">
              {o.side.toUpperCase()} {o.qty ?? ""} {o.symbol} · {o.type}
            </span>
            <span className="tag">{o.status}</span>
          </div>
        ))}
    </div>
  );
}
