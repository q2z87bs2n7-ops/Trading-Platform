import { useQuery } from "@tanstack/react-query";

import { useActivities } from "../data/hooks";
import { useMobile } from "../hooks/useMobile";
import type { Activity } from "../types";
import ErrorBanner from "./ErrorBanner";
import Pill from "./Pill";

// Local shim — Wave 1 will add `useFxcmClosedTrades` to data/hooks.ts. The
// FxcmClosedTrade row shape is loose (raw bridge rows); strongly-typed at merge.
interface FxcmClosedTradeShim {
  trade_id?: string | number;
  instrument?: string;
  amount?: number;
  buy_sell?: string;
  open_rate?: number;
  close_rate?: number;
  pl?: number;
  gross_pl?: number;
  open_time?: string;
  close_time?: string;
  [key: string]: unknown;
}
const useFxcmClosedTradesShim = (enabled = true) =>
  useQuery({
    queryKey: ["fxcm", "closed_trades"] as const,
    queryFn: async () => {
      const res = await fetch("/api/fxcm/closed_trades");
      if (!res.ok) throw new Error(`fxcm/closed_trades ${res.status}`);
      return (await res.json()) as FxcmClosedTradeShim[];
    },
    refetchInterval: 30_000,
    retry: 0,
    enabled,
  });

const TH =
  "px-2 py-2 text-left font-medium text-[11px] uppercase tracking-wide border-b whitespace-nowrap";
const TD = "px-2 py-2 border-b whitespace-nowrap text-[13px]";

const str = (v: unknown): string => (v == null ? "" : String(v));

// Alpaca occasionally returns enums as their Python repr ("OrderSide.BUY",
// "PositionSide.LONG"); take the tail and uppercase it so the activity
// detail line never reads "ORDERSIDE.BUY".
const enumTail = (v: unknown): string =>
  v == null ? "" : String(v).split(".").pop()!.toUpperCase();

// Heterogeneous payload — Alpaca's activity feed mixes fills (FILL,
// PARTIAL_FILL), corporate actions (DIV, INT), and account moves
// (TRANS, JNLC). Best-effort describe with whichever fields are
// populated; never blow up on missing keys.
function describe(a: Activity): string {
  if (a.activity_type === "TRADE_CLOSE" && a.symbol) {
    const side = enumTail(a.side);
    const qty = str(a.qty);
    const sym = str(a.symbol);
    const price = a.price != null ? `@ ${str(a.price)}` : "";
    const plRaw = a.pl ?? a.gross_pl;
    const pl =
      plRaw != null
        ? ` · P/L ${Number(plRaw) >= 0 ? "+" : ""}${str(plRaw)}`
        : "";
    return `${side} ${qty} ${sym} ${price}${pl}`.trim();
  }
  if (a.symbol) {
    const side = enumTail(a.side);
    const qty = str(a.qty);
    const sym = str(a.symbol);
    const price = a.price != null ? `@ ${str(a.price)}` : "";
    return `${side} ${qty} ${sym} ${price}`.trim();
  }
  return (
    str(a.description) ||
    (a.net_amount != null ? `Net ${str(a.net_amount)}` : "") ||
    str(a.date) ||
    "—"
  );
}

// Map FXCM closed-trade rows into the heterogeneous Activity shape so the
// existing describe()/whenOf() helpers handle them with one TRADE_CLOSE branch.
// Sort newest-first by close_time, rows without a timestamp drift to the end.
function fxcmRowsToActivities(rows: FxcmClosedTradeShim[] | undefined): Activity[] {
  if (!rows) return [];
  const mapped: Activity[] = rows.map((t) => {
    const when = t.close_time || t.open_time;
    return {
      id: t.trade_id,
      activity_type: "TRADE_CLOSE",
      symbol: t.instrument,
      side: t.buy_sell === "B" ? "BUY" : "SELL",
      qty: t.amount,
      price: t.close_rate,
      transaction_time: when,
      pl: t.pl,
      gross_pl: t.gross_pl,
    } as Activity;
  });
  mapped.sort((a, b) => {
    const ta = a.transaction_time ? Date.parse(String(a.transaction_time)) : NaN;
    const tb = b.transaction_time ? Date.parse(String(b.transaction_time)) : NaN;
    if (Number.isNaN(ta) && Number.isNaN(tb)) return 0;
    if (Number.isNaN(ta)) return 1;
    if (Number.isNaN(tb)) return -1;
    return tb - ta;
  });
  return mapped.slice(0, 25);
}

