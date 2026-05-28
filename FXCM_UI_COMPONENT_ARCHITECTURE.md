# FXCM UI Component Architecture

## Recommendation: Option B (Data-Layer Branching)

**Rationale:** The Alpaca/Crypto silos already branch at the data layer via `usePositions()`, `useOrders()`, and `usePnlHistory()` — which filter or reshape results based on asset class. FXCM follows the same pattern: `useFxcmPositions()`, `useFxcmAccount()` are discrete query hooks. Components accept a single `assetClass: "stocks" | "crypto" | "forex"` prop and conditionally call hooks (gated by `enabled` param) — no render branching needed. This keeps components generic and data flows explicit.

**Why not A or C?**
- **Option A (component-level branching):** Creates parallel render trees and duplicates UI logic (e.g., `if forex return <FxcmHeroUI /> else <AlpacaHeroUI />`). Maintenance burden.
- **Option C (sibling components):** `FxcmPositions.tsx`, `FxcmOrders.tsx` sound clean but violate DRY — the table layouts are 95% identical except for field mappings.

---

## Component Adaptation Table

| Component | Current Pattern | FXCM Changes | Branching Logic |
|-----------|-----------------|--------------|-----------------|
| **PortfolioHero** | `assetClass` prop; filters positions by `isCryptoPosition()`; calls `usePnlHistory()` | Forex: read `useFxcmAccount()` (equity, day_pl) + `useFxcmPositions()` (holdings); skip pnl-history | `if (assetClass === "forex") useForexHero() else usePnlHistory()` |
| **AllocationDonut** | Position array only; generic; colors by array index | Forex positions: same array structure (symbol, market_value); no sector/category metadata | No changes; treats positions as opaque objects |
| **Positions** | Alpaca/crypto columns: Symbol/Qty/Avg/Price/Day%/Return%; filters by `isCryptoPosition()` | Forex adds: Open Price, Stop Loss, Take Profit (if set); hides "Day %" (FXCM has no intraday tracking); Qty always numeric (no notional) | `if (assetClass === "forex")` render forex column set else alpaca/crypto |
| **Orders** | Status enum labels; Alpaca type/TIF/price triples | Forex orders: simpler schema (status ∈ {Pending, Executed, Expired, Rejected}); always market/limit; no trailing stops | Conditional TYPE_LABEL + status mapping per silo |
| **Activities** | Heterogeneous feed (fills, divs, fees, transfers) | Forex: closed_trades table (trade_id, open_time, close_time, side, symbol, qty, open_price, close_price, pnl) | Map closed_trades to Activity shape; describe() function handles forex trades |

---

## Props & Hook Contract

### Prop Flow
All Portfolio components accept `assetClass: "stocks" | "crypto" | "forex"` as the single silo selector.

```tsx
// Portfolio container (App.tsx → PortfolioPage)
<PortfolioHero assetClass={assetClass} />
<Positions assetClass={assetClass} />
<Orders assetClass={assetClass} />
<Activities assetClass={assetClass} />
<AllocationDonut positions={siloPositions} />
```

### Hook Calling Convention (Data Layer)
Each hook encodes branching via `enabled` param (TanStack Query):

```tsx
// PortfolioHero.tsx — current (Alpaca/Crypto)
const history = usePnlHistory(assetClass);  // Alpaca-backed; ignored for forex
const account = useAccount();                 // Alpaca; forex must call useFxcmAccount()

// Adapted version:
const isForex = assetClass === "forex";
const account = useAccount();                         // Alpaca (enabled if !isForex)
const fxcmAccount = useFxcmAccount(isForex);         // Forex (enabled if isForex)
const history = usePnlHistory(assetClass);           // Alpaca (enabled if !isForex)

// In render:
const acct = isForex ? fxcmAccount.data : account.data;
```

### Data Shape Mapping

