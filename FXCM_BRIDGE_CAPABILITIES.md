# FXCM Bridge Capabilities for Portfolio

A detailed endpoint reference and field mapping for FXCM forex silo integration with the Trading Platform's Portfolio page.

## Endpoint Reference Table

| Route | Method | Response | Alpaca Equivalent | Data Freshness |
|-------|--------|----------|-------------------|-----------------|
| `/api/fxcm/account` | GET | Account balance, equity, margins | `/api/account` | Real-time (on-demand) |
| `/api/fxcm/positions` | GET | Open trades with P/L | `/api/positions` | Snapshot (per-trade state) |
| `/api/fxcm/orders` | GET | Pending/entry orders | `/api/orders` | Snapshot (per-order state) |
| `/api/fxcm/closed_trades` | GET | Closed trade history | `/api/activities` (fills only) | Accumulated history |
| `/api/fxcm/prices` | GET | Live bid/ask for all instruments | `/api/quotes` | Real-time (cached 3s polling) |
| `/api/fxcm/instruments` | GET | All tradable symbols | `/api/assets` | Static (per-session) |

---

## Field-by-Field Mapping

### `/api/fxcm/account` → Portfolio Hero

**Request:** `GET /api/fxcm/account`

**Response shape:**
```json
{
  "account_id": "D161665432",
  "account_name": "Forex Trading Account",
  "balance": 50000.00,
  "equity": 51234.56,
  "usedmargin": 2000.00,
  "usablemargin": 49234.56,
  "day_pl": 234.56,
  "gross_pl": 1234.56
}
```

**Mapping to Portfolio:**
| FXCM field | Alpaca field | Portfolio use |
|-----------|--------------|---------------|
| `equity` | `equity` | Total equity (hero headline) |
| `usablemargin` | `buying_power` | Available margin for new trades |
| `usedmargin` | (computed: equity - cash) | Current position margin |
| `day_pl` | `unrealized_intraday_pl` (all positions) | Day P/L chip |
| `balance` | `cash` | Account cash / settlement balance |
| `gross_pl` | (sum of closed + open P/L) | Total P/L since inception |

**CRITICAL GAPS:**
- ❌ No **individual position P/L** — must compute from `open_rate` vs. live price
- ❌ No **prev_close** or **daily_buying_power** (Alpaca has both)
- ❌ **Margin precision:** Forex uses 1:50 leverage (demo only); Alpaca's margin rules don't apply
- ❌ **`gross_pl` is cumulative lifetime**, not daily — day curve cannot be built from account alone

**Feasibility:** ✅ Sufficient for hero equity/margin display. Account hero can render: `equity · usablemargin · day_pl`. Will need `/positions` + live `/prices` for per-position P/L.

---

### `/api/fxcm/positions` → Portfolio Positions Block

**Request:** `GET /api/fxcm/positions`

**Response shape:**
```json
[
  {
    "trade_id": "7654321",
    "account_id": "D161665432",
    "offer_id": "1",
    "instrument": "EUR/USD",
    "amount": 100000,
    "buy_sell": "B",
    "open": 1.08341,
    "close": 1.08450,
    "pl": 109.00,
    "gross_pl": 109.00,
    "used_margin": 2000.00,
    "stop_rate": 1.08200,
    "limit_rate": 1.08500
  }
]
```

**Mapping to Portfolio:**
| FXCM field | Alpaca field | Portfolio use |
|-----------|--------------|---------------|
| `trade_id` | `id` (position key) | Row identifier |
| `instrument` | `symbol` | Instrument ticker |
| `amount` | `qty` | Notional amount in units |
| `buy_sell` | `side` | "long" (B) / "short" (S) |
| `open` | `avg_entry_price` | Entry price |
| `close` | `current_price` (from live quote) | Market price |
| `pl` | `unrealized_pl` | Unrealized P/L in currency |
| `gross_pl` | (same as `pl` for open) | Total P/L for this position |
| `used_margin` | (computed: qty × entry × leverage / account_equity) | Margin requirement |
| `stop_rate` | `stop_price` (not in Alpaca positions) | Stop-loss level |
| `limit_rate` | `limit_price` (not in Alpaca positions) | Take-profit level |

