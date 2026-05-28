# Alpaca Portfolio Architecture Reference

**Purpose:** Document the Alpaca Portfolio screen design for replication/adaptation to FXCM and other silos.

---

## 1. Data Flow Diagram

```
API Endpoints                  React Hooks                Components              UI Output
┌──────────────────┐          ┌──────────────┐            ┌──────────────┐
│ /api/account     │ ────────→│ useAccount() │            │ PortfolioHero│
│ /api/positions   │ ────────→│ usePositions()│          │              │
│ /api/pnl-history │ ────────→│ usePnlHistory()│ ───────→│ AllocationDot│
│ /api/orders      │ ────────→│ useOrders()  │           │ Positions    │
│ /api/activities  │ ────────→│ useActivities()          │ Orders       │
└──────────────────┘          └──────────────┘           │ Activities   │
                                                         └──────────────┘
                              [15-60s refetch intervals]
```

### API Endpoints Summary
| Endpoint | Hook | Refetch | Purpose |
|----------|------|---------|---------|
| `/api/account` | `useAccount()` | 15s | Buying power, cash, margin, equity |
| `/api/positions` | `usePositions()` | 15s | Open positions with market_value, unrealized_pl, cost_basis |
| `/api/pnl-history` | `usePnlHistory(assetClass)` | 60s | P/L curve for all time (computed from fills) |
| `/api/orders` | `useOrders(status, limit)` | 20s | Open/closed orders, TIF, pricing |
| `/api/activities` | `useActivities(limit)` | 30s | Trade journal: fills, transfers, dividends |

---

## 2. Component Responsibilities Matrix

| Component | Responsibility | Props | Data Sources |
|-----------|---|---|---|
| **PortfolioHero** | Account snapshot + silo-filtered totals + curve | `assetClass: "stocks" \| "crypto"` | useAccount, usePositions, usePnlHistory, useOrders |
| **AllocationDonut** | Position allocation visualization | `positions[], colors[], title` | Raw Position array (no hook) |
| **Positions** | Open positions table/cards + close UI | `assetClass, symbol, variant, compact, dense, bare` | usePositions, useClosePosition, useCloseAllPositions |
| **Orders** | Pending/filled orders table/cards + modify UI | `assetClass, symbol, dense, mid, bare` | useOrders, useCancelOrder, useCancelAllOrders |
| **Activities** | Trade journal table/cards | `assetClass (implicit), symbol, dense, bare` | useActivities |

---

## 3. Field Transformations & Calculations

### PortfolioHero: Aggregates (per asset class)

**Alpaca Position fields** → **Aggregated metrics:**
```typescript
siloPositions = positions.filter(p => isCryptoPosition(p) === (assetClass === "crypto"))

holdings = SUM(p.market_value)               // Current position value
unrealized = SUM(p.unrealized_pl)            // Total gain/loss (cost_basis to market_value)
costBasis = SUM(p.cost_basis)                // Total invested (sum of qty * avg_entry_price)
unrealizedPct = unrealized / costBasis       // % return (if costBasis > 0)

dayPl = SUM(p.unrealized_intraday_pl)        // Day P/L (opens value minus current)
dayBasis = holdings - dayPl                  // Yesterday's close value
dayPlPct = dayPl / dayBasis                  // Day return %
```

**Account fields** → **Statement stats:**
```typescript
// Crypto silo
buyingPower = acct.non_marginable_buying_power  // Cash only (no margin)
cash = acct.cash

// Stocks silo  
buyingPower = acct.buying_power                 // May include margin
cash = acct.cash
marginUsed = acct.initial_margin
netEquity = holdings - marginUsed               // Cash + positions - margin
```

### Positions: Per-row calculations
```typescript
// Desktop (StripRow) / Mobile (StripRowMobile) both show:
dayUp = p.change_today >= 0
plUp = p.unrealized_pl >= 0

Qty Column: p.qty                               // Shares (stocks) or units (crypto)
Price Cols:
  · Mark: p.current_price                       // Live market price
  · Day change: p.change_today % (intraday)
  · Avg: p.avg_entry_price                      // FIFO/weighted cost
Value Cols:
  · Market value: p.market_value                // qty × current_price
  · Unrealized P/L: p.unrealized_pl             // market_value - cost_basis
  · Unrealized %: p.unrealized_plpc             // unrealized_pl / cost_basis
```

**Crypto-specific formatting:**
- `current_price` → `fmtCryptoPrice(p.current_price)` (magnitude ladder: 2-8 decimals)
- `avg_entry_price` → `fmtCryptoPrice(p.avg_entry_price)`
- Stock prices → `money(n)` (USD, 2 decimals)

### Orders: Qty and Value resolution
```typescript
// Notional (dollar) orders have qty=null; executed size in filled_qty
orderQty(o) = o.qty ?? (o.filled_qty || null)

// Value = executed or requested notional
orderValue(o) = 
  o.qty != null && o.filled_avg_price  
    ? o.filled_avg_price × o.qty                // Filled market orders
  : o.qty != null && o.limit_price              
    ? o.limit_price × o.qty                     // Limit order
  : o.qty != null && o.stop_price               
    ? o.stop_price × o.qty                      // Stop order
  : o.notional                                  // Notional (dollar) order
```

