import { useState } from "react";

import {
  useCancelAllOrders,
  useCancelOrder,
  useOrders,
  useReplaceOrder,
} from "../data/hooks";
import type { Order } from "../types";
import ErrorBanner from "./ErrorBanner";
import Pill from "./Pill";

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

const enumTail = (s: string) => s.split(".").pop()!.toLowerCase();

const money = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD" });

function orderValue(o: Order): number | null {
  const px = o.filled_avg_price ?? o.limit_price ?? o.stop_price;
  return px != null && o.qty != null ? px * o.qty : null;
}

const TH =
  "px-2 py-2 text-right font-medium text-[11px] uppercase tracking-wide border-b whitespace-nowrap";
const TD =
  "px-2 py-2 text-right border-b whitespace-nowrap font-mono text-[13px] tabular-nums";
const TD_SKEL = "px-2 py-2 border-b";

function SkeletonRow({ cols }: { cols: number }) {
  return (
    <tr>
      {Array.from({ length: cols }).map((_, i) => (
        <td
          key={i}
          className={TD_SKEL}
          style={{ borderColor: "var(--hairline)" }}
        >
          <div
            className="h-3 rounded animate-pulse"
            style={{ background: "var(--panel-2)" }}
          />
        </td>
      ))}
    </tr>
  );
}

function SidePill({ side }: { side: string }) {
  const buy = side.toLowerCase() === "buy";
  return (
    <span
      className="inline-block px-1.5 py-0.5 text-[10px] rounded uppercase tracking-wide font-medium"
      style={{
        background: buy ? "var(--pos-bg)" : "var(--neg-bg)",
        color: buy ? "var(--pos)" : "var(--neg)",
      }}
    >
      {side.toUpperCase()}
    </span>
  );
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
      <button
        className="btn btn-mini"
        onClick={() => setOpen(true)}
        type="button"
      >
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
        onChange={(e) =>
          setQty(e.target.value ? Number(e.target.value) : undefined)
        }
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
      <button
        className="btn btn-mini"
        type="button"
        onClick={() => setOpen(false)}
      >
        ✕
      </button>
    </span>
  );
}

const dash = (s: string | number | null | undefined) =>
  s == null || s === "" ? (
    <span style={{ color: "var(--mute)" }}>—</span>
  ) : (
    s
  );

