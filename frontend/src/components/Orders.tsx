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
  const { data, error, isPending } = useOrders("all", 25);
  const cancel = useCancelOrder();
  const cancelAll = useCancelAllOrders();
  const rows = data?.orders;
  const hasLive = !!rows?.some(live);

  return (
    <div className="panel">
      <h2>
        Recent Orders
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
            <span className="label">
              {o.side.toUpperCase()} {o.qty ?? ""} {o.symbol} · {o.type}
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