**Data freshness:**
- `open_rate` / `buy_sell` / `amount`: Static (trade-open snapshot)
- `pl` / `gross_pl`: Recomputed server-side on each request (requires live price lookup)
- `close_rate`: Requires join with `/api/fxcm/prices` to get live ask/bid

**CRITICAL GAPS:**
- ❌ **No `market_value`** — must compute: `amount × current_price`
- ❌ **No `cost_basis`** — must compute: `amount × open_rate`
- ❌ **No `unrealized_intraday_pl`** — FXCM's `pl` is always total, not daily
- ⚠️ **`close_rate` field name is misleading** — it's a static field on the position, not the exit price of a closed trade (FxcmSession.java line 220)
- ❌ **No timestamp** — don't know when trade was opened

**Feasibility:** ✅ Can build Positions table. Must join `/positions` + live `/prices` and compute missing fields client-side.

---

### `/api/fxcm/orders` → Portfolio Orders Block

**Request:** `GET /api/fxcm/orders`

**Response shape:**
```json
[
  {
    "order_id": "88991",
    "account_id": "D161665432",
    "offer_id": "1",
    "instrument": "EUR/USD",
    "amount": 50000,
    "rate": 1.0850,
    "type": "SE",
    "status": "Active",
    "buy_sell": "B"
  }
]
```

**Mapping to Portfolio:**
| FXCM field | Alpaca field | Portfolio use |
|-----------|--------------|---------------|
| `order_id` | `id` | Order identifier |
| `instrument` | `symbol` | Instrument |
| `amount` | `qty` | Order size in units |
| `rate` | `limit_price` (for LE) or `stop_price` (for SE) | Entry level |
| `type` | `type` (market/limit/stop) | Order type |
| `status` | `status` | "Active" = pending, "Canceled" = cancelled |
| `buy_sell` | `side` | "B" = buy, "S" = sell |

