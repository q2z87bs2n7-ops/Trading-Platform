# FXCM Orders & Activities UI Adaptation Analysis

## Executive Summary

FXCM closed-trades provide P/L but lack fee data. Order statuses are simpler (status string vs. Alpaca enums). Both components are renderable with fallbacks; Activities is more straightforward.

---

## Alpaca Components Summary

### Orders.tsx
- **Columns:** Symbol, Side, Type, Qty, Limit, Stop, TIF, Value, Status, Submitted (11-col full view; mid=9-col without TIF/Submitted).
- **Filtering:** Status tabs (all/open/closed); asset class filter; symbol filter.
- **Live orders:** Detect by checking status against TERMINAL set; show Modify/Cancel buttons.
- **Status detail:** Formatted inline (e.g., "filled @ $123.45", "50/100 (50%)", "rejected by broker").
- **Qty/Value logic:** For notional orders, `qty` is null; fallback to `filled_qty` or `notional`.

### Activities.tsx
- **Columns:** When (timestamp), Type (activity_type pill), Detail (heterogeneous description).
- **Data source:** `useActivities()` hook; no asset-class filtering applied yet (global view).
- **Parsing:** Best-effort `describe()` function extracts symbol/side/qty/price or falls back to description/net_amount/date.
- **Timestamps:** Tries three fields (`transaction_time`, `date`, `activity_timestamp`); parses ISO or accepts raw string as fallback.
- **Sorting:** Already-sorted by backend (newest first); no client-side sort.

---

## FXCM Data Structures

### Orders (`/api/fxcm/orders`) - From FxcmSession.java
```json
{
  "order_id": "string",
  "account_id": "string|number",
  "offer_id": "string|number",
  "instrument": "EUR/USD",
  "amount": 1000,
  "rate": 1.0850,
  "type": "OM|SE|LE",
  "status": "string (e.g., 'Pending', 'Executed', 'Expired', 'Rejected')",
  "buy_sell": "B|S"
}
```

### Closed Trades (`/api/fxcm/closed_trades`) - From FxcmSession.java
```json
{
  "trade_id": "string",
  "instrument": "EUR/USD",
  "amount": 1000,
  "buy_sell": "B|S",
  "open_rate": 1.0850,
  "close_rate": 1.0855,
  "pl": 50.0,
  "gross_pl": 50.0
}
```

---

## State Machine Comparison

| Aspect | Alpaca | FXCM |
|--------|--------|------|
| **Order Statuses** | `filled`, `partially_filled`, `pending`, `accepted`, `canceled`, `cancelled`, `expired`, `rejected`, `done_for_day`, `replaced` | `Pending`, `Executed`, `Expired`, `Rejected`, `Partially Executed`, `Cancelled` (raw strings, no enums) |
| **Terminal states** | 9 states prevent modify/cancel | Same logic applies; FXCM fewer states, easier parse |
| **TIF** | Explicit `time_in_force` field | Not exposed in FXCM orders; implied by order_type |
| **Limit/Stop** | Separate fields | Part of order_type: `SE` (stop entry), `LE` (limit entry), `OM` (market); no protective stops visible in pending orders |
| **Fees** | None in Orders; in Activities as separate rows | **None in closed_trades** — no commission/swap fields |
| **Timestamps** | `submitted_at` (Unix seconds) | **Missing in orders/closed_trades**; date history in `/api/fxcm/history` only |

---

## Orders Component Adaptation Plan

