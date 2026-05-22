import { useActivities } from "../data/hooks";
import { useMobile } from "../hooks/useMobile";
import type { Activity } from "../types";
import ErrorBanner from "./ErrorBanner";
import Pill from "./Pill";

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
function ActivityRowMobile({ a }: { a: Activity }) {
  return (
    <div
      style={{
        display: "flex",
        gap: 10,
        alignItems: "center",
        background: "var(--panel)",
        border: "1px solid var(--border)",
        borderRadius: 10,
        padding: "10px 14px",
        marginBottom: 8,
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

export default function Activities({ bare = false }: { bare?: boolean }) {
  const { data, error, isPending } = useActivities(25);
  const rows = data?.activities;
  const isMobile = useMobile();

  const body = (
    <>
      {error && <ErrorBanner message={error.message} />}
      {rows && rows.length === 0 && (
        <div className="text-[13px] py-4" style={{ color: "var(--mute)" }}>
          No activity.
        </div>
      )}
      {!isPending && isMobile && rows && rows.length > 0 && (
        <div>
          {rows.map((a, i) => (
            <ActivityRowMobile key={String(a.id ?? i)} a={a} />
          ))}
        </div>
      )}
      {!isMobile && (isPending || (rows && rows.length > 0)) && (
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
