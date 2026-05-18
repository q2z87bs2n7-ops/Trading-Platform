import { useOrders } from "../data/hooks";

export default function Orders() {
  const { data, error, isPending } = useOrders("all", 25);
  const rows = data?.orders;

  return (
    <div className="panel">
      <h2>Recent Orders</h2>
      {error && <div className="error">{error.message}</div>}
      {!error && isPending && <div className="tag">Loading…</div>}
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