export default function Orders() {
  const [status, setStatus] = useState<StatusFilter>("all");
  const { data, error, isPending } = useOrders(status, 25);
  const cancel = useCancelOrder();
  const cancelAll = useCancelAllOrders();
  const rows = data?.orders;
  const hasLive = !!rows?.some(live);

  return (
    <div
      className="p-3"
      style={{
        background: "var(--panel)",
        border: "1px solid var(--border)",
        borderRadius: "var(--r-lg)",
        boxShadow: "var(--shadow-sm)",
      }}
    >
      <div className="flex items-center gap-2 mb-2">
        <div
          className="inline-flex p-0.5 gap-0.5"
          style={{ background: "var(--panel-2)", borderRadius: 7 }}
        >
          {STATUSES.map((s) => {
            const active = status === s;
            return (
              <button
                key={s}
                type="button"
                onClick={() => setStatus(s)}
                className="text-[12px] font-medium cursor-pointer border-0 px-3 py-1"
                style={{
                  background: active ? "var(--panel)" : "transparent",
                  color: active ? "var(--text)" : "var(--mute)",
                  borderRadius: 5,
                  boxShadow: active ? "var(--shadow-sm)" : "none",
                  textTransform: "capitalize",
                }}
              >
                {s}
              </button>
            );
          })}
        </div>
        {hasLive && (
          <button
            className="btn btn-mini ml-auto"
            type="button"
            disabled={cancelAll.isPending}
            onClick={() =>
              window.confirm("Cancel ALL open orders?") && cancelAll.mutate()
            }
          >
            Cancel all
          </button>
        )}
      </div>
      {error && <ErrorBanner message={error.message} />}
      {(cancel.error || cancelAll.error) && (
        <ErrorBanner
          message={((cancel.error || cancelAll.error) as Error).message}
        />
      )}
      {!isPending && rows && rows.length === 0 && (
        <div className="text-[13px] py-4" style={{ color: "var(--mute)" }}>
          {status === "open"
            ? "No working orders. Recent fills appear under closed."
            : status === "closed"
              ? "No closed orders yet."
              : "No orders yet."}
        </div>
      )}
      {(isPending || (rows && rows.length > 0)) && (
        <div className="overflow-x-auto">
          <table
            className="w-full border-collapse"
            style={{ borderColor: "var(--hairline)" }}
          >
            <thead>
              <tr>
                <th
                  className={`${TH} text-left`}
                  style={{
                    borderColor: "var(--border)",
                    color: "var(--mute)",
                  }}
                >
                  Symbol
                </th>
                {[
                  "Side",
                  "Type",
                  "Qty",
                  "Filled",
                  "Limit",
                  "Stop",
                  "TIF",
                  "Value",
                  "Status",
                  "Submitted",
                ].map((h) => (
                  <th
                    key={h}
                    className={TH}
                    style={{
                      borderColor: "var(--border)",
                      color: "var(--mute)",
                    }}
                  >
                    {h}
                  </th>
                ))}
                <th
                  className={`${TH} text-center`}
                  style={{
                    borderColor: "var(--border)",
                    color: "var(--mute)",
                  }}
                ></th>
              </tr>
            </thead>
            <tbody>
              {isPending && (
                <>
                  <SkeletonRow cols={12} />
                  <SkeletonRow cols={12} />
                  <SkeletonRow cols={12} />
                </>
              )}
              {!isPending &&
                rows &&
                rows.map((o) => {
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
                    <tr
                      key={o.id}
                      className="transition-colors"
                      style={{}}
                      onMouseEnter={(e) => {
                        (e.currentTarget as HTMLElement).style.background =
                          "var(--panel-2)";
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLElement).style.background =
                          "transparent";
                      }}
                    >
                      <td
                        className={`${TD} text-left font-sans`}
                        style={{ borderColor: "var(--hairline)" }}
                      >
                        <span className="font-semibold">{o.symbol}</span>
                      </td>
                      <td
                        className={`${TD} font-sans`}
                        style={{ borderColor: "var(--hairline)" }}
                      >
                        <SidePill side={o.side} />
                      </td>
                      <td
                        className={TD}
                        style={{ borderColor: "var(--hairline)" }}
                      >
                        {o.type}
                        {cls && (
                          <span style={{ color: "var(--mute)" }}>{cls}</span>
                        )}
                      </td>
                      <td
                        className={TD}
                        style={{ borderColor: "var(--hairline)" }}
                      >
                        {dash(o.qty)}
                      </td>
                      <td
                        className={TD}
                        style={{ borderColor: "var(--hairline)" }}
                      >
                        {filled ?? (
                          <span style={{ color: "var(--mute)" }}>—</span>
                        )}
                      </td>
                      <td
                        className={TD}
                        style={{ borderColor: "var(--hairline)" }}
                      >
                        {dash(o.limit_price)}
                      </td>
                      <td
                        className={TD}
                        style={{ borderColor: "var(--hairline)" }}
                      >
                        {dash(o.stop_price)}
                      </td>
                      <td
                        className={TD}
                        style={{ borderColor: "var(--hairline)" }}
                      >
                        {o.time_in_force ? (
                          enumTail(o.time_in_force).toUpperCase()
                        ) : (
                          <span style={{ color: "var(--mute)" }}>—</span>
                        )}
                      </td>
                      <td
                        className={TD}
                        style={{ borderColor: "var(--hairline)" }}
                      >
                        {val != null ? (
                          money(val)
                        ) : (
                          <span style={{ color: "var(--mute)" }}>—</span>
                        )}
                      </td>
                      <td
                        className={`${TD} font-sans`}
                        style={{ borderColor: "var(--hairline)" }}
                      >
                        <Pill status={o.status} />
                      </td>
                      <td
                        className={TD}
                        style={{
                          borderColor: "var(--hairline)",
                          color: "var(--mute)",
                        }}
                      >
                        {o.submitted_at
                          ? new Date(o.submitted_at * 1000).toLocaleString()
                          : "—"}
                      </td>
                      <td
                        className={`${TD} text-center font-sans`}
                        style={{ borderColor: "var(--hairline)" }}
                      >
                        {live(o) && (
                          <span className="inline-flex items-center gap-2">
                            <ReplaceRow order={o} />
                            <button
                              className="btn btn-mini"
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
