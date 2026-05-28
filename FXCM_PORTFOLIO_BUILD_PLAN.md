# FXCM Portfolio Build — Synthesis & Action Plan

**Date:** May 28, 2026  
**Status:** Analysis Complete → Ready for Implementation Phase 1

---

## Executive Summary

All 5 investigation agents have completed analysis. **Consensus recommendation:** Replicate the Alpaca Portfolio flow with **minimal, surgical changes** primarily at the data layer. The architecture is sound; FXCM's constraints are primarily data-related (no timestamps on closed trades, no intraday P/L breakdown), not architectural.

**Key Decisions:**
- ✅ **Hook architecture:** Option A (branch inside existing hooks, adapt at API boundary)
- ✅ **UI component architecture:** Option B (data-layer branching, components stay generic)
- ✅ **Phase 1 scope:** Hero + Positions + Orders (Activities deferred pending bridge work)
- ⚠️ **Phase 2 blocker:** Closed trades lack timestamps → cannot build Activities blotter yet

---

## Architectural Recommendations (Consensus)

### 1. Data Layer: Adapt at API Boundary

**Pattern:** Extend existing hooks with internal FXCM branching.

```ts
// frontend/src/data/hooks.ts (pattern, all hooks follow this)
export function useAccount() {
  const assetClass = useAssetClass();
  
  if (assetClass === "forex") {
    // FXCM endpoint returns FxcmAccount; adapt to Account shape
    return useFxcmAccountAdapter();
  }
  
  // Existing Alpaca query unchanged
  return useQuery({...});
}
```

**Adaptation point:** `frontend/src/api.ts`
- New functions: `getFxcmAccount()`, `getFxcmPositions()`, `getFxcmOrders()`, `getFxcmClosedTrades()`
- Each wraps `/api/fxcm/*` and **normalizes FXCM response to Alpaca shape**
- Components see unified `Account | Position | Order` — no branching needed

**Benefits:**
- No component rewrites (all hooks work as-is)
- Tested pattern (already used by `usePnlHistory(assetClass)`)
- Type-safe: mismatch caught at hook level, not UI render

---

### 2. UI Components: Minimal Conditional Branching

**Pattern:** Components call hooks as-is; only **fallback UI for missing fields**.

**PortfolioHero Adaptation:**
```ts
// FXCM quirks: no pnl-history, no day-P/L breakdown
const pnl = history.data?.pnl ?? []; // empty for forex
const dayPl = siloPositions.reduce((s, p) => s + p.unrealized_intraday_pl, 0);
// For forex: unrealized_intraday_pl is always 0 (not available)
// Component renders: dayPl = 0 → "—" in UI (natural fallback)
```

**Positions Adaptation:**
```ts
// Column additions/removals:
// - Hide "Day %" for forex (unrealized_intraday_pl always 0)
// - Add forex-specific columns (Stop Loss / Take Profit if available)
// - Use conditional rendering:
if (assetClass === "forex") {
  // FXCM positions row
} else {
  // Alpaca positions row (existing)
}
```

**Orders Adaptation:**
```ts
// FXCM order status: simpler set (Pending, Executed, Rejected, Expired)
// Alpaca has: filled, canceled, cancelled, expired, rejected, done_for_day, replaced
const mapFxcmStatus = (s: string) => {
  switch (s) {
    case "Pending": return "pending";
    case "Executed": return "filled";
    case "Rejected": return "rejected";
    case "Expired": return "expired";
  }
};
// Component just uses the mapped status; no fork needed
```

**Activities (Phase 2):**
- Deferred: waiting for bridge timestamps on closed_trades
- Fallback for now: render empty or show "Closed trades unavailable"

---

## Implementation Roadmap

### Phase 1: Core Portfolio (Weeks 1–2)
**Deliverable:** Hero + Positions + Orders working with FXCM data

**Tasks:**
1. Create adapter functions in `api.ts`:
   - `getFxcmAccount()` → `Account` shape
   - `getFxcmPositions()` → `Position[]` shape
   - `getFxcmOrders()` → `Order[]` shape
   - `getFxcmClosedTrades()` → `Activity[]` shape (for Phase 2)

2. Extend hooks in `data/hooks.ts`:
   - `useAccount()`: add FXCM branch
   - `usePositions()`: add FXCM branch
   - `useOrders()`: add FXCM branch
   - Leave `usePnlHistory()` returning empty array for forex

3. Adapt components:
   - `PortfolioHero.tsx`: conditional stats grid (hide pnl-history sparkline for forex)
   - `Positions.tsx`: add forex-specific columns, hide day-P/L %, conditional table rows
   - `Orders.tsx`: map FXCM status enum, reuse rest of logic
   - `AllocationDonut.tsx`: no changes (works as-is)