**CRITICAL GAPS:**
- ❌ **No `submitted_at`** — no timestamp for when order was placed
- ❌ **No `time_in_force`** — Forex orders are implied "GTC" (good-till-cancel) by type
- ❌ **Type encoding is proprietary:** `"OM"` = market, `"SE"` = stop entry, `"LE"` = limit entry (not Alpaca's terminology)
- ❌ **No distinction between "pending orders" vs "filled/partial fills"** — FXCM's orders manager only shows unfilled entry orders, filled trades move to `/positions`
- ⚠️ **Status is vague** — "Active" means pending; no separate "Partially Filled" state

**Feasibility:** ⚠️ Partial. Can display pending orders, but order history (filled orders over time) requires `/closed_trades` + application-level tracking. No "Recent Orders" section like Alpaca.

---

### `/api/fxcm/closed_trades` → Portfolio Activities / P/L History

**Request:** `GET /api/fxcm/closed_trades`

**Response shape:**
```json
[
  {
    "trade_id": "7654320",
    "instrument": "EUR/USD",
    "amount": 100000,
    "buy_sell": "B",
    "open_rate": 1.08341,
    "close_rate": 1.08450,
    "pl": 109.00,
    "gross_pl": 109.00
  }
]
```

**Mapping to Portfolio:**
| FXCM field | Alpaca field | Portfolio use |
|-----------|--------------|---------------|
| `trade_id` | `id` (activity row) | Closed trade identifier |
| `instrument` | `symbol` | Instrument |
| `amount` | `qty` | Trade notional |
| `open_rate` | `fill_price` (entry) | Entry price |
| `close_rate` | `fill_price` (exit) | Exit price |
| `pl` | `commission` (NO — this is P/L, not fee) | Realized P/L |
| `buy_sell` | `side` | Entry side |

**CRITICAL GAPS:**
- ❌ **No timestamps** — no `opened_at` / `closed_at`. Cannot build P/L curve by date.
- ❌ **No fees/commissions** — `pl` is net (fees already deducted) but we don't see the breakdown
- ❌ **No execution price granularity** — only entry + exit, no partial fills
- ❌ **No duration / holding period** — required for tax lot tracking
- ❌ **`gross_pl` equals `pl` for closed trades** — no separate commission field

**Feasibility:** ❌ **Cannot build daily P/L curve** without timestamps. Cannot distinguish fees from P/L. Closed trades are useless for a Portfolio Activities table (Alpaca has timestamped fills + dividend/fee records). Could accumulate `pl` to show lifetime realized P/L in a footer, but that's it.

---

## Data Freshness & Limitations

| Endpoint | Freshness | Limitations |
|----------|-----------|-------------|
| `/account` | On-demand snapshot | Equity/margin accurate; no intraday history |
| `/positions` | Per-request snapshot | P/L recomputed with live price; no open timestamp |
| `/orders` | Per-request snapshot | No fill history; pending orders only |
| `/closed_trades` | Accumulated history | **No timestamps** — prevents curve building |
| `/prices` | 3-second poll (frontend) | Bid/ask only; no volume or quote time |

---

## Feasibility Assessment: Can We Build Portfolio with Current Bridge?

### ✅ What's Possible

**Hero Section:**
- Equity headline ✅
- Margin available (usable_margin) ✅
- Day P/L chip ✅
- Cash balance ✅

**Positions Table:**
- Symbol, qty, side, entry price ✅
- Current price (from `/prices` join) ✅
- Unrealized P/L (computed: (live_price - entry) × qty) ✅
- Market value (computed: price × qty) ✅
- Stop/limit levels (from position object) ✅

**Orders Table:**
- Pending orders list ✅
- Order type (SE/LE/OM) with translation ✅
- Qty, rate, status ✅

### ❌ What's Missing

**Daily P/L Curve:**
- Requires timestamps on closed_trades → impossible without bridge changes
- Current account `day_pl` is total, not cumulative by close time

**Order History / Activities:**
- FXCM has no fill timestamps
- No way to build "Recent Fills" table or "realized P/L by date" report
- Alpaca `/api/activities` has fees, dividends, etc. — FXCM only has trades

**Fine-Grained Risk:**
- No per-position intraday P/L (only total, not delta vs. today's open)
- No trading volume or quote freshness timestamps
- Margin model is fixed (1:50 leverage) vs. Alpaca's dynamic rules

---

## Bridge Work Required

To reach parity with Alpaca Portfolio:

| Feature | Effort | Notes |
|---------|--------|-------|
| Add timestamps to `/closed_trades` | ⭐ Low | Return `open_time` / `close_time` from FCLite ClosedPosition object (likely available) |
| Add fees breakdown to `/closed_trades` | ⭐ Low | Separate `commission` and `swap` fields from `pl` |
| Add `open_time` to `/positions` | ⭐ Low | Return trade open timestamp; required for "age" column |
| Add `current_price` to `/positions` | ⭐ Medium | Join `/positions` with `/prices` server-side to avoid client latency |
| Stream bar/quote updates instead of polling | ⭐⭐ Medium | Replace 3s polling with FCLite push subscriptions |
| Daily P/L isolation | ⭐⭐ High | Compute intraday vs. total from open_time + prev_close |

---

## Summary

**Current state:** FXCM bridge provides **core holdings + account balance**. Sufficient for a basic Portfolio hero and Positions table.

**Major gaps:** **No timestamps** on closed trades blocks P/L curve and Activities history. Without bridge changes, the Forex Portfolio will be **read-only hero + static positions**, lacking the daily curve and order history that define the Alpaca silos.

**Recommendation:** Start with **hero + positions + orders cards** (all implementable now). Backlog P/L curve and Activities until closed_trades timestamps are exposed by the bridge.