| Field | Alpaca Account | FXCM Account | Hero Stat |
|-------|---|---|---|
| Cash | `cash` | `balance - usedmargin` | "Cash" (stocks) / omitted (crypto/forex) |
| Buying Power | `buying_power` or `non_marginable_buying_power` | `balance - usedmargin` | "Buying power" |
| Holdings | sum of positions' `market_value` | sum of positions' `market_value` | Left-side big number |
| Day P/L | sum of `unrealized_intraday_pl` | `day_pl` field | "Day ↑/↓ chip" |
| Total P/L | sum of `unrealized_pl` | `equity - balance` (all-time) | "Total P/L" stat |

---

## Component Adaptation Sketches

### 1. PortfolioHero (minimal diff)

```tsx
export default function PortfolioHero({ assetClass }: { assetClass: "stocks" | "crypto" | "forex" }) {
  const account = useAccount();
  const fxcmAccount = useFxcmAccount(assetClass === "forex");
  
  const isForex = assetClass === "forex";
  const acct = isForex ? fxcmAccount.data : account.data;
  
  // Data wrangling — existing logic reused
  const holdings = siloPositions.reduce((s, p) => s + p.market_value, 0);
  const unrealized = siloPositions.reduce((s, p) => s + p.unrealized_pl, 0);
  
  // Forex: day_pl from account; others: sum of unrealized_intraday_pl
  const dayPl = isForex
    ? fxcmAccount.data?.day_pl ?? 0
    : siloPositions.reduce((s, p) => s + p.unrealized_intraday_pl, 0);
  
  // Stats grid shape — assetClass selects label set and omits pnl-history for forex
  const stats = isForex
    ? [
        { label: "Balance", value: money(acct?.balance ?? 0) },
        { label: "Buying power", value: money((acct?.balance ?? 0) - (acct?.usedmargin ?? 0)) },
        { label: "Used margin", value: money(acct?.usedmargin ?? 0) },
        { label: "Total P/L", value: `${...}${money(unrealized)}`, color: ... },
      ]
    : [ /* existing Alpaca/Crypto stats */ ];
  
  return (
    // Existing hero structure reused — layout and curve rendering unchanged
    <div className="rounded-card-lg mb-6 grid" ...>
      {/* LEFT: Forex has no pnl-history sparkline; show placeholder "No curve" */}
      {isForex ? (
        <div style={{ minHeight: 70, color: "var(--mute)" }}>
          {/* Forex has no daily snapshots; skip curve */}
        </div>
      ) : (
        // Existing SVG curve
      )}
      
      {/* RIGHT: Conditional stats grid */}
      <div className="grid" style={{ gridTemplateColumns: isMobile ? "repeat(3, ...)" : "1fr 1fr" }}>
        {stats.map(...)}
      </div>
    </div>
  );
}
```

### 2. Positions (conditional columns + closed_trades fallback)