4. Testing:
   - Verify all endpoints return expected shapes
   - Test with Render bridge (real data)
   - Mobile layout (card/table switching)
   - Error states (bridge offline → 503 graceful fallback)

---

### Phase 2: Activities + P/L Curve (Post-Bridge Work)
**Blocker:** `/api/fxcm/closed_trades` lacks timestamps

**Bridge work needed:**
- Add `open_time` / `close_time` fields to closed-trades response
- Calculate per-trade `realized_pl` (close_price - open_price × amount)
- Optionally: time-series aggregation for daily P/L curve

**Once bridge updated:**
- Wire up `getFxcmClosedTrades()` → `Activity[]` adapter
- Extend `useActivities()` with FXCM branch
- Un-comment Activities component in Portfolio

---

### Phase 3: Multi-Asset Readiness (Post-Phase 2)
**Scope:** Ensure Portfolio works for **all FXCM assets**, not just forex

**Tasks:**
- Symbol type classification (forex pairs vs. indices vs. metals vs. CFDs)
- Allocation donut coloring (sector for stocks, category for crypto, instrument type for FXCM?)
- Search integration (ensure all FXCM instruments surface in Discover)
- Workspace widgets (if Phase 2 complete)

---

## Critical Gaps & Mitigations

| Gap | Impact | Mitigation |
|---|---|---|
| No timestamps on `closed_trades` | Cannot build Activities blotter or daily P/L curve | Phase 2 bridge work; until then: Activities tab shows "Coming soon" |
| No intraday P/L breakdown | Hero day-P/L chip always 0 | Render "—" instead of 0% |
| No fees/commissions | Activities cannot show per-trade cost | Always show net P/L; no "Fee" column |
| Margin model differences | BP calculations differ from Alpaca | Adapt terminology: "Available Margin" instead of "Buying Power" |
| No order TIF / extended hours | Simpler order model | FXCM orders have no TIF; component ignores TIF column for forex |

---

## Type Contracts (Data Shapes)

### Account Unified Shape
```ts
interface Account {
  equity: number;           // total equity
  cash: number;             // cash balance
  buying_power: number;     // available for trading (Alpaca) / usable margin (FXCM)
  non_marginable_buying_power?: number; // cash-only BP for crypto
  portfolio_value: number;  // equity + open positions value
  initial_margin?: number;  // (optional for crypto)
  daytrading_buying_power?: number; // (empty for forex/crypto)
}

// FXCM → Account adapter:
const fxcmAccount = { balance, equity, usable_margin, used_margin };
const account: Account = {
  equity: fxcmAccount.equity,
  cash: fxcmAccount.balance,
  buying_power: fxcmAccount.usable_margin,
  // non_marginable_buying_power: undefined (FXCM has no crypto-specific cash)
  portfolio_value: fxcmAccount.equity,
};
```

### Position Unified Shape
```ts
interface Position {
  symbol: string;
  qty?: number;              // shares/units
  filled_qty?: number;       // notional orders have qty=null
  notional?: number;         // $ amount for notional orders
  avg_fill_price: number;
  current_price: number;
  market_value: number;
  cost_basis: number;
  unrealized_pl: number;     // total P/L
  unrealized_intraday_pl: number; // today only (0 for FXCM)
  unrealized_intraday_plpc: number; // day % (0 for FXCM)
  change_today: number;      // (computed or fallback to unrealized_intraday_pl)
  asset_class: "stocks" | "crypto" | "forex";
}

// FXCM → Position adapter:
const fxcmPosition = { instrument, amount, open_price, current_price, pl };
const position: Position = {
  symbol: fxcmPosition.instrument,
  qty: fxcmPosition.amount,
  filled_qty: undefined,
  avg_fill_price: fxcmPosition.open_price,
  current_price: fxcmPosition.current_price,
  market_value: fxcmPosition.amount * fxcmPosition.current_price,
  cost_basis: fxcmPosition.amount * fxcmPosition.open_price,
  unrealized_pl: fxcmPosition.pl,
  unrealized_intraday_pl: 0, // N/A for FXCM
  unrealized_intraday_plpc: 0,
  change_today: 0,
  asset_class: "forex",
};
```

