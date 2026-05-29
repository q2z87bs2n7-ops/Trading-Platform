import { useState } from "react";

import {
  addAlert,
  removeAlert,
  setAlertStatus,
  updateAlert,
  useAlerts,
  type AlertDirection,
  type AlertSource,
  type PriceAlert,
} from "../lib/alerts";
import { cfdDigits, fmtCfdPrice } from "../lib/format";

// Deliberately bare-bones management UI — add / edit / cancel / re-arm a price
// alert for the selected instrument and manage the whole list. Design will
// refine; this exists to prove the create→monitor→fire→modify→cancel loop.

const SOURCES: AlertSource[] = ["mid", "bid", "ask"];

export default function CfdAlertsPanel({
  instrument,
  currentPrice,
  digits,
}: {
  instrument: string;
  currentPrice?: number;
  digits?: number;
}) {
  const alerts = useAlerts();
  const [price, setPrice] = useState("");
  const [source, setSource] = useState<AlertSource>("mid");
  const [direction, setDirection] = useState<AlertDirection>("above");
  const [editingId, setEditingId] = useState<string | null>(null);
  const dp = digits ?? cfdDigits(instrument);

  function resetForm() {
    setPrice("");
    setEditingId(null);
    setDirection("above");
    setSource("mid");
  }

  function onPriceChange(v: string) {
    setPrice(v);
    // Suggest a sensible direction for a new alert: a target below the current
    // price is a "fall below", above is a "rise above".
    if (!editingId && currentPrice != null) {
      const np = parseFloat(v);
      if (!Number.isNaN(np)) setDirection(np < currentPrice ? "below" : "above");
    }
  }

  function submit() {
    const p = parseFloat(price);
    if (!instrument || !p || Number.isNaN(p)) return;
    if (editingId) {
      updateAlert(editingId, {
        instrument,
        source,
        direction,
        price: p,
        status: "armed",
        triggeredAt: undefined,
      });
    } else {
      addAlert({ instrument, source, direction, price: p });
    }
    resetForm();
  }

  function startEdit(a: PriceAlert) {
    setEditingId(a.id);
    setPrice(String(a.price));
    setSource(a.source);
    setDirection(a.direction);
  }

  const seg = (active: boolean) =>
    ({
      background: active ? "var(--accent-bg)" : "var(--panel-2)",
      borderColor: active ? "var(--accent)" : "var(--border)",
      color: active ? "var(--accent)" : "var(--text-2)",
    }) as const;

  return (
    <div
      className="rounded-card-lg overflow-hidden"
      style={{ background: "var(--panel)", border: "1px solid var(--border)", boxShadow: "var(--shadow-sm)" }}
    >
      <div className="px-4 py-2.5 flex items-center justify-between" style={{ borderBottom: "1px solid var(--hairline)" }}>
        <span className="text-[13px] font-semibold">Alerts</span>
        <span className="text-[11px]" style={{ color: "var(--mute)" }}>
          fires while open · toast + sound
        </span>
      </div>

      {/* Add / edit form (scoped to the selected instrument) */}
      <div className="px-4 py-3 flex flex-col gap-2" style={{ borderBottom: "1px solid var(--hairline)" }}>
        <div className="flex items-center justify-between text-[11px]" style={{ color: "var(--mute)" }}>
          <span>{instrument || "Pick an instrument"}</span>
          {currentPrice != null && <span className="tabular-nums">now {fmtCfdPrice(currentPrice, dp)}</span>}
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          {/* Direction */}
          {(["above", "below"] as AlertDirection[]).map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDirection(d)}
              className="text-[11.5px] font-medium px-2 py-1 rounded border cursor-pointer transition-colors"
              style={seg(direction === d)}
            >
              {d === "above" ? "▲ Above" : "▼ Below"}
            </button>
          ))}
          {/* Source */}
          {SOURCES.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSource(s)}
              className="text-[11px] font-medium px-2 py-1 rounded border cursor-pointer transition-colors uppercase"
              style={seg(source === s)}
            >
              {s}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <input
            type="number"
            inputMode="decimal"
            value={price}
            onChange={(e) => onPriceChange(e.target.value)}
            placeholder={currentPrice != null ? fmtCfdPrice(currentPrice, dp) : "price"}
            step={1 / 10 ** dp}
            className="flex-1 tabular-nums"
            style={{
              background: "var(--panel-2)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              padding: "7px 10px",
              color: "var(--text)",
              fontSize: 13,
            }}
          />
          <button
            type="button"
            onClick={submit}
            disabled={!instrument || !price}
            className="text-[12px] font-semibold px-3 py-2 rounded-card border-0 cursor-pointer"
            style={{ background: "var(--accent)", color: "var(--panel)", opacity: !instrument || !price ? 0.5 : 1 }}
          >
            {editingId ? "Save" : "Add"}
          </button>
          {editingId && (
            <button
              type="button"
              onClick={resetForm}
              className="text-[12px] px-2 py-2 rounded-card border cursor-pointer"
              style={{ background: "var(--panel-2)", borderColor: "var(--border)", color: "var(--text-2)" }}
            >
              Cancel
            </button>
          )}
        </div>
      </div>

      {/* List */}
      {alerts.length === 0 ? (
        <div className="px-4 py-5 text-center text-[12px]" style={{ color: "var(--mute)" }}>
          No alerts yet.
        </div>
      ) : (
        alerts.map((a) => {
          const triggered = a.status === "triggered";
          return (
            <div
              key={a.id}
              className="flex items-center gap-3 px-4 py-2.5"
              style={{ borderBottom: "1px solid var(--hairline)", opacity: triggered ? 0.7 : 1 }}
            >
              <div className="flex flex-col min-w-0 flex-1">
                <span className="text-[12.5px] font-medium truncate">
                  {a.instrument} {a.direction === "above" ? "▲" : "▼"}{" "}
                  <span className="tabular-nums">{fmtCfdPrice(a.price, cfdDigits(a.instrument))}</span>
                </span>
                <span className="text-[10.5px] uppercase" style={{ color: "var(--mute)" }}>
                  {a.source} · {triggered ? "triggered" : "armed"}
                </span>
              </div>
              {triggered && (
                <button
                  type="button"
                  onClick={() => setAlertStatus(a.id, "armed")}
                  className="text-[11px] font-medium px-2 py-1 rounded border cursor-pointer"
                  style={{ background: "var(--accent-bg)", borderColor: "var(--accent)", color: "var(--accent)" }}
                >
                  Re-arm
                </button>
              )}
              <button
                type="button"
                onClick={() => startEdit(a)}
                className="text-[11px] font-medium px-2 py-1 rounded border cursor-pointer"
                style={{ background: "var(--panel-2)", borderColor: "var(--border)", color: "var(--text-2)" }}
              >
                Edit
              </button>
              <button
                type="button"
                onClick={() => removeAlert(a.id)}
                className="text-[11px] font-medium px-2 py-1 rounded border cursor-pointer"
                style={{
                  background: "var(--neg-bg)",
                  borderColor: "color-mix(in oklch, var(--neg) 30%, transparent)",
                  color: "var(--neg)",
                }}
              >
                Cancel
              </button>
            </div>
          );
        })
      )}
    </div>
  );
}
