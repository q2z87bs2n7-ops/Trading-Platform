# FXCM Portfolio Data Hooks Architecture

## Executive Summary

Recommend **Option A (Extend existing hooks with FXCM branches)** — cleanest contract, minimal surface duplication, and natural fit with the existing asset-class branching pattern already used by `usePnlHistory`, `useWatchlist`, and `usePositions`.

---

## Three Options: Comparison

### Option A — Extend existing hooks with FXCM branches
```ts
function useAccount() {
  const assetClass = useAssetClass();
  if (assetClass === "forex") return useFxcmAccount();
  // existing Alpaca logic
}
```
**Pros:**
- Unified call site — components never check silo
- Call sites unchanged; no migration needed
- Same refetch/enabled/error patterns for all silos
- Consistent with `usePnlHistory(assetClass)` pattern

**Cons:**
- FXCM logic lives inside Alpaca hooks (coupling)
- Harder to optimize FXCM poll cadences independently
- Harder to test branching paths

---

### Option B — New parallel hooks (useFxcm*)
```ts
// Components explicitly switch:
const { data: alpacaAcc } = useAccount();
const { data: fxcmAcc } = useFxcmAccount();
const account = assetClass === "forex" ? fxcmAcc : alpacaAcc;
```
**Pros:**
- Complete separation of concerns
- FXCM can have independent stale times / refetch intervals
- Easy to test each silo in isolation

**Cons:**
- Components responsible for branching (duplication)
- Every surface using accounts/positions/orders needs `if (assetClass === "forex")`
- Fails silently if a component forgets the branch

---

### Option C — Unified generic hook
```ts
function usePortfolioAccount(assetClass: "stocks" | "crypto" | "forex") {
  // Routes internally to /api/account or /api/fxcm/account
}
```
**Pros:**
- Very explicit about silo routing
- Single hook name for all silos

**Cons:**
- Requires passing `assetClass` everywhere (prop drilling)
- Breaks the Alpaca-default pattern (existing code expects no param)
- New mental model vs. the current Alpaca-centric defaults

---

## Recommendation: Option A

**Rationale:**
- `useAssetClass()` hook already exists as the single source of truth for the active silo
- Current codebase already uses asset-class branching in `usePnlHistory(assetClass)` and watchlist hooks
- Portfolio surfaces (PortfolioHero, Positions, Orders) always read the active silo's data, never both
- Components are **silo-aware** (they render Discover/Portfolio/Chart per silo) so branching at the hook level is transparent

---

## Hook Signatures (FXCM Branch)

### New Hooks (parallel to Alpaca)

```ts
// Low-level FXCM reads — enable=false on non-forex silos
export const useFxcmAccount = (enabled = true) =>
  useQuery({
    queryKey: qk.fxcmAccount,
    queryFn: api.getFxcmAccount,
    refetchInterval: 3000,  // 3s when active (tight loop)
    retry: 0,               // 503 bridge offline → fail fast
    enabled,
  });

export const useFxcmPositions = (enabled = true) =>
  useQuery({
    queryKey: qk.fxcmPositions,
    queryFn: api.getFxcmPositions,
    refetchInterval: 3000,
    retry: 0,
    enabled,
  });

export const useFxcmOrders = (enabled = true) =>
  useQuery({
    queryKey: qk.fxcmOrders,
    queryFn: api.getFxcmOrders,
    refetchInterval: 5000,
    retry: 0,
    enabled,
  });
```

### Extended Hooks (branching layer)

```ts
// Existing hook, now with FXCM branch
export const useAccount = () => {
  const assetClass = useAssetClass();
  const alpaca = useQuery({
    queryKey: qk.account,
    queryFn: api.getAccount,
    refetchInterval: 15000,
    enabled: assetClass !== "forex",  // skip Alpaca if forex
  });
  const fxcm = useFxcmAccount(assetClass === "forex");
  
  if (assetClass === "forex") return fxcm;
  return alpaca;
};

// Identical pattern for positions, orders, activities
export const usePositions = () => {
  const assetClass = useAssetClass();
  const alpaca = useQuery({
    queryKey: qk.positions,
    queryFn: api.getPositions,
    refetchInterval: 15000,
    enabled: assetClass !== "forex",
  });
  const fxcm = useFxcmPositions(assetClass === "forex");
  
  if (assetClass === "forex") return fxcm;
  return alpaca;
};

// Orders branch
export const useOrders = (status = "all", limit = 25) => {
  const assetClass = useAssetClass();
  const alpaca = useQuery({
    queryKey: qk.orders(status, limit),
    queryFn: () => api.getOrders(status, limit),
    refetchInterval: 20000,
    enabled: assetClass !== "forex",
  });
  const fxcm = useFxcmOrders(assetClass === "forex");
  
  if (assetClass === "forex") return fxcm;
  return alpaca;
};
```