### Activities: Heterogeneous payload parsing
```typescript
// Alpaca activities mixes FILL, PARTIAL_FILL, CASH, DIV, INT, JNLC
describe(a) = 
  a.symbol ? `${a.side} ${a.qty} ${a.symbol} @ ${a.price}`.trim()
           : a.description || `Net ${a.net_amount}` || "—"

whenOf(a) = new Date(a.transaction_time || a.date || a.activity_timestamp)
           .toLocaleString({ month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })
           // Compact "5/21 09:32" format
```

---

## 4. Asset-Class Branching Points

### Filtering
```typescript
// Universal pattern across all Portfolio components:
isCryptoPosition(p) = p.asset_class === "crypto" || p.symbol.includes("/")
isCryptoOrder(o) = o.symbol.includes("/")

// Component-level filter:
rows = rows.filter(item => 
  assetClass === "crypto" 
    ? isCryptoPosition(item) || isCryptoOrder(item)
    : !isCryptoPosition(item) && !isCryptoOrder(item)
)
```

### PortfolioHero: Conditional stat grid
```typescript
// Crypto: 3-stat grid
Buying Power | Total P/L | Open Orders

// Stocks: 5-stat grid  
Cash | Buying Power | Net Equity | Total P/L | Open Orders
```

### Formatting
```typescript
// Price columns
isCryptoPosition(p) 
  ? fmtCryptoPrice(p.current_price)
  : money(p.current_price)

// Qty label
isCryptoPosition(p) ? "units" : "shares" / "sh" (mobile)
```

### P/L Curve (PortfolioHero)
```typescript
// `/api/pnl-history` endpoint requires asset_class parameter:
usePnlHistory(assetClass)  // "stocks" or "crypto"
// Returns per-silo P/L array (FILL-based, not portfolio snapshot history)
```

---

## 5. Key Abstractions & Patterns

### Layout Patterns
**Mobile breakpoint:** `640px` (via `useMobile()` hook, matches `@media (max-width: 640px)`)
```typescript
useMobile() = matchMedia("(max-width: 640px)").matches
```

**Responsive variants:**
- **Desktop:** Full-width tables (grid-based rows)
- **Mobile/dense:** Stacked cards (vertical flex)
- **Mid:** Intermediate table (hides TIF + Submitted columns)

### State-Lifting Pattern (Positions & Orders)
```typescript
// Modal/card state lives in parent component:
const [closingPos, setClosingPos] = useState<Position | null>(null)
const [customizingPos, setCustomizingPos] = useState<Position | null>(null)
const [confirmCloseAll, setConfirmCloseAll] = useState(false)

// Child handlers pass back selected item:
<Row onCloseClick={setClosingPos} ... />
```

### Inline Confirm Strip (Orders)
```typescript
// Cancel-all action swaps toolbar row (not a modal):
{confirmCancelAll ? (
  <>
    <span>Cancel all {n} working orders?</span>
    <button onClick={...mutate}>Yes, cancel</button>
    <button onClick={() => setConfirmCancelAll(false)}>Keep them</button>
  </>
) : (
  <div>Status tabs + Cancel all button</div>
)}
```

### Error Boundary
All components wrap data errors in `<ErrorBanner message={error.message} />`

### Loading States
- **Pending (before first fetch):** Skeleton rows/cards (3 placeholders)
- **Refetching:** Existing data remains visible (no flicker)

### Status & Enum Handling
```typescript
// Alpaca returns Python repr sometimes ("OrderStatus.FILLED" vs "filled"):
enumTail(s: string) = s.split(".").pop()!.toLowerCase()

// Terminal status set:
const TERMINAL = new Set(["filled", "canceled", "cancelled", "expired", "rejected", "done_for_day", "replaced"])
const live(o: Order) = !TERMINAL.has(enumTail(o.status))
```

### Formatting Helpers
```typescript
money(n) = n.toLocaleString("en-US", { style: "currency", currency: "USD" })  // "1,234.56"
pct(n) = `${n >= 0 ? "+" : ""}${(n * 100).toFixed(2)}%`                       // "+5.00%"
fmtCryptoPrice(n) = {
  if (n >= 1) return n.toFixed(2)           // BTC: 67234.56
  if (n >= 0.01) return n.toFixed(4)        // DOGE: 0.3456
  if (n >= 0.0001) return n.toFixed(6)      // small alt: 0.000123
  else return n.toFixed(8)                  // micro: 0.00000001
}
```

---

## 6. Generic vs. Alpaca-Specific Patterns