### Feasible Columns (FXCM → Alpaca mapping)
| Alpaca | FXCM | Notes |
|--------|------|-------|
| **Symbol** | `instrument` | Direct ✓ |
| **Side** | `buy_sell` ("B"/"S") | Map: B→Buy, S→Sell ✓ |
| **Type** | `type` ("OM"/"SE"/"LE") | Map: OM→Market, SE→Stop, LE→Limit ✓ |
| **Qty** | `amount` | Direct ✓ (FXCM always has qty, no notional concept) |
| **Limit** | Missing | Fallback: "—" (LE has execution rate in `rate`, not stored separately) |
| **Stop** | Missing | Fallback: "—" (SE has trigger rate in `rate`, not stored separately) |
| **TIF** | Implicit (not exposed) | Fallback: "—" (cannot infer from order_type alone) |
| **Value** | `amount × rate` | Reconstruct from amount + rate ✓ |
| **Status** | `status` (raw string) | Parse directly; use `dash()` if null ✓ |
| **Submitted** | Missing | Fallback: "—" (bridge does not return order submission time) |

### UI Branch Points
1. **Live orders check:** FXCM statuses are strings, not enums. Create `FXCM_TERMINAL = new Set(["Executed", "Expired", "Rejected", "Cancelled"])`.
2. **Modify/Cancel buttons:** Only show for non-terminal orders.
3. **Cancel-all button:** Same logic; FXCM doesn't support batch cancel (would need loop).
4. **Mid-width layout:** Hide TIF + Submitted (already missing on FXCM, so fewer columns needed anyway).

### Fallback Strategy
- Limit/Stop/TIF columns render `<span style={{ color: "var(--mute)" }}>—</span>` when unavailable.
- Value uses `amount × rate` or `—` if rate is null.
- Status detail logic: reuse `statusDetail(o)` but adapt to FXCM statuses:
  - "Executed" → "filled @ {rate}"
  - "Partially Executed" → "{amount} of X filled" (X is unavailable; show "Partially executed")
  - "Rejected" → "rejected by broker"
  - "Expired" → "expired unfilled"

### Implementation Signature
```tsx
function FxcmOrders({
  dense = false,
  mid = false,
  bare = false,
}: {
  dense?: boolean;
  mid?: boolean;
  bare?: boolean;
} = {}) {
  // Use getFxcmOrders() hook instead of useOrders()
  // Check status against FXCM_TERMINAL set
  // Map buy_sell/type on render
  // Render 7–9 columns (Type/Side/Qty/Rate/Value/Status + mods/cancel)
}
```

---

## Activities Component Adaptation Plan

