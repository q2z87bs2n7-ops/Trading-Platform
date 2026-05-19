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

// Second line: fill progress, prices, TIF, non-simple order class and the
// submit time. All fields the backend already returns; only `status` and
// the main line were shown before.
function detail(o: Order): string {
  const parts: string[] = [];
  if (o.filled_qty > 0)
    parts.push(
      `filled ${o.filled_qty}${o.qty ? `/${o.qty}` : ""}` +
        (o.qty ? ` (${Math.round((o.filled_qty / o.qty) * 100)}%)` : "") +
        (o.filled_avg_price != null ? ` @ ${o.filled_avg_price}` : ""),
    );
  const val = orderValue(o);
  if (val != null) parts.push(`val ${money(val)}`);
  if (o.limit_price != null) parts.push(`lmt ${o.limit_price}`);
  if (o.stop_price != null) parts.push(`stp ${o.stop_price}`);
  if (o.time_in_force) parts.push(enumTail(o.time_in_force).toUpperCase());
  if (o.order_class && !/simple/i.test(o.order_class))
    parts.push(enumTail(o.order_class));
  if (o.submitted_at)
    parts.push(new Date(o.submitted_at * 1000).toLocaleString());
  return parts.join(" · ");
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
      {rows &&
        rows.map((o) => (
          <div className="row" key={o.id}>
            <span
              style={{ display: "flex", flexDirection: "column", gap: 2 }}
            >
              <span className="label">
                {o.side.toUpperCase()} {o.qty ?? ""} {o.symbol} · {o.type}
              </span>
              {detail(o) && <span className="tag">{detail(o)}</span>}
            </span>
            <span className="order-actions">
              <span className="tag">{o.status}</span>
              {live(o) && (
                <>
                  <ReplaceRow order={o} />
                  <button
                    className="btn btn-mini btn-danger"
                    type="button"
                    disabled={cancel.isPending}
                    onClick={() => cancel.mutate(o.id)}
                  >
                    ✕
                  </button>
                </>
              )}
            </span>
          </div>
        ))}
    </div>
  );
}