---

## Return Type Alignment

### Strategy: Shape Convergence via Adapters

FXCM and Alpaca return different structures. Adapt FXCM responses at the API layer (not hooks) so downstream components see a unified shape.

**FxcmAccount → Account adapter:**
```ts
// In api.ts
export const getFxcmAccount = async () => {
  const raw = await getJSON<FxcmAccount>("/api/fxcm/account");
  return adaptFxcmAccount(raw);
};

function adaptFxcmAccount(fxcm: FxcmAccount): Account {
  return {
    account_number: fxcm.account_id?.toString() ?? "fxcm",
    status: "active",
    currency: "USD",
    cash: fxcm.balance ?? 0,
    equity: fxcm.equity ?? 0,
    buying_power: fxcm.usedmargin ?? 0,  // map available margin
    non_marginable_buying_power: fxcm.usedmargin ?? 0,
    portfolio_value: fxcm.equity ?? 0,
    long_market_value: 0,        // N/A for FXCM
    short_market_value: 0,       // N/A for FXCM
    initial_margin: 0,           // N/A
    maintenance_margin: 0,       // N/A
    daytrading_buying_power: 0,  // N/A
    regt_buying_power: 0,        // N/A
    pattern_day_trader: false,
    equity_at_market_open: 0,
  };
}
```

**FxcmPosition → Position adapter:**
```ts
function adaptFxcmPosition(fxcm: FxcmPosition): Position {
  const qty = fxcm.amount ?? 0;
  const entry = fxcm.open_rate ?? 0;
  const current = fxcm.close ?? entry;
  const market_value = qty * current;
  const cost_basis = Math.abs(qty) * entry;
  
  return {
    symbol: fxcm.instrument ?? "UNKNOWN",
    asset_class: "forex",       // Always mark as forex
    qty: qty < 0 ? -qty : qty,  // Absolute qty
    side: qty < 0 ? "short" : "long",
    avg_entry_price: entry,
    current_price: current,
    market_value,
    cost_basis,
    unrealized_pl: fxcm.pl ?? 0,
    unrealized_plpc: (fxcm.pl ?? 0) / (cost_basis || 1),
    unrealized_intraday_pl: fxcm.gross_pl ?? 0,
    unrealized_intraday_plpc: (fxcm.gross_pl ?? 0) / (cost_basis || 1),
    change_today: 0,  // compute from FXCM daily history if available
  };
}
```

**Result:** PortfolioHero, Positions, Orders all call the same `useAccount()` / `usePositions()` / `useOrders()` and get `Account | Position | Order` shapes — no downstream branching needed.

---

## Error Handling & Fallbacks

### Bridge Offline (503)
FXCM bridge may be down (JVM restart, network). Return graceful degraded state:

```ts
export const useFxcmAccount = (enabled = true) =>
  useQuery({
    queryKey: qk.fxcmAccount,
    queryFn: api.getFxcmAccount,
    retry: 0,              // Don't hammer bridge
    enabled,
    onError: (err) => {
      // Log to console/sentry but don't throw
      console.warn("FXCM bridge offline:", err);
    },
  });

// Adapter handles errors: return zero-balances on network failure
export const getFxcmAccount = async () => {
  try {
    const raw = await getJSON<FxcmAccount>("/api/fxcm/account");
    return adaptFxcmAccount(raw);
  } catch (err) {
    // Degrade gracefully
    return {
      account_number: "fxcm-offline",
      status: "unavailable",
      currency: "USD",
      cash: 0, equity: 0, buying_power: 0, /* ... zeros ... */
    };
  }
};
```

### Missing Fields
FXCM payloads may have `undefined` fields. Adapters must null-coalesce:

```ts
const adaptFxcmPosition = (fxcm: FxcmPosition): Position => ({
  symbol: fxcm.instrument ?? "UNKNOWN",
  current_price: fxcm.close ?? fxcm.open_rate ?? 0,
  unrealized_pl: fxcm.pl ?? 0,
  // ...
});
```

---

## Loading States & Skeletons

PortfolioHero and related surfaces render skeletons while data is `pending`:

```tsx
export const PortfolioHero: React.FC<{ assetClass: AssetClassMode }> = ({
  assetClass,
}) => {
  const account = useAccount();  // branches internally
  const positions = usePositions();

  if (account.isPending || positions.isPending) {
    return <PortfolioHeroSkeleton />;  // same skeleton for all silos
  }

  if (account.isError) {
    return <ErrorCard message={account.error.message} />;
  }

  // Render with account.data and positions.data (unified shapes)
  return <PortfolioHeroContent data={account.data!} />;
};
```

**Skeleton:** A reusable `PortfolioHeroSkeleton` with shimmer bars (asset class doesn't change layout).

---

## Refetch Strategy

| Hook | Alpaca | FXCM | Rationale |
|------|--------|------|-----------|
| `useAccount` | 15s | 3s | FXCM trading is faster; margin tightens instantly |
| `usePositions` | 15s | 3s | Keep P/L updated in real time |
| `useOrders` | 20s | 5s | FXCM orders fill faster |
| `useActivities` | 30s | N/A | FXCM doesn't have activities; backend returns empty list |

All inherit `refetchOnWindowFocus: true` (default) so a tab refocus immediately refreshes — critical for fast-moving forex.

---

## Implementation Checklist

- [ ] Add `useAssetClass()` hook (reads `asset_class_mode` from localStorage)
- [ ] Implement FXCM adapters in `api.ts` (Account, Position, Order)
- [ ] Add low-level FXCM hooks (`useFxcmAccount`, `useFxcmPositions`, `useFxcmOrders`)
- [ ] Refactor `useAccount()`, `usePositions()`, `useOrders()` to branch
- [ ] Update `useTradeInvalidation()` to handle both silos (same query keys)
- [ ] Add integration tests for adapter shape contracts
- [ ] Verify PortfolioHero/Positions/Orders render correctly for all silos
- [ ] Monitor bridge uptime in logs; surface graceful 503 message in UI if needed

---

## Code Sketch: Full Example (usePositions)

```ts
// /frontend/src/data/hooks.ts

export const useFxcmPositions = (enabled = true) =>
  useQuery({
    queryKey: qk.fxcmPositions,
    queryFn: api.getFxcmPositions,
    refetchInterval: 3000,
    retry: 0,
    enabled,
  });

export const usePositions = () => {
  const assetClass = useAssetClass();
  
  const alpaca = useQuery({
    queryKey: qk.positions,
    queryFn: api.getPositions,
    refetchInterval: 15000,
    enabled: assetClass !== "forex",
  });
  
  const fxcm = useFxcmPositions(assetClass === "forex");
  
  if (assetClass === "forex") {
    return fxcm;
  }
  
  return alpaca;
};
```

```ts
// /frontend/src/api.ts

export const getFxcmPositions = async () => {
  const raw = await getJSON<{ positions: FxcmPosition[] }>(
    "/api/fxcm/positions"
  );
  return {
    positions: raw.positions.map(adaptFxcmPosition),
  };
};

function adaptFxcmPosition(fxcm: FxcmPosition): Position {
  const qty = fxcm.amount ?? 0;
  const entry = fxcm.open_rate ?? 0;
  const current = fxcm.close ?? entry;
  
  return {
    symbol: fxcm.instrument ?? "UNKNOWN",
    asset_class: "forex",
    qty: Math.abs(qty),
    side: qty < 0 ? "short" : "long",
    avg_entry_price: entry,
    current_price: current,
    market_value: qty * current,
    cost_basis: Math.abs(qty) * entry,
    unrealized_pl: fxcm.pl ?? 0,
    unrealized_plpc: (fxcm.pl ?? 0) / (Math.abs(qty) * entry || 1),
    unrealized_intraday_pl: fxcm.gross_pl ?? 0,
    unrealized_intraday_plpc: 0,
    change_today: 0,
  };
}
```

No component changes needed — all downstream code sees `Position[]` from both Alpaca and FXCM.