function whenOf(a: Activity): string {
  const t = a.transaction_time || a.date || a.activity_timestamp;
  if (!t) return "";
  const d = new Date(String(t));
  if (Number.isNaN(d.valueOf())) return String(t);
  // Compact "5/21 09:32" — matches the density of the Orders Submitted
  // column without devouring horizontal room on smaller screens.
  return d.toLocaleString(undefined, {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Single-row card variant used at ≤640px in place of the 3-col table.
function ActivityRowMobile({ a, bare = false }: { a: Activity; bare?: boolean }) {
  return (
    <div
      style={{
        display: "flex",
        gap: 10,
        alignItems: "center",
        background: bare ? "transparent" : "var(--panel)",
        border: bare ? "none" : "1px solid var(--border)",
        borderBottom: bare ? "1px solid var(--hairline)" : undefined,
        borderRadius: bare ? 0 : 10,
        padding: "10px 14px",
        marginBottom: bare ? 0 : 8,
        minHeight: "var(--mob-tap)",
      }}
    >
      <Pill status={a.activity_type as string | undefined} tone="neutral" />
      <span
        style={{
          flex: 1,
          fontSize: 13,
          minWidth: 0,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {describe(a)}
      </span>
      <span
        className="font-mono"
        style={{ fontSize: 11, color: "var(--mute)", flexShrink: 0 }}
      >
        {whenOf(a) || "—"}
      </span>
    </div>
  );
}

export default function Activities({
  bare = false,
  symbol,
  dense = false,
  assetClass,
}: {
  bare?: boolean;
  symbol?: string;
  dense?: boolean;
  assetClass?: "stocks" | "crypto" | "forex";
}) {
  const isForex = assetClass === "forex";
  const alpaca = useActivities(25);
  const fxcm = useFxcmClosedTradesShim(isForex);
  const { data, error, isPending } = isForex
    ? {
        data: { activities: fxcmRowsToActivities(fxcm.data) },
        error: fxcm.error,
        isPending: fxcm.isPending,
      }
    : alpaca;
  const rows = symbol
    ? data?.activities?.filter(
        (a) => String(a.symbol ?? "").toUpperCase() === symbol.toUpperCase(),
      )
    : data?.activities;
  const stacked = useMobile() || dense;

  const body = (
    <>
      {error && <ErrorBanner message={error.message} />}
      {rows && rows.length === 0 && (
        <div className="text-[13px] py-4" style={{ color: "var(--mute)" }}>
          No activity.
        </div>
      )}
      {!isPending && stacked && rows && rows.length > 0 && (
        <div>
          {rows.map((a, i) => (
            <ActivityRowMobile key={String(a.id ?? i)} a={a} bare={bare} />
          ))}
        </div>
      )}
      {!stacked && (isPending || (rows && rows.length > 0)) && (
        <div className="overflow-x-auto">
          <table
            className="w-full border-collapse"
            style={{ borderColor: "var(--hairline)" }}
          >
            <thead>
              <tr>
                {["When", "Type", "Detail"].map((h) => (
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
              </tr>
            </thead>
            <tbody>
              {isPending &&
                Array.from({ length: 3 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 3 }).map((_, j) => (
                      <td
                        key={j}
                        className={TD}
                        style={{ borderColor: "var(--hairline)" }}
                      >
                        <div
                          className="h-3 rounded animate-pulse"
                          style={{ background: "var(--panel-2)" }}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              {!isPending &&
                rows &&
                rows.map((a, i) => (
                  <tr
                    key={String(a.id ?? i)}
                    className="transition-colors"
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
                      className={`${TD} font-mono tabular-nums`}
                      style={{
                        borderColor: "var(--hairline)",
                        color: "var(--mute)",
                        width: 130,
                      }}
                    >
                      {whenOf(a) || "—"}
                    </td>
                    <td
                      className={TD}
                      style={{ borderColor: "var(--hairline)", width: 130 }}
                    >
                      <Pill
                        status={a.activity_type as string | undefined}
                        tone="neutral"
                      />
                    </td>
                    <td
                      className={TD}
                      style={{ borderColor: "var(--hairline)" }}
                    >
                      {describe(a)}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );

  if (bare) return body;

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
      {body}
    </div>
  );
}
