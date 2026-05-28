import { useState } from "react";

import { useFxcmCancelOrder, useFxcmDisplayNames, useFxcmOrders } from "../data/hooks";
import { useMobile } from "../hooks/useMobile";
import { showToast } from "../lib/toast";
import type { FxcmOrder } from "../types";
import ErrorBanner from "./ErrorBanner";
import Pill from "./Pill";
import FxcmModifyOrderCard from "./trade/FxcmModifyOrderCard";

const TYPE_LABEL: Record<string, string> = {
  OM: "Market",
  SE: "Stop entry",
  LE: "Limit entry",
};
const SIDE_LABEL: Record<string, string> = { B: "Buy", S: "Sell" };

// FCLite statuses past which an order can no longer be modified or cancelled.
// Case-insensitive — FCLite returns mixed-case strings depending on path.
const TERMINAL = new Set(["executed", "cancelled", "canceled", "rejected", "filled"]);
const isTerminal = (s: string) => TERMINAL.has((s ?? "").toLowerCase());
const isLive = (o: FxcmOrder) => !isTerminal(o.status);

function fmtRate(value: number | undefined, digits: number): string {
  if (value == null || value === 0) return "—";
  return value.toFixed(digits);
}

// Short M/D HH:mm — compact enough for a blotter column on iPad portrait.
function fmtTime(iso: string | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
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
  const buy = side === "B";
  return (
    <span
      className="inline-block px-2 py-0.5 text-[11px] rounded font-medium"
      style={{
        background: buy ? "var(--pos-bg)" : "var(--neg-bg)",
        color: buy ? "var(--pos)" : "var(--neg)",
      }}
    >
      {SIDE_LABEL[side] ?? side}
    </span>
  );
}

function FxcmOrderCardMobile({
  o,
  onModify,
  onCancel,
  cancelPending,
  dn,
}: {
  o: FxcmOrder;
  onModify: (o: FxcmOrder) => void;
  onCancel: (o: FxcmOrder) => void;
  cancelPending: boolean;
  dn: (name: string) => string;
}) {
  const buy = o.buy_sell === "B";
  const digits = o.digits ?? 5;
  const live = isLive(o);
  return (
    <div
      style={{
        background: "var(--panel)",
        border: "1px solid var(--border)",
        borderRadius: "var(--mob-card-radius)",
        padding: 14,
        marginBottom: 8,
        boxShadow: "var(--shadow-sm)",
        opacity: cancelPending ? 0.5 : 1,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span
          style={{
            fontSize: 10.5,
            fontWeight: 700,
            padding: "2px 8px",
            borderRadius: 6,
            background: buy ? "var(--pos-bg)" : "var(--neg-bg)",
            color: buy ? "var(--pos)" : "var(--neg)",
            textTransform: "uppercase",
            letterSpacing: "0.04em",
          }}
        >
          {buy ? "Buy" : "Sell"}
        </span>
        <b style={{ fontSize: 16 }}>{dn(o.instrument)}</b>
        <span style={{ fontSize: 12, color: "var(--mute)" }}>
          {TYPE_LABEL[o.type] ?? o.type}
        </span>
        {live && (
          <span style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
            <button
              type="button"
              onClick={() => onModify(o)}
              aria-label={`Modify ${o.instrument} order`}
              style={{
                minHeight: "var(--mob-tap)",
                minWidth: 38,
                background: "var(--panel-2)",
                border: "1px solid var(--border)",
                borderRadius: 8,
                fontSize: 13,
              }}
            >
              ✎
            </button>
            <button
              type="button"
              onClick={() => onCancel(o)}
              disabled={cancelPending}
              aria-label={`Cancel ${o.instrument} order`}
              style={{
                minHeight: "var(--mob-tap)",
                minWidth: 38,
                background: "var(--panel-2)",
                border: "1px solid var(--border)",
                borderRadius: 8,
                fontSize: 13,
              }}
            >
              ✕
            </button>
          </span>
        )}
      </div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginTop: 8,
          fontSize: 11.5,
          alignItems: "center",
          gap: 8,
          flexWrap: "wrap",
        }}
      >
        <span className="font-mono" style={{ color: "var(--text-2)" }}>
          {o.amount}
          {o.rate > 0 && ` @ ${fmtRate(o.rate, digits)}`}
        </span>
        {(o.stop ?? 0) > 0 && (
          <span className="font-mono" style={{ color: "var(--mute)", fontSize: 10.5 }}>
            SL {fmtRate(o.stop, digits)}
          </span>
        )}
        {(o.limit ?? 0) > 0 && (
          <span className="font-mono" style={{ color: "var(--mute)", fontSize: 10.5 }}>
            TP {fmtRate(o.limit, digits)}
          </span>
        )}
        <Pill status={o.status} />
        <span
          className="font-mono"
          style={{ fontSize: 10.5, color: "var(--mute)", marginLeft: "auto" }}
        >
          {fmtTime(o.created_time)}
        </span>
      </div>
    </div>
  );
}

export interface FxcmOrdersProps {
  symbol?: string;
}

