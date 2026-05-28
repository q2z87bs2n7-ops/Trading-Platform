# FXCM Portfolio Build — Comprehensive Analysis & Plan

**Objective:** Build a Portfolio screen for FXCM/Forex that replicates the existing Alpaca flow with minimal, asset-class-aware changes. This is the foundation for integrating all FXCM assets (forex pairs, indices, metals, commodities, CFDs).

**Status:** Analysis phase — 5 agent investigations + architectural decisions pending.

---

## 1. Existing Alpaca Portfolio Architecture (Reference Model)

### Structure
The current Portfolio page (`mode === "portfolio"`, triggered via header pill) consists of:

1. **PortfolioHero** — Account-level snapshot
   - LEFT: Title + equity value + day P/L chip (colored) + ~70px area-filled PnL curve
   - RIGHT: 2×2 stat grid (Cash · Buying Power · Total P/L · Open Orders) separated by hairline
   - Uses `useAccount()`, `usePositions()`, `usePnlHistory(assetClass)`, `useOrders()`
   - Filters positions/orders by asset class (crypto vs stocks)
   - Mobile collapses to single column

2. **AllocationDonut** — Position allocation visualization
   - Shared component `components/AllocationDonut.tsx`
   - 2D grid layout: donut + legend (sorted by size, biggest first)
   - Renders % allocation per symbol, colored by sector (stocks) or categorical (crypto)
   - Props-based (no silo awareness, works for both)

3. **Positions** — Open positions blotter
   - Desktop: table with columns (Symbol · Qty · Avg · Price · Change today · Return % · Actions)
   - Mobile: stacked card list
   - On-click selects symbol (switches Chart mode)
   - Close button per row, bulk close-all toolbar
   - Filters by asset class, sorts by market value descending
   - Uses `usePositions()`, `useCloseAllPositions()`

4. **Orders** — Pending/filled orders blotter
   - Desktop: table (Symbol · Qty/Value · Type · Price · Status)
   - Mobile: card list
   - Bulk cancel-all toolbar
   - Filters by asset class, sorts by creation descending
   - Uses `useOrders("open", 50)` + `useOrders("filled", 20)`

5. **Activities** — Trade journal (fills + closes)
   - Desktop: table (Date · Symbol · Side · Qty · Price · Fees · PnL)
   - Mobile: card list
   - Sorts by date descending
   - Uses `useActivities()`

### Data Sources
- **Account:** `/api/account` (Alpaca REST)
- **Positions:** `/api/positions` (Alpaca REST)
- **Orders:** `/api/orders` (Alpaca REST)
- **P/L History:** `/api/pnl-history` (Alpaca REST, computed from fills)
- **Activities:** `/api/activities` (Alpaca REST)

### Asset Class Awareness
- All components use `useAssetClass()` hook to detect active silo
- Filters applied at component level: `isCryptoPosition()`, `isCryptoOrder()`
- Formatting: crypto prices use `fmtCryptoPrice()` (magnitude ladder)
- No shared order-entry logic (Alpaca OrderSheet not reusable; FXCM has `FxcmOrderSheet`)

---

## 2. FXCM Current State (Backend + Frontend)

### What's Already Built
- **Backend** (`backend/app/fxcm.py`): FastAPI proxy to FCLite bridge (port 3001)
- **Frontend** (`ForexDiscoverPage.tsx`): Discover-mode silo landing
- **Order Entry** (`FxcmOrderSheet.tsx`): Forex-specific order ticket
- **Chart Support** (`lib/tv-datafeed.ts` + `lib/tv-broker.ts`): TradingView charting with FXCM branches

### FXCM API Endpoints (All Behind `/api/fxcm/*`)
| Endpoint | Purpose | Response Shape | Notes |
|---|---|---|---|
| `GET /account` | Account balance/equity/margin | `FxcmAccount` | Used by ForexDiscoverPage hero |
| `GET /positions` | Open trades | `FxcmPosition[]` | trade_id, instrument, buy_sell, amount, open_price, current_price, P/L |
| `GET /orders` | Pending orders | `FxcmOrder[]` | order_id, instrument, type, amount, rate, status |
| `GET /closed_trades` | Trade history | `FxcmClosedTrade[]` | trade_id, instrument, open_time, close_time, open_price, close_price, P/L |
| `POST /order` | Place order | — | Request: {instrument, buy_sell, amount, order_type, rate, stop, limit} |
| `DELETE /order/{id}` | Cancel pending order | — | — |
| `POST /close` | Close open position | — | Request: {trade_id, amount} |
| `GET /prices` | Live bid/ask | `FxcmPrice[]` | bid, ask, spread (pips) |
| `GET /instruments` | All tradable instruments | `FxcmInstrument[]` | symbol, offer_id, status (T/V/D) |
| `GET /history` | OHLCV bars | `FxcmBar[]` | time, open, high, low, close, ask_open, volume |

