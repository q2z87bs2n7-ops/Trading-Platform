import { useState } from "react";

import {
  useCancelAllOrders,
  useCancelOrder,
  useOrders,
  useReplaceOrder,
} from "../data/hooks";
import type { Order } from "../types";

// Statuses past which an order can no longer be cancelled/replaced.
const TERMINAL = new Set([
  "filled",
  "canceled",
  "cancelled",
  "expired",
  "rejected",
  "done_for_day",
  "replaced",
]);
const live = (o: Order) => !TERMINAL.has(o.status.toLowerCase());

const STATUSES = ["all", "open", "closed"] as const;
type StatusFilter = (typeof STATUSES)[number];

// Alpaca enum strings can arrive as either "gtc" or "TimeInForce.GTC";
// keep only the tail and normalise case.
const enumTail = (s: string) => s.split(".").pop()!.toLowerCase();

const money = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD" });

// Best available per-share price to value the order: actual fill, else
// the limit, else the stop. Returns null for a pure market order with no
// fill yet (no meaningful number to show).
function orderValue(o: Order): number | null {
  const px = o.filled_avg_price ?? o.limit_price ?? o.stop_price;
  return px != null && o.qty != null ? px * o.qty : null;
}

function ReplaceRow({ order }: { order: Order }) {
  const replace = useReplaceOrder();
  const [open, setOpen] = useState(false);
  const [qty, setQty] = useState<number | undefined>(order.qty ?? undefined);
  const [limit, setLimit] = useState<number | undefined>(
    order.limit_price ?? undefined,
  );

  if (!open)
    return (
      <button className="btn btn-mini" onClick={() => setOpen(true)} type="button">
        ✎
      </button>
    );

  return (
    <span className="replace-form">
      <input
        type="number"
        step="any"
        min={0}
        value={qty ?? ""}
        placeholder="qty"
        onChange={(e) => setQty(e.target.value ? Number(e.target.value) : undefined)}
      />
      <input
        type="number"
        step="any"
        min={0}
        value={limit ?? ""}
        placeholder="limit"
        onChange={(e) =>
          setLimit(e.target.value ? Number(e.target.value) : undefined)
        }
      />
      <button
        className="btn btn-mini"
        type="button"
        disabled={replace.isPending}
        onClick={() =>
          replace.mutate(
            { id: order.id, input: { qty, limit_price: limit } },
            { onSuccess: () => setOpen(false) },
          )
        }
      >
        save
      </button>
      <button className="btn btn-mini" type="button" onClick={() => setOpen(false)}>
        ✕
      </button>
    </span>
  );
}

const dash = (s: string | number | null | undefined) =>
  s == null || s === "" ? <span className="muted">—</span> : s;

export default function Orders() {
  const [status, setStatus] = useState<StatusFilter>("all");
  const { data, error, isPending } = useOrders(status, 25);
  const cancel = useCancelOrder();
  const cancelAll = useCancelAllOrders();
  const rows = data?.orders;
  const hasLive = !!rows?.some(live);

  return (
    <div className="panel">
      <h2>
        Recent Orders
        <select
          className="panel-action"
          value={status}
          onChange={(e) => setStatus(e.target.value as StatusFilter)}
        >
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        {hasLive && (
          <button
            className="btn btn-mini btn-danger panel-action"
            type="button"
            disabled={cancelAll.isPending}
            onClick={() =>
              window.confirm("Cancel ALL open orders?") && cancelAll.mutate()
            }
          >
            cancel all
          </button>
        )}
      </h2>
      {error && <div className="error">{error.message}</div>}
      {!error && isPending && <div className="tag">Loading…</div>}
      {rows && rows.length === 0 && <div className="tag">No orders</div>}
      {(cancel.error || cancelAll.error) && (
        <div className="error">
          {((cancel.error || cancelAll.error) as Error).message}
        </div>
      )}
      {rows && rows.length > 0 && (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Symbol</th>
                <th>Side</th>
                <th>Type</th>
                <th>Qty</th>
                <th>Filled</th>
                <th>Limit</th>
                <th>Stop</th>
                <th>TIF</th>
                <th>Value</th>
                <th>Status</th>
                <th>Submitted</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((o) => {
                const val = orderValue(o);
                const filled =
                  o.filled_qty > 0
                    ? `${o.filled_qty}${o.qty ? `/${o.qty}` : ""}` +
                      (o.qty
                        ? ` (${Math.round((o.filled_qty / o.qty) * 100)}%)`
                        : "") +
                      (o.filled_avg_price != null
                        ? ` @ ${o.filled_avg_price}`
                        : "")
                    : null;
                const cls =
                  o.order_class && !/simple/i.test(o.order_class)
                    ? ` (${enumTail(o.order_class)})`
                    : "";
                return (
                  <tr key={o.id}>
                    <td>
                      <span className="sym">{o.symbol}</span>
                    </td>
                    <td
                      style={{
                        color:
                          o.side.toLowerCase() === "buy"
                            ? "var(--green)"
                            : "var(--red)",
                      }}
                    >
                      {o.side.toUpperCase()}
                    </td>
                    <td>
                      {o.type}
                      {cls && <span className="muted">{cls}</span>}
                    </td>
                    <td>{dash(o.qty)}</td>
                    <td>{filled ?? <span className="muted">—</span>}</td>
                    <td>{dash(o.limit_price)}</td>
                    <td>{dash(o.stop_price)}</td>
                    <td>
                      {o.time_in_force ? (
                        enumTail(o.time_in_force).toUpperCase()
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                    <td>{val != null ? money(val) : <span className="muted">—</span>}</td>
                    <td>{o.status}</td>
                    <td className="muted">
                      {o.submitted_at
                        ? new Date(o.submitted_at * 1000).toLocaleString()
                        : "—"}
                    </td>
                    <td>
                      {live(o) && (
                        <span className="order-actions">
                          <ReplaceRow order={o} />
                          <button
                            className="btn btn-mini btn-danger"
                            type="button"
                            disabled={cancel.isPending}
                            onClick={() => cancel.mutate(o.id)}
                          >
                            ✕
                          </button>
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