### GENERIC (Will work for FXCM)
✓ Two-column hero + stat grid layout  
✓ Asset-class filtering via symbol detection  
✓ Sidebar allocation donut visualization  
✓ Positions table with close actions  
✓ Orders table with modify/cancel  
✓ Activities blotter with heterogeneous payloads  
✓ Mobile/desktop responsive split (640px breakpoint)  
✓ Skeleton loading states  
✓ Inline status bars for bulk actions  
✓ Refetch intervals (15-60s polling)  

### ALPACA-SPECIFIC (Needs adaptation)
✗ `/api/pnl-history` → FXCM may need custom P/L calculation  
✗ `cost_basis` + `unrealized_pl` aggregation → May need from positions, not explicit  
✗ `non_marginable_buying_power` (crypto cash only) → FXCM has different margin model  
✗ `initial_margin` for net equity calculation → FXCM uses `used_margin`  
✗ `filled_avg_price` in Order responses → FXCM's fill tracking differs  
✗ Notional order support (qty=null) → Forex may not have dollar entry  
✗ Activity type enum ("FILL", "DIV", "INT") → FXCM has different activity types  

---

## 7. Component Prop Interface Summary

### PortfolioHero
```typescript
props: { assetClass: "stocks" | "crypto" }
```

### AllocationDonut
```typescript
props: {
  positions: Position[] | undefined
  colors?: string[]                          // defaults to DONUT_COLORS
  title?: string                             // defaults to "Allocation"
}
```

### Positions
```typescript
props: {
  variant?: "strip" | "table"                // card or table
  onSelect?: (symbol: string) => void        // click to switch to chart
  assetClass?: "stocks" | "crypto"           // filter
  symbol?: string                            // filter to one
  dense?: boolean                            // mobile/workspace mode
  compact?: boolean                          // tighter padding
  bare?: boolean                             // no card styling (workspace)
}
```

### Orders
```typescript
props: {
  assetClass?: "stocks" | "crypto"           // filter
  symbol?: string                            // filter to one
  dense?: boolean                            // card mode
  mid?: boolean                              // intermediate width (table, fewer cols)
  bare?: boolean                             // no panel styling
}
```

### Activities
```typescript
props: {
  bare?: boolean
  symbol?: string                            // filter to one
  dense?: boolean
}
```

---

## 8. Query Cache & Invalidation

### Refetch Schedule
```
Account:     15s   (buying_power, cash, margin)
Positions:   15s   (market_value, P/L, price)
Orders:      20s   (order status, fills)
Activities:  30s   (new trades, fills)
P/L History: 60s   (curve rebuild from fills)
```

### Trade Invalidation (Post-mutation)
After any order/position write (submit, cancel, close):
```typescript
useTradeInvalidation() {
  qc.invalidateQueries({ queryKey: ["orders"] })
  qc.invalidateQueries({ queryKey: qk.positions })
  qc.invalidateQueries({ queryKey: qk.account })
}
// Activities will auto-refetch on its 30s interval
```

---

## 9. Mobile Layout Notes

### PortfolioHero
- **Desktop:** `gridTemplateColumns: "1.4fr 1fr"` (60/40 split)
- **Mobile:** `gridTemplateColumns: "1fr"` (single column, LEFT above RIGHT)
- **Mobile stat grid:** 3 columns (instead of 2)

### Positions & Orders
- **Desktop:** Horizontal table (6–11 columns)
- **Mobile (≤640px):** Stacked card list (3-stat grid inside each card)
- **Mid width (600–760px):** Table with hidden TIF/Submitted (shorter rows)

### All Components
- Hero + donut: Natural responsive (no special breakpoint)
- Positions/Orders/Activities: Boolean `dense || useMobile()` switches variant
- Sidebar collapse: Desktop-only feature (mobile always linear)

---

## 10. Key Files

| File | Purpose |
|------|---------|
| `frontend/src/components/PortfolioHero.tsx` | Account snapshot + curve |
| `frontend/src/components/AllocationDonut.tsx` | Position allocation visualization |
| `frontend/src/components/Positions.tsx` | Open positions table/cards |
| `frontend/src/components/Orders.tsx` | Orders table/cards |
| `frontend/src/components/Activities.tsx` | Activities table/cards |
| `frontend/src/data/hooks.ts` | All data fetching hooks (lines 36–104, 513–560) |
| `frontend/src/lib/asset-class.ts` | `isCryptoPosition()`, `isCryptoOrder()`, `normalize_crypto_symbol()` |
| `frontend/src/lib/format.ts` | `money()`, `fmtCryptoPrice()` |

---

## Summary

**The Alpaca Portfolio is a tightly integrated five-component suite** driven by four core API endpoints (account, positions, orders, activities) on 15–60s polling intervals. **Filtering and formatting are asset-class aware**, using symbol detection (`/` = crypto) as the primary silo classifier. **Layouts are responsive** (640px breakpoint), with desktop tables and mobile card stacks. **State is lifted** to parent components for modal/confirm flows.

**For FXCM adaptation:** Replace Alpaca API calls with FXCM proxy endpoints, adapt margin/P/L calculation logic, preserve the layout/component structure, and reuse generic patterns (filtering, responsive split, refetch cadence, state lifting, error handling).

