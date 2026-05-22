import { useState } from "react";

import { useCancelAllOrders, useCancelOrder, useOrders } from "../data/hooks";
import { showToast } from "../lib/toast";
import type { Order } from "../types";
import ErrorBanner from "./ErrorBanner";
import Pill from "./Pill";
import ConfirmCard from "./trade/ConfirmCard";
import ModifyOrderCard from "./trade/ModifyOrderCard";

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
// Alpaca occasionally returns the Python repr ("OrderStatus.CANCELED")
// instead of the bare enum tail — strip the prefix before the membership
// check so cancelled / filled orders don't get an ✕ button.
const live = (o: Order) => !TERMINAL.has(enumTail(o.status));

const STATUSES = ["all", "open", "closed"] as const;
type StatusFilter = (typeof STATUSES)[number];

const enumTail = (s: string) => s.split(".").pop()!.toLowerCase();

// Alpaca's order-type and TIF enums into client-friendly labels. Falls
// back to a Title-Case version of whatever the API returned so a new
// enum doesn't render blank.
const TYPE_LABEL: Record<string, string> = {
  market: "Market",
  limit: "Limit",
  stop: "Stop",
  stop_limit: "Stop limit",
  trailing_stop: "Trailing stop",
};
function fmtType(t: string): string {
  const k = enumTail(t);
  return (
    TYPE_LABEL[k] ??
    k.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
  );
}

const SIDE_LABEL: Record<string, string> = { buy: "Buy", sell: "Sell" };

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
  const key = enumTail(side); // Alpaca sometimes returns "OrderSide.SELL"
  const buy = key === "buy";
  return (
    <span
      className="inline-block px-2 py-0.5 text-[11px] rounded font-medium"
      style={{
        background: buy ? "var(--pos-bg)" : "var(--neg-bg)",
        color: buy ? "var(--pos)" : "var(--neg)",
      }}
    >
      {SIDE_LABEL[key] ?? key.charAt(0).toUpperCase() + key.slice(1)}
    </span>
  );
}

// Compact one-line status summary for the merged Status column. Mirrors
// the data already in the row (Qty, Limit, Stop columns); we only narrate
// what's distinctive about the status itself — partial fills, the realized
// fill price, or the terminal reason — so it never duplicates the obvious.
function statusDetail(o: Order): string | null {
  const status = enumTail(o.status);
  if (status === "filled" && o.filled_avg_price != null) {
    return `@ ${money(o.filled_avg_price)}`;
  }
  if (status === "partially_filled" && o.qty != null) {
    const pct = Math.round((o.filled_qty / o.qty) * 100);
    return `${o.filled_qty}/${o.qty} (${pct}%)`;
  }
  if (status === "canceled" || status === "cancelled") {
    return o.filled_qty > 0 ? `${o.filled_qty} filled before cancel` : null;
  }
  if (status === "rejected") return "rejected by broker";
  if (status === "expired") return "expired unfilled";
  if (status === "done_for_day") return "EOD: did not fill";
  if (status === "replaced") return "replaced by new order";
  return null;
}

const dash = (s: string | number | null | undefined) =>
  s == null || s === "" ? (
    <span style={{ color: "var(--mute)" }}>—</span>
  ) : (
    s
  );

export default function Orders({ assetClass }: { assetClass?: "stocks" | "crypto" } = {}) {
  const [status, setStatus] = useState<StatusFilter>("all");
  const { data, error, isPending } = useOrders(status, 25);
  const cancel = useCancelOrder();
  const cancelAll = useCancelAllOrders();
  const rows = data?.orders?.filter((o: Order) => {
    if (!assetClass) return true;
    const crypto = o.asset_class === "crypto" || o.symbol.includes("/");
    return assetClass === "crypto" ? crypto : !crypto;
  });
  const hasLive = !!rows?.some(live);

  // Modify and cancel-all both open cards; canceling a single open
  // order is a one-tap action (no confirm) since the ✕ is small and
  // cancellation is recoverable by re-placing.
  const [modifyingOrder, setModifyingOrder] = useState<Order | null>(null);
  const [confirmCancelAll, setConfirmCancelAll] = useState(false);

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
        <div className="inline-flex gap-px">
          {STATUSES.map((s) => {
            const active = status === s;
            return (
              <button
                key={s}
                type="button"
                onClick={() => setStatus(s)}
                className="text-[12px] font-medium cursor-pointer border-0 px-3 py-1.5 transition-colors"
                style={{
                  background: "transparent",
                  color: active ? "var(--accent)" : "var(--mute)",
                  borderBottom: `2px solid ${active ? "var(--accent)" : "transparent"}`,
                  borderRadius: 0,
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
            onClick={() => setConfirmCancelAll(true)}
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
                  <SkeletonRow cols={11} />
                  <SkeletonRow cols={11} />
                  <SkeletonRow cols={11} />
                </>
              )}
              {!isPending &&
                rows &&
                rows.map((o) => {
                  const val = orderValue(o);
                  const cls =
                    o.order_class && !/simple/i.test(o.order_class)
                      ? ` (${enumTail(o.order_class)})`
                      : "";
                  const detail = statusDetail(o);
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
                        className={`${TD} font-sans`}
                        style={{ borderColor: "var(--hairline)" }}
                      >
                        {fmtType(o.type)}
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
                        className={`${TD} font-sans text-left`}
                        style={{ borderColor: "var(--hairline)" }}
                      >
                        <div className="flex flex-col items-start gap-0.5">
                          <Pill status={o.status} />
                          {detail && (
                            <span
                              className="font-mono text-[11px] tabular-nums"
                              style={{ color: "var(--mute)" }}
                            >
                              {detail}
                            </span>
                          )}
                        </div>
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
                            <button
                              className="btn btn-mini"
                              type="button"
                              onClick={() => setModifyingOrder(o)}
                              aria-label={`Modify ${o.symbol} order`}
                            >
                              ✎
                            </button>
                            <button
                              className="btn btn-mini"
                              type="button"
                              disabled={cancel.isPending}
                              aria-label={`Cancel ${o.symbol} order`}
                              onClick={() =>
                                cancel.mutate(o.id, {
                                  onSuccess: () =>
                                    showToast(
                                      `${o.symbol} order cancelled`,
                                      "info",
                                    ),
                                  onError: (e) =>
                                    showToast(
                                      `Couldn't cancel ${o.symbol}: ${(e as Error).message}`,
                                      "error",
                                    ),
                                })
                              }
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

      {modifyingOrder && (
        <ModifyOrderCard
          open
          order={modifyingOrder}
          onClose={() => setModifyingOrder(null)}
        />
      )}
      {confirmCancelAll && (
        <ConfirmCard
          title="Cancel all open orders?"
          body="This will cancel every working order in your blotter."
          confirmLabel="Cancel all orders"
          destructive
          pending={cancelAll.isPending}
          onConfirm={() => {
            cancelAll.mutate(undefined, {
              onSuccess: () => {
                setConfirmCancelAll(false);
                showToast("All open orders cancelled", "info");
              },
              onError: (e) =>
                showToast(
                  `Couldn't cancel all: ${(e as Error).message}`,
                  "error",
                ),
            });
          }}
          onCancel={() => setConfirmCancelAll(false)}
        />
      )}
    </div>
  );
}