### Feasible Columns (FXCM → Alpaca mapping)
| Alpaca | FXCM (closed_trades) | Notes |
|--------|----------------------|-------|
| **When** | Missing | Fallback: "—" (bridge doesn't return close timestamp; would need to infer from `/history`) |
| **Type** | No explicit type; infer from trade state | Always "FILL" (a closed position is a realized fill) |
| **Detail** | Construct from: buy_sell + amount + instrument + open_rate/close_rate | E.g., "SELL 1000 EUR/USD @ 1.0850 → 1.0855" |

### Detail Reconstruction
Alpaca's `describe()` uses symbol/side/qty/price. For FXCM closed trades:
```ts
function describeFxcmClosedTrade(t: FxcmClosedTrade): string {
  const side = t.buy_sell === "B" ? "BUY" : "SELL";
  const qty = t.amount ?? "—";
  const sym = t.instrument ?? "—";
  const entry = t.open_rate != null ? `@ ${t.open_rate}` : "";
  const exit = t.close_rate != null ? `→ ${t.close_rate}` : "";
  return `${side} ${qty} ${sym} ${entry} ${exit}`.trim() || "—";
}
```

### Fees / P&L Surface
- **PL column missing in Alpaca Activities.tsx.** Alpaca Activities is sparse (When/Type/Detail only).
- **FXCM has `pl` + `gross_pl`.** Could add a 4th column: P&L (green/red).
- **No fees in FXCM.** Show `pl` as-is; no separate fee row needed.

### UI Branch Points
1. **No timestamp.** Activities shows "—" in the When column for FXCM rows (note: frontend could patch in daily close times if `/history` is wired).
2. **Type pill:** Always "FILL" for closed trades.
3. **P&L column (optional):** Add if adapting desktop table; mobile card already shows terse detail.

### Implementation Signature
```tsx
function FxcmActivities({
  dense = false,
  bare = false,
}: {
  dense?: boolean;
  bare?: boolean;
} = {}) {
  // Use getFxcmClosedTrades() hook
  // Type is always "FILL" (or infer a richer type if needed)
  // Reconstruct detail from buy_sell/amount/instrument/rates
  // When column shows "—" (timestamp unavailable)
  // Optional: add P&L column showing pl (green for positive, red for negative)
}
```

---

## Summary Table: Columns Available

### Orders
| Column | Alpaca | FXCM | Render |
|--------|--------|------|--------|
| Symbol | ✓ | ✓ | ✓ |
| Side | ✓ | ✓ (map B/S) | ✓ |
| Type | ✓ | ✓ (map OM/SE/LE) | ✓ |
| Qty | ✓ | ✓ (amount) | ✓ |
| Limit | ✓ | ✗ | Fallback "—" |
| Stop | ✓ | ✗ | Fallback "—" |
| TIF | ✓ | ✗ (implicit) | Fallback "—" |
| Value | ✓ | Computed (amount × rate) | ✓ |
| Status | ✓ | ✓ (raw string) | ✓ |
| Submitted | ✓ | ✗ | Fallback "—" |

### Activities
| Column | Alpaca | FXCM | Render |
|--------|--------|------|--------|
| When | ✓ | ✗ | Fallback "—" |
| Type | ✓ | Inferred "FILL" | ✓ |
| Detail | ✓ | ✓ (reconstruct) | ✓ |
| P&L | ✗ | ✓ (pl field) | Optional enhancement |

---

## No-Blow-Up Fallback Logic

1. **Null timestamps:** `whenOf()` → `"—"`.
2. **Missing rate:** `value = "—"` (don't NaN).
3. **Enum parsing:** Use direct string comparison, not `.split(".")` (FXCM returns plain strings).
4. **Fees:** Activities never references them for FXCM; `pl` already includes all costs.
5. **Modify/Replace:** FXCM orders cannot be modified once submitted (backend limitation); show no Modify button; Cancel-only.

---

## Minimal Code Changes

### In Orders.tsx
```tsx
if (assetClass === "forex") {
  // Use getFxcmOrders() and FxcmOrdersRows renderer
  // Map type: "OM" → "Market", "SE" → "Stop", "LE" → "Limit"
  // Map side: "B" → "Buy", "S" → "Sell"
  // Live check: !["Executed", "Expired", "Rejected", "Cancelled"].includes(o.status)
  // Columns: Symbol, Side, Type, Qty, Rate, Value, Status (skip Limit/Stop/TIF/Submitted)
} else {
  // Existing Alpaca Orders logic
}
```

### In Activities.tsx
```tsx
if (assetClass === "forex") {
  // Use getFxcmClosedTrades() and FxcmActivitiesRows renderer
  // Type: always render as "FILL" pill
  // Detail: reconstruct(buy_sell, amount, instrument, open_rate, close_rate)
  // When: always "—"
} else {
  // Existing Alpaca Activities logic
}
```

---

## Gotchas & Notes

- **No auto-refresh of orders after submit.** FXCM bridge doesn't SSE; frontend must poll `/api/fxcm/orders`.
- **Closed trades = realized fills only.** No pending trade history; open positions are separate (`/api/fxcm/positions`).
- **Timestamp gap.** Consider backlog item: wire `/api/fxcm/history` to infer close times from hourly bars (match close_rate to a bar and grab its time).
- **Limit vs. Stop display.** FXCM `rate` field is ambiguous (execution rate for both SE and LE). Store separately or accept "—".
- **Fees/Commissions.** Alpaca sometimes shows negative fills for fees; FXCM `pl` field appears to be net (cost included). Verify with FXCM account docs if backlog item adds fee transparency.