export default function FxcmOrders({ symbol }: FxcmOrdersProps = {}) {
  const { data, error, isPending } = useFxcmOrders(true);
  const cancel = useFxcmCancelOrder();
  const dn = useFxcmDisplayNames();
  const stacked = useMobile();
  const [modifyingOrder, setModifyingOrder] = useState<FxcmOrder | null>(null);

  const rows = (data ?? []).filter((o) => {
    if (isTerminal(o.status)) return false;
    if (symbol && o.instrument.toUpperCase() !== symbol.toUpperCase()) return false;
    return true;
  });

  // Track per-row cancel to grey the right row during the mutation, since
  // useMutation only exposes a single isPending shared across calls.
  const [pendingCancelId, setPendingCancelId] = useState<string | null>(null);

  function doCancel(o: FxcmOrder) {
    setPendingCancelId(o.order_id);
    cancel.mutate(o.order_id, {
      onSuccess: () => {
        showToast(`${o.instrument} order cancelled`, "info");
        setPendingCancelId(null);
      },
      onError: (e) => {
        showToast(
          `Couldn't cancel ${o.instrument}: ${(e as Error).message}`,
          "error",
        );
        setPendingCancelId(null);
      },
    });
  }

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
      {error && <ErrorBanner message={(error as Error).message} />}
      {cancel.error && (
        <ErrorBanner message={(cancel.error as Error).message} />
      )}

      {!isPending && rows.length === 0 && (
        <div className="text-[13px] py-4" style={{ color: "var(--mute)" }}>
          No working FXCM orders.
        </div>
      )}

      {!isPending && stacked && rows.length > 0 && (
        <div className="flex flex-col">
          {rows.map((o) => (
            <FxcmOrderCardMobile
              key={o.order_id}
              o={o}
              onModify={setModifyingOrder}
              onCancel={doCancel}
              cancelPending={
                cancel.isPending && pendingCancelId === o.order_id
              }
              dn={dn}
            />
          ))}
        </div>
      )}

      {!stacked && (isPending || rows.length > 0) && (
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
                {["Side", "Type", "Amount", "Rate", "Stop", "Limit", "Status", "Submitted"].map(
                  (h) => (
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
                  ),
                )}
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
                  <SkeletonRow cols={10} />
                  <SkeletonRow cols={10} />
                  <SkeletonRow cols={10} />
                </>
              )}
              {!isPending &&
                rows.map((o) => {
                  const digits = o.digits ?? 5;
                  const live = isLive(o);
                  const rowPending =
                    cancel.isPending && pendingCancelId === o.order_id;
                  return (
                    <tr
                      key={o.order_id}
                      className="transition-colors"
                      style={{ opacity: rowPending ? 0.5 : 1 }}
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
                        <span className="font-semibold">{dn(o.instrument)}</span>
                      </td>
                      <td
                        className={`${TD} font-sans`}
                        style={{ borderColor: "var(--hairline)" }}
                      >
                        <SidePill side={o.buy_sell} />
                      </td>
                      <td
                        className={`${TD} font-sans`}
                        style={{ borderColor: "var(--hairline)" }}
                      >
                        {TYPE_LABEL[o.type] ?? o.type}
                      </td>
                      <td
                        className={TD}
                        style={{ borderColor: "var(--hairline)" }}
                      >
                        {o.amount}
                      </td>
                      <td
                        className={TD}
                        style={{ borderColor: "var(--hairline)" }}
                      >
                        {o.rate > 0 ? (
                          fmtRate(o.rate, digits)
                        ) : (
                          <span style={{ color: "var(--mute)" }}>—</span>
                        )}
                      </td>
                      <td
                        className={TD}
                        style={{ borderColor: "var(--hairline)" }}
                      >
                        {(o.stop ?? 0) > 0 ? (
                          fmtRate(o.stop, digits)
                        ) : (
                          <span style={{ color: "var(--mute)" }}>—</span>
                        )}
                      </td>
                      <td
                        className={TD}
                        style={{ borderColor: "var(--hairline)" }}
                      >
                        {(o.limit ?? 0) > 0 ? (
                          fmtRate(o.limit, digits)
                        ) : (
                          <span style={{ color: "var(--mute)" }}>—</span>
                        )}
                      </td>
                      <td
                        className={`${TD} font-sans text-left`}
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
                        {fmtTime(o.created_time)}
                      </td>
                      <td
                        className={`${TD} text-center font-sans`}
                        style={{ borderColor: "var(--hairline)" }}
                      >
                        {live && (
                          <span className="inline-flex items-center gap-2">
                            <button
                              className="btn btn-mini"
                              type="button"
                              onClick={() => setModifyingOrder(o)}
                              aria-label={`Modify ${o.instrument} order`}
                            >
                              ✎
                            </button>
                            <button
                              className="btn btn-mini"
                              type="button"
                              disabled={rowPending}
                              aria-label={`Cancel ${o.instrument} order`}
                              onClick={() => doCancel(o)}
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
        <FxcmModifyOrderCard
          order={modifyingOrder}
          onClose={() => setModifyingOrder(null)}
        />
      )}
    </div>
  );
}