### Frontend Types (`src/types.ts`)
```ts
interface FxcmAccount {
  balance: number;
  equity: number;
  used_margin: number;
  free_margin: number;
}

interface FxcmPosition {
  trade_id: string;
  instrument: string; // e.g., "EUR/USD"
  buy_sell: "B" | "S";
  amount: number;
  open_price: number;
  current_price: number;
  unrealized_pl: number; // Not named consistently — check backend
}

interface FxcmOrder {
  order_id: string;
  instrument: string;
  order_type: "OM" | "SE" | "LE"; // Market / Stop Entry / Limit Entry
  amount: number;
  rate: number;
  stop: number;
  limit: number;
  status: string;
}

interface FxcmClosedTrade {
  trade_id: string;
  instrument: string;
  open_time: string; // ISO 8601
  close_time: string;
  buy_sell: "B" | "S";
  amount: number;
  open_price: number;
  close_price: number;
  realized_pl: number;
}
```

### Current Gaps (Must Investigate)
1. **P/L History** — no `/api/fxcm/pnl-history` equivalent. Alpaca computes daily curve from fills; FXCM has closed-trades history. Feasible but needs bridge work.
2. **Intraday P/L** — `FxcmPosition.unrealized_pl` exists; unclear if "today" component is available.
3. **Closed-trades timestamp precision** — do we have second-level granularity for activity sorting?
4. **Daily stats** — buying power / margin / cash concepts differ. FXCM uses margin terminology; Alpaca separates cash/BP.

---

## 3. Agent Investigation Plan

### Agent 1: Current Portfolio Module Deep-Dive (Holdings/Allocation/Positions)
**Scope:** Understand the Alpaca Portfolio components in detail.

**Investigate:**
- `PortfolioHero.tsx`: data sources, stat grid derivation, curve calculation
- `AllocationDonut.tsx`: layout, coloring logic, filtering
- `Positions.tsx`: table/card duality, selection/close interaction, symbol linking to Chart mode
- How positions are aggregated (market_value, unrealized_pl, cost_basis, day P/L)

**Deliverable:**
- Summary of data transformations & layout patterns
- Identify which patterns are Alpaca-specific vs. generic

---

### Agent 2: FXCM Positions & Balance Analysis (Bridge Capabilities)
**Scope:** Map FXCM Bridge capabilities to Portfolio needs.

**Investigate:**
- `backend/app/fxcm.py`: route signatures & response shapes (focus: `/account`, `/positions`, `/closed_trades`, `/orders`)
- `backend/fxcm-bridge/java/FxcmSession.java`: what managers expose (accounts, positions, orders, history)
- `FxcmPosition`, `FxcmAccount` types: fields & consistency
- Whether `/positions` returns per-trade P/L breakdown (today vs. total)
- What `closed_trades` provides: timestamps, fees, commissions

**Questions to Answer:**
1. Can we calculate per-symbol allocation % from live positions?
2. What is the equivalent of `unrealized_intraday_pl` (day P/L)?
3. Can we build a "P/L history" curve from closed_trades? (feasible but slow)
4. Are order statuses standardized (pending/filled/canceled)?

**Deliverable:**
- Mapping table: Alpaca field → FXCM equivalent (or "not available")
- Feasibility assessment for each Portfolio hero stat
- List of bridge work needed (if any)

---

### Agent 3: FXCM Orders & Activities Investigation
**Scope:** Compare Alpaca orders/activities to FXCM orders/closed-trades.

**Investigate:**
- `Orders.tsx`: filtering, sorting, bulk-cancel interaction
- `Activities.tsx`: data source (`useActivities()`), timestamp handling, fees, PnL
- FXCM `/orders` structure (pending vs filled states)
- FXCM `/closed_trades` fields: realized_pl, timestamps, fees (if any)
- Order state machine (OM = market, SE/LE = pending entries)

**Questions to Answer:**
1. Does FXCM distinguish "open pending orders" from "fills"?
2. Are closed_trades sufficient for the Activities blotter?
3. How to handle order fees/commissions (if FXCM returns them)?
4. Is the status field sufficient for the UI (pending/filled/rejected)?

**Deliverable:**
- Field-by-field comparison (Orders table columns)
- Field-by-field comparison (Activities table columns)
- Proposed UI adaptations for FXCM state machine

---

### Agent 4: Data Hooks & API Integration Strategy
**Scope:** Design data layer for FXCM Portfolio.

**Investigate:**
- `data/hooks.ts`: `useAccount()`, `usePositions()`, `usePnlHistory()`, `useOrders()`, `useActivities()`
- How each hook detects asset_class & conditionally enables queries
- Error handling & fallback patterns (graceful 503s)
- Refetch intervals (stale time / refetch intervals)