### Order Unified Shape
```ts
interface Order {
  id: string;
  symbol: string;
  qty?: number;
  notional?: number;
  order_type: "market" | "limit" | "stop" | "stop_limit" | "trailing_stop";
  time_in_force: "day" | "gtc" | "opg" | "cls" | "ioc" | "fok";
  limit_price?: number;
  stop_price?: number;
  trail_price?: number;
  filled_qty?: number;
  filled_avg_price?: number;
  status: string; // "pending" | "filled" | "canceled" | "rejected" | "expired"
  created_at: string; // ISO 8601
  updated_at: string;
}

// FXCM → Order adapter:
const fxcmOrder = { order_id, instrument, order_type, amount, rate, stop, limit, status };
const order: Order = {
  id: fxcmOrder.order_id,
  symbol: fxcmOrder.instrument,
  qty: fxcmOrder.amount,
  order_type: fxcmOrder.order_type === "OM" ? "market" : "limit", // SE/LE → limit
  time_in_force: "gtc", // FXCM default (not exposed in API)
  limit_price: fxcmOrder.rate,
  stop_price: fxcmOrder.stop || undefined,
  status: fxcmOrder.status.toLowerCase(),
  created_at: "", // (N/A — FXCM doesn't return timestamps)
  updated_at: "",
};
```

---

## Success Criteria (Validation)

- ✅ Existing Alpaca Portfolio flow unchanged
- ✅ FXCM Portfolio page renders with identical layout (hero, allocation, positions, orders)
- ✅ All data hooks route correctly to FXCM endpoints
- ✅ Missing FXCM fields display gracefully ("—" or fallback value)
- ✅ Mobile responsive layout works for all silos
- ✅ Bridge offline (503) → graceful degradation (empty balances, error banner)
- ✅ Ready for multi-asset FXCM catalog (not just forex pairs)

---

## Open Questions for User

Before implementation, please clarify:

1. **P/L Curve Priority:** How important is the daily P/L curve sparkline for FXCM Portfolio? 
   - If high priority, we'll need bridge work to add timestamps to closed_trades.
   - If acceptable to omit in Phase 1, we can defer.

2. **Activities Timing:** When do you want Activities (closed trades history) blotter live?
   - Phase 1 (hero + positions + orders) launches without it.
   - Phase 2 (post-bridge work) includes Activities.
   - OK to show "Coming soon" placeholder?

3. **Allocation Donut Coloring:** For FXCM assets (indices, metals, CFDs), how should we color the allocation donut?
   - Option A: Monochrome (all same color, like forex pairs)
   - Option B: By asset type (forex=orange, indices=blue, metals=gold, CFDs=gray)
   - Option C: Wait for multi-asset asset catalogue (future)

4. **Workspace Widgets:** Should we build Workspace Portfolio widgets alongside the main Portfolio page?
   - If yes, Phase 3 post Phase 2.
   - If no, can defer indefinitely.

5. **Testing:** Do you have sandbox access to the Render bridge for real-data testing?
   - If yes, we can validate responses during Phase 1.
   - If no, we'll mock FXCM responses.

---

## Next Steps (Immediate)

1. **Review & Approve:** Read all 5 analysis documents (listed below) and confirm recommendations.
2. **Resolve Open Questions:** Answer the 5 questions above.
3. **Assign Implementation:** Once approved, agents can begin Phase 1 coding.

---

## Reference Documents (Generated by Agents)

- 📄 **`ALPACA_PORTFOLIO_REFERENCE.md`** — Alpaca architecture deep-dive (Agent 1)
- 📄 **`FXCM_BRIDGE_CAPABILITIES.md`** — Bridge API mapping & gaps (Agent 2)
- 📄 **`FXCM_ORDERS_ACTIVITIES_ANALYSIS.md`** — Orders/Activities component mapping (Agent 3)
- 📄 **`FXCM_HOOKS_ARCHITECTURE.md`** — Data layer design (Agent 4)
- 📄 **`FXCM_UI_COMPONENT_ARCHITECTURE.md`** — UI component design (Agent 5)
- 📄 **`FXCM_PORTFOLIO_ANALYSIS.md`** — Initial analysis doc (Human)

---

## Implementation Dependencies

**No blocking dependencies.** All components, hooks, and adapters can be built in parallel.

**Recommended sequence (to minimize merge conflicts):**
1. Create `api.ts` adapter functions (lowest-level)
2. Extend hooks in `data/hooks.ts` (depends on step 1)
3. Adapt PortfolioHero, Positions, Orders components (depends on step 2)
4. Test integration (full flow)
5. Phase 2 (Activities) waits for bridge work

---

## Commit Strategy

Each logical change gets its own commit to `claude/portfolio-fxcm-updates`:

- `1.0.1` — API adapters (getFxcmAccount, etc.)
- `1.0.2` — Hook extensions (useAccount for forex, etc.)
- `1.0.3` — PortfolioHero FXCM support
- `1.0.4` — Positions & Orders FXCM support
- `1.0.5` — Integration tests + full Portfolio end-to-end
- (Phase 2 commits after bridge work)

**Version bump:** Each phase resets Z to 0 on main merge (Y +1).