```tsx
export default function Positions({ assetClass }: { assetClass: AssetClassMode }) {
  const positions = usePositions();
  const fxcmPositions = useFxcmPositions(assetClass === "forex");
  
  const isForex = assetClass === "forex";
  const data = isForex ? fxcmPositions.data?.positions : positions.data?.positions;
  const siloPositions = (data || []).filter((p) =>
    assetClass === "forex" ? true : assetClass === "crypto" ? isCryptoPosition(p) : !isCryptoPosition(p)
  );
  
  // Mobile renders StripCard (generic over silo — works because data is positional)
  if (isMobile) {
    return (
      <div>
        {siloPositions.map((p) => (
          <StripRow
            p={p}
            onSelect={(s) => onSelectChart(s)}
            onCloseClick={(pos) => setClose(pos)}
          />
        ))}
      </div>
    );
  }
  
  // Desktop table: conditional column headers + cell formatters
  return (
    <table>
      <thead>
        <tr>
          <th>Symbol</th>
          <th>Qty</th>
          <th>Avg price</th>
          <th>Current</th>
          {!isForex && <th>Day %</th>}
          <th>Return %</th>
          {isForex && <th>SL / TP</th>}
          <th></th>
        </tr>
      </thead>
      <tbody>
        {siloPositions.map((p) => (
          <tr key={p.symbol}>
            <td>{p.symbol}</td>
            <td>{p.qty}</td>
            <td>{money(p.avg_entry_price)}</td>
            <td>{fmtPrice(p.current_price)}</td>
            {!isForex && <td>{pct(p.unrealized_intraday_plpc)}</td>}
            <td style={{ color: signed(p.unrealized_pl) }}>{pct(p.unrealized_plpc)}</td>
            {isForex && <td>{formatStopLimitPair(p)}</td>}
            <td>
              <button onClick={() => setClose(p)}>Close</button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

---

## Mobile Layout Considerations

All Portfolio components **already scale** via `useMobile()` hook. FXCM adds no new mobile paths:

- **PortfolioHero:** Mobile collapses to 1-col hero + 3-col mini-stats. Forex omits pnl sparkline (no history) → simpler left side.
- **Positions:** Mobile renders `StripRow` card variant (not a table). Conditional columns `return <StripRow />` before table logic — works for all silos.
- **Orders/Activities:** Card-list variants already generic; forex data shapes fit existing templates.

---

## Fallback UI for Missing Data

When FXCM bridge is offline (503) or data fields are undefined:

| Component | Field | Fallback |
|-----------|-------|----------|
| PortfolioHero | `balance`, `equity`, `day_pl` | "—" (em-dash) for numbers; hero skips curve entirely |
| Positions | `open_price`, `current_price` | "—" for prices; qty and symbol always present |
| Orders | `status` | "Unknown" (styled as neutral mute color) |
| Activities | `closed_trades` | Empty card with "No closed trades yet." message |

Example in code:
```tsx
const safeMoney = (n: unknown) => n != null && !Number.isNaN(n) ? money(n) : "—";
```

---

## Styling & Accent Token Reuse

**Forex accent already defined** in `index.css` as `--amber: oklch(78% 0.14 75)`. This is the forex-silo color per CLAUDE.md (amber/orange).

1. **Accent switching** happens in `App.tsx` (already live per asset class):
   ```tsx
   document.documentElement.style.setProperty("--accent", 
     assetClass === "stocks" ? "var(--pos)" : assetClass === "crypto" ? "..." : "var(--amber)"
   );
   ```

2. **Component styling:** No changes. PortfolioHero, cards, buttons use `var(--accent)` which is set globally by the silo.

3. **Mobile spacing:** Forex uses the same `--mob-*` tokens; no adjustments needed.

---

## Key Branch Points (Minimal Diffs)

**Files to touch:**
1. `components/PortfolioHero.tsx` — add `useFxcmAccount()` call + `if (assetClass === "forex")` stats array
2. `components/Positions.tsx` — conditional columns + `useFxcmPositions()` call
3. `components/Orders.tsx` — FXCM status enum mapping (if orders surface is implemented for forex)
4. `components/Activities.tsx` — map `closed_trades` to Activity shape (if implemented)
5. `hooks/useAssetClass.ts` — already has `registerFxcmSymbols()` populated at boot

**No new components needed.** Existing layout + mobile infrastructure reused as-is.

---

## Implementation Checklist

- [ ] Map FXCM `FxcmPosition` to `Position` shape (or accept both in components)
- [ ] Add `useFxcmAccount()` hook to data/hooks.ts (if not already present)
- [ ] Add conditional `if (assetClass === "forex")` blocks in PortfolioHero (account source, stats, sparkline)
- [ ] Add forex column conditionals in Positions table (hide "Day %", show "SL / TP")
- [ ] Implement `closed_trades` → `Activity` mapper for Activities view
- [ ] Test mobile StripRow / card rendering with forex data
- [ ] Verify accent token switching (already in App.tsx per CLAUDE.md)