**Design Decision:**
Should we:
- **A)** Extend existing hooks with FXCM branches (if asset_class === "forex")?
- **B)** Create new hooks: `useFxcmAccount()`, `useFxcmPositions()`, etc.?
- **C)** Unify both into a generic `usePortfolioAccount()` that routes internally?

**Deliverable:**
- Recommended hook architecture (A/B/C + rationale)
- Draft hook signatures for new FXCM endpoints
- Error & loading state strategy

---

### Agent 5: UI Component Architecture & Asset-Class Gating
**Scope:** Plan how PortfolioHero, Allocation, Positions, Orders, Activities adapt to FXCM.

**Investigate:**
- Where asset-class branching happens (componentwise or at data layer?)
- How Props flow through (assetClass prop already exists)
- Mobile responsive layout duality (table vs. card)
- Tailwind theming (forex uses orange/amber accent)

**Architecture Question:**
Should each component:
- **A)** Accept forex-specific prop variants (e.g., `positionsFormat: "fxcm"`)
- **B)** Detect asset class internally & branch UI logic
- **C)** Require a distinct `FxcmPositions` / `FxcmOrders` sibling component?

**Deliverable:**
- Recommendation (A/B/C + rationale)
- Component adaptation checklist (PortfolioHero · Allocation · Positions · Orders · Activities)
- Styling notes (orange accent re-use, spacing, mobile breakpoints)

---

## 4. Key Unknowns (Resolve During Investigation)

| Question | Impact | Resolution |
|---|---|---|
| Can FXCM return **day P/L separately** from total? | Portfolio hero stat grid | Agent 2 → bridge query |
| How to build **P/L history curve**? | Portfolio hero sparkline | Agent 2 + decision: compute live or pre-bake? |
| FXCM **order fee model**? | Activities (cost basis, net PnL) | Agent 3 + docs |
| **Symbol mapping** — how to handle indices/metals/CFDs in allocation donut? | Allocation widget | Design decision + Agent 5 |
| **Buying power / margin concepts** — exact FXCM equivalents? | Hero stat grid | Agent 2 + FXCM docs |
| **Timezone handling** — FXCM times are UTC or account TZ? | Activities blotter | Agent 3 + test query |

---

## 5. Build Phases (Post-Investigation)

### Phase 1: Core Hero + Positions (Minimal)
- ✅ PortfolioHero (account equity + margin stats)
- ✅ Positions blotter (open trades, close action)
- ✅ Orders blotter (pending + market orders)
- 🔄 No allocation donut (defer if data insufficient)
- 🔄 No activities (defer if closed_trades sparse)

### Phase 2: Activities + Allocation (Full Parity)
- ✅ Activities blotter (closed_trades)
- ✅ Allocation donut (if symbol classification works)
- ✅ P/L history curve (if bridge can compute)

### Phase 3: Integration (Multi-Asset Readiness)
- ✅ Extend to all FXCM assets (not just forex pairs)
- ✅ Sector/category coloring for allocation
- ✅ Workspace portfolio widgets (if Phase 2 complete)

---

## 6. Quick Reference: Proposed Module Map

| Alpaca Module | FXCM Equivalent | Data Source | Status |
|---|---|---|---|
| `PortfolioHero.tsx` | Adapt (forex-aware) | `/api/fxcm/account` + `/positions` + `/orders` | Feasible |
| `AllocationDonut.tsx` | Adapt (symbol-agnostic) | `/api/fxcm/positions` | Feasible (defer symbol type coloring) |
| `Positions.tsx` | Adapt (open trades → positions) | `/api/fxcm/positions` | Feasible |
| `Orders.tsx` | Adapt (pending orders + market fills) | `/api/fxcm/orders` | Feasible (state machine differs) |
| `Activities.tsx` | Adapt (closed_trades) | `/api/fxcm/closed_trades` | Feasible (timestamp/fee fields TBD) |

---

## 7. Notes for Agents

1. **No rewrites:** Extend Alpaca components with conditional branches (`if (assetClass === "forex")`) rather than creating parallel components.
2. **Test against production data:** Use the Render bridge during investigation.
3. **Document unknowns:** If a field is missing, note the exact endpoint + query.
4. **Timestamp handling:** FXCM returns ISO strings; confirm TZ handling.
5. **Asset-class filtering:** All FXCM assets (not just forex pairs) will come through — plan for indices/metals/CFDs.

---

## 8. Success Criteria

- ✅ Existing Alpaca Portfolio flow unchanged
- ✅ FXCM Portfolio page renders with 1:1 layout (hero, allocation, positions, orders, activities)
- ✅ All data hooks route to correct FXCM endpoints
- ✅ Components adapt gracefully to missing fields (e.g., no daily P/L → show "—")
- ✅ No hard-coded "Forex" asset class; ready for multi-asset FXCM catalog
- ✅ Mobile responsive layout parity
