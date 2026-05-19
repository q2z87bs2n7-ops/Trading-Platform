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

const TH = "px-2 py-1 text-right font-medium text-[11px] uppercase tracking-wide text-muted border-b border-border whitespace-nowrap";
const TD = "px-2 py-1.5 text-right border-b border-white/5 whitespace-nowrap";

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
    <span className="inline-flex items-center gap-1">
      <input
        className="w-[70px] px-1.5 py-0.5"
        type="number"
        step="any"
        min={0}
        value={qty ?? ""}
        placeholder="qty"
        onChange={(e) => setQty(e.target.value ? Number(e.target.value) : undefined)}
      />
      <input
        className="w-[70px] px-1.5 py-0.5"
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
  s == null || s === "" ? <span className="text-muted">—</span> : s;

export default function Orders() {
  const [status, setStatus] = useState<StatusFilter>("all");
  const { data, error, isPending } = useOrders(status, 25);
  const cancel = useCancelOrder();
  const cancelAll = useCancelAllOrders();
  const rows = data?.orders;
  const hasLive = !!rows?.some(live);

  return (
    <div className="bg-panel border border-border rounded-lg p-4">
      <h2 className="text-[13px] uppercase tracking-wide text-muted m-0 mb-3">
        Recent Orders
        <select
          className="float-right -mt-0.5"
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
            className="btn btn-mini btn-danger float-right -mt-0.5"
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
      {error && <div className="text-red text-[13px]">{error.message}</div>}
      {!error && isPending && <div className="text-xs text-muted">Loading…</div>}
      {rows && rows.length === 0 && (
        <div className="text-xs text-muted">No orders</div>
      )}
      {(cancel.error || cancelAll.error) && (
        <div className="text-red text-[13px]">
          {((cancel.error || cancelAll.error) as Error).message}
        </div>
      )}
      {rows && rows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[13px] tabular-nums">
            <thead>
              <tr>
                <th className={`${TH} text-left`}>Symbol</th>
                <th className={TH}>Side</th>
                <th className={TH}>Type</th>
                <th className={TH}>Qty</th>
                <th className={TH}>Filled</th>
                <th className={TH}>Limit</th>
                <th className={TH}>Stop</th>
                <th className={TH}>TIF</th>
                <th className={TH}>Value</th>
                <th className={TH}>Status</th>
                <th className={TH}>Submitted</th>
                <th className={`${TH} text-center`}></th>
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
                  <tr key={o.id} className="hover:bg-white/[0.03]">
                    <td className={`${TD} text-left`}>
                      <span className="text-text font-semibold">{o.symbol}</span>
                    </td>
                    <td
                      className={TD}
                      style={{
                        color:
                          o.side.toLowerCase() === "buy"
                            ? "var(--green)"
                            : "var(--red)",
                      }}
                    >
                      {o.side.toUpperCase()}
                    </td>
                    <td className={TD}>
                      {o.type}
                      {cls && <span className="text-muted">{cls}</span>}
                    </td>
                    <td className={TD}>{dash(o.qty)}</td>
                    <td className={TD}>
                      {filled ?? <span className="text-muted">—</span>}
                    </td>
                    <td className={TD}>{dash(o.limit_price)}</td>
                    <td className={TD}>{dash(o.stop_price)}</td>
                    <td className={TD}>
                      {o.time_in_force ? (
                        enumTail(o.time_in_force).toUpperCase()
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td className={TD}>
                      {val != null ? money(val) : <span className="text-muted">—</span>}
                    </td>
                    <td className={TD}>{o.status}</td>
                    <td className={`${TD} text-muted`}>
                      {o.submitted_at
                        ? new Date(o.submitted_at * 1000).toLocaleString()
                        : "—"}
                    </td>
                    <td className={`${TD} text-center`}>
                      {live(o) && (
                        <span className="inline-flex items-center gap-2">
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
