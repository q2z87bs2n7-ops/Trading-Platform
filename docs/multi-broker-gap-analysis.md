# Multi-Broker Compatibility — Gap Analysis

**Status:** Research only. No code changes. This document maps what it would
take to make the platform compatible with brokers beyond the current
**Alpaca** (US equities + crypto) and **FXCM** (CFD demo) silos, while keeping
the existing research vendors (FMP, TipRanks, CoinGecko) unchanged. Companion
reading: `docs/fxcm.md`, `docs/database.md`, `CLAUDE.md` (architecture).

The platform is single-user, paper/demo-only, on free / very-low-cost infra,
with a small budget available for services if a clear win justifies it.

---

## 1. Executive summary

The codebase already runs **two brokers**, so multi-broker is proven possible —
but the second broker (FXCM) was bolted on as a **parallel silo**, not through a
shared abstraction. Today there is **no broker interface**: Alpaca's SDK is
called directly throughout `backend/app/alpaca/`, and FXCM is a separate
`/api/fxcm/*` proxy to a sidecar Java bridge. The frontend mirrors this with
per-silo branching (`asset_class_mode`, separate order sheets, separate data
hooks, six `if (assetClass === "cfd")` branches in the TV datafeed).

The good news: the **two cleanest seams already exist in embryonic form** and
are the right foundation —
1. the `assets` table with a `source` column (`'alpaca' | 'fxcm'`) and a broad
   `asset_class` enum — a natural home for a canonical instrument catalogue, and
2. the symbol-normalization helpers (`normalize_crypto_symbol`, `coerce_silo`,
   frontend `lib/asset-class.ts`) — a natural home for canonicalization rules.

The work is therefore **less "rewrite" and more "formalize three seams"**:
a broker driver interface, a canonical-symbol ↔ per-broker-symbol mapping, and a
per-(instrument, broker) specification record (tick / lot / multiplier /
precision). The clearest prior art to borrow is QuantConnect Lean's trio
(`IBrokerage` + `ISymbolMapper` + `IBrokerageModel`) and, for crypto
specifically, **ccxt**.

**Effort estimate (rough):** a foundational abstraction pass is ~3–5 weeks of
focused work; each *additional* token-auth REST+WS broker after that (e.g.
Tradier, OANDA) is ~2–4 weeks. Without the abstraction pass, every broker added
in the current style adds **proportional** (not amortized) complexity.

---

## 2. Current coupling inventory

### 2.1 Backend — Alpaca is called directly, no interface

| Layer | File(s) | Coupling | Notes |
| --- | --- | --- | --- |
| Client setup | `alpaca/client.py:38-52` | Extreme | `TradingClient` / `StockHistoricalDataClient` / `CryptoHistoricalDataClient` instantiated directly; creds + paper flag + data feed hardcoded in `config.py:9-12`. |
| Orders | `alpaca/trading.py:7-127`, `schemas.py:18-63` | Extreme (build) / Medium (I/O) | Input `SubmitOrderRequest` is *almost* broker-agnostic; output `OrderOut` is clean. But order-type / TIF / order-class enums map 1:1 to Alpaca SDK request objects. |
| Account / positions | `alpaca/account.py:11-138`, `schemas.py:84-97` | High | `buying_power` taxonomy (regt / daytrading / non-marginable) is Alpaca-specific; `PositionOut` output shape is mostly clean. |
| P/L curve | `alpaca/pnl.py:35-188` | High | FIFO reconstruction is tied to Alpaca **FILL activity** schema. |
| Market data | `alpaca/market_data.py:18-222` | Extreme | Bars / quotes / snapshots use Alpaca request objects; snapshot bundles trade+quote+bars atomically (an Alpaca convenience). |
| Streaming | `stream.py:52-256` | Extreme | `StockDataStream` / `CryptoDataStream`; the single-connection supervisor, replay-on-reconnect, and backoff are all Alpaca idioms. |
| Symbol helpers | `alpaca/client.py:55-108` | Medium | `is_crypto`, `normalize_crypto_symbol`, `coerce_silo` — small, contained, **the right place** for canonicalization rules. |
| Asset catalogue | `db.py:120-167, 624-795` | Medium (extensible) | `source` column + broad `asset_class` enum already host two brokers. Precision stored per-broker (`price_increment` / `min_trade_increment` for Alpaca; `fxcm_underlying_unit` for FXCM) — **not unified**. |

**No broker abstraction exists.** Routes in `main.py` import `alpaca` and call
`alpaca.submit_order(...)` etc. directly. FXCM is routed by URL prefix
(`/api/fxcm/*` → `fxcm.py` HTTP proxy), not by a shared interface.

### 2.2 The FXCM precedent — what "adding a broker" looked like last time

FXCM was added as a **fully parallel stack**, which is the key lesson for
estimating a third broker:

- A **sidecar FCLite Java bridge** (`127.0.0.1:3001`) co-running with uvicorn on
  Render; FastAPI proxies `/api/fxcm/*` to it (`fxcm.py`). Returns 503 when the
  JVM is down. (Full detail: `docs/fxcm.md`.)
- **Different response shapes** at every endpoint: account is
  `{balance, equity, used_margin, usable_margin, day_pl}` vs Alpaca's
  `{equity, buying_power}`; positions are `{instrument, amount, open_rate,
  gross_pl, digits}` vs `{symbol, qty, avg_entry_price, unrealized_pl}`.
- **A different order model** — FXCM `OM` / `SE` / `LE` (market / stop-entry /
  limit-entry) with `amount` in lots (1000 for FX, 1 for indices/stock-CFDs),
  vs Alpaca's `market/limit/stop/stop_limit/trailing_stop` with `qty`/`notional`.
- **Symbol ↔ offerId translation** at the proxy boundary (FCLite uses integer
  `OfferId`; the watchlist Endpoints API returns offerIds, not symbols).
- **Per-instrument precision metadata** carried inline on `/api/fxcm/prices`
  (`digits`, `point_size`, `instrument_type`, `base_unit_size`) — exactly the
  spec data a normalized layer would centralize.

### 2.3 Frontend — real silo switch, but everything below it is branched

**Abstracted / scalable:**
- `asset_class_mode` localStorage (`"stocks" | "crypto" | "cfd"`) is an explicit
  silo switch, not symbol-shape inference — it could host more silos.
- `assets` table `source` column hosts any number of brokers.
- Clean top-level render branches in `App.tsx` (`activeClass === "cfd"`).

**Hardcoded per-silo (the real cost):**
- **Order entry:** `hooks/useOrderTicket.ts` is 100% Alpaca-model (crypto
  constraints: `market/limit/stop_limit`, TIF `gtc/ioc`, notional→day,
  ext-hours rules). `components/trade/FxcmOrderSheet.tsx` is 100% FXCM-model
  (OM/SE/LE, lot units). **No shared order abstraction.**
- **Symbol classifier:** `lib/asset-class.ts` disambiguates the overloaded `/`
  separator (Alpaca crypto `BTC/USD` vs FXCM forex `EUR/USD`) via an
  ISO-fiat/metal regex **plus** a runtime cache seeded from
  `/api/fxcm/instruments` (`registerFxcmSymbols`). A third broker with a
  different naming convention (`BASE-QUOTE`, `BASE.QUOTE`) would need a new
  classifier branch.
- **Precision:** `lib/format.ts → cfdDigits(symbol)` is a hardcoded ladder
  (JPY 3dp / FX 5dp / metals 4dp / indices 1dp / stock-CFD 2dp), used as a
  fallback when the live `digits` field is absent.
- **Charts:** `lib/tv-datafeed.ts` has ~6 explicit `assetClass === "cfd"`
  branches; `lib/tv-broker.ts` hard-routes Alpaca and short-circuits CFD.
- **Watchlist persistence, position close, order modify** all diverge per broker
  with no normalizer.

**Verdict:** the 3-silo design is a working proof-of-concept that multi-broker
is achievable, but it is **branch-per-silo**, so complexity grows linearly with
each broker rather than being amortized by a shared layer.

---

## 3. The two cross-cutting concerns the brief calls out

### 3.1 "Not every broker names the same instrument the same way"

Concrete collisions:
- Crypto: `BTC/USD` (Alpaca/ccxt) vs `BTCUSD` (Binance) vs `XBT/USD` (Kraken —
  ISO-4217 `XBT` in API, `BTC` in UI).
- Equity share classes: `BRK.B` vs `BRK-B` vs `BRK/B` vs `BRK B`.
- Forex: `EUR/USD` (display) vs `EUR_USD` (OANDA) vs `EURUSD` (FIX/MT).

**Recommended pattern — a canonical instrument layer + per-broker map.** This is
the design ccxt and Lean both use, and it extends the existing `assets` table
rather than replacing it:

```
instrument (canonical)
  id                 internal stable PK
  canonical_symbol   "BTC/USD" | "EUR/USD" | "BRK.B"
  asset_class        us_equity | crypto | forex | future | option | cfd | index | metal | ...
  base / quote       for pairs (BTC + USD, EUR + USD)
  figi / isin / mic / cfi   external identity (NULLable; equities mainly)

instrument_broker_map
  instrument_id  -> instrument.id
  broker         'alpaca' | 'tradier' | 'oanda' | 'fxcm' | 'ibkr' | 'kraken'
  broker_symbol  'BTCUSD' | 'XBT/USD' | 'EUR_USD' | conid | offerId | ...
  (+ per-broker spec overrides — see 3.2)
```

**Open identity standards — what to actually use:**

| Standard | Identifies | Free? | Use here |
| --- | --- | --- | --- |
| **OpenFIGI** (Bloomberg) | FIGI per instrument/venue | **Yes — free API** (+ free key for higher limits) | Best canonical join key for **equities/options**. Ticker → FIGI(s) with name, exchange, sec-type. |
| **ISIN** | Security (12-char) | Mostly free | Secondary equity key; doesn't disambiguate venue alone. |
| **MIC** (ISO 10383) | Exchange/venue (4-char) | Free | Qualify venue (`XNAS` vs `XNYS`) + FIGIs. |
| **CFI** (ISO 10962) | *Classification* (6-char) | Free | Tag instrument type in the spec table. |
| **CUSIP** | US/Canada security | **Licensed** | Avoid as a stored key. |
| **RIC** (Refinitiv) | Instrument+venue | Proprietary | Avoid. |

FIGI/ISIN don't cover crypto or forex in practice → handle those with
**rule-based canonicalization** (the existing `normalize_crypto_symbol`
longest-quote-first logic + an `XBT↔BTC` alias map; forex = canonical `EUR/USD`
with separator/direction rules). Crypto/forex currency codes are stable, so no
external service is required for them.

### 3.2 "Different instrument multiplier and precision settings"

Store a **contract-spec record per (instrument, broker)**, sourced from each
broker's instrument endpoint at seed/refresh time — the same pattern as the
existing Render-only `refresh-*` routines. Standard fields:

| Field | Meaning | Example |
| --- | --- | --- |
| tick size / min price increment | smallest price move | ES 0.25; EUR/USD 0.00001 |
| price display precision | decimals to render | EUR/USD = 5 |
| lot / qty increment + min size | smallest tradable unit & step | OANDA EUR/USD min 1, units precision 0 |
| contract multiplier / size | underlying per contract | ES $50/pt; MES $5/pt; /CL 1,000 bbl |
| tick value (**derived**) | tick × multiplier | ES 0.25 × $50 = $12.50 |
| pip location + pip value | FX/CFD P&L | OANDA `pipLocation = -4` ⇒ 0.0001 |
| quote / settlement currency | for cross-ccy P&L | — |

**What brokers expose:** OANDA v20 is the gold standard
(`GET /v3/accounts/{id}/instruments` → `displayPrecision`, `pipLocation`,
`tradeUnitsPrecision`, `minimumTradeSize`, margin); IBKR `ContractDetails` carry
`minTick` + `multiplier`; Alpaca gives `price_increment` / `min_order_size`
(crypto `price_increment=1e-9` uniformly — which is exactly why the
`fmtCryptoPrice` magnitude ladder exists); ccxt exposes `market.precision` +
`market.limits` with `price_to_precision()` / `amount_to_precision()` helpers.

**Generalization:** source display digits from the spec record
(OANDA `displayPrecision`, IBKR `minTick`, FXCM `digits`) instead of the
`cfdDigits` asset-class switch, keeping the ladder only as a fallback. Store tick
**value** as derived, never duplicated.

---

## 4. Candidate brokers (single-user, paper/demo, small budget)

| Broker | Asset classes | Paper/sandbox | REST | Stream | Auth | Hobby fit |
| --- | --- | --- | --- | --- | --- | --- |
| **Alpaca** (have) | US equities, options, crypto | Yes | Yes | Yes | key+secret | integrated |
| **Tradier** | US equities, options | Yes (sandbox token) | Yes | Yes (WS/HTTP) | token | **Excellent** |
| **OANDA v20** | Forex, CFDs (indices/metals/commodities) | Yes (practice) | Yes | Yes (HTTP stream) | bearer token | **Excellent** |
| **tastytrade** | Equities, options, **futures**, crypto | Yes (cert, resets daily) | Yes | Yes (WS) | session token (15-min) | Very good |
| **Interactive Brokers** | Everything (equities/options/futures/forex/bonds/CFDs) | Yes (paper) | Web API / TWS / FIX | Yes | OAuth / local gateway | Powerful, heaviest |
| **Coinbase Advanced** | Crypto | Yes (sandbox) | Yes | Yes (WS) | CDP key | Good (crypto) |
| **Kraken** | Crypto (spot+futures) | Futures demo only | Yes | Yes (WS) | nonce-signed key | Good (crypto) |
| **Saxo OpenAPI** | Equities/options/futures/forex/CFDs/bonds | Yes (simulation) | Yes | Yes | OAuth (20-min token + refresh) | Capable, OAuth-heavy |

**Recommended priority:**
1. **Tradier** — lowest-friction non-Alpaca add; sandbox is a base-URL + token
   swap. Natural way to add **options** without IBKR complexity.
2. **OANDA v20** — clean, FIX-free **forex/CFD** path; a strong complement (or
   replacement) for the FXCM bridge, and the best free instrument-metadata source
   for the spec table (§3.2).
3. **tastytrade** — adds **futures** under one API (watch the 15-min token TTL).
4. **IBKR / Saxo** — defer until you specifically want futures/bonds breadth and
   can absorb OAuth/gateway operational weight. (TWS API needs a local gateway
   process — a poor fit for serverless Vercel; tolerable on the Render relay.)
5. **Crypto exchanges** — prefer **ccxt** over bespoke per-exchange code.

---

## 5. Prior art worth borrowing

- **QuantConnect Lean** — the cleanest abstraction to mirror, splitting the
  problem into three explicit seams the codebase already has informally:
  - `IBrokerage` — execution driver (connect, place/update/cancel, fills,
    account/cash events). Mirrors the per-silo data paths.
  - `ISymbolMapper` — broker ticker ↔ canonical symbol. Mirrors
    `normalize_crypto_symbol` / `coerce_silo` / `lib/asset-class.ts`.
  - `IBrokerageModel` — per-broker **capabilities** (supported order types,
    default markets, fees, leverage). The right home for the constraints
    currently hardcoded in `useOrderTicket` (crypto: no plain stop/trailing, TIF
    gtc/ioc) and `cfdDigits`.
- **ccxt** — for the crypto silo specifically, it *is* the canonical-symbol +
  contract-spec abstraction (unified `BASE/QUOTE` symbol alongside exchange `id`;
  `market.precision`/`limits`; precision rounding helpers; sandbox modes). Could
  replace bespoke per-exchange crypto code outright.
- **vn.py / freqtrade** — confirm the same `Gateway`/exchange-interface pattern;
  useful as confirmation, not as dependencies for a TS/Python web app.
- **FIX protocol** — overkill for a hobby project (session/cert setup, FIX engine
  dependency, usually deposit/volume-gated). Stay on REST + WebSocket/SSE.

---

## 6. Gap summary & proposed path

### What's missing (the gaps)

| Gap | Today | Needed |
| --- | --- | --- |
| Broker interface | Alpaca SDK called directly; FXCM is a URL-prefix proxy | A `BrokerDriver` protocol (orders, positions, account, market data, stream) with per-broker implementations |
| Canonical symbol layer | Overloaded `/` separator disambiguated by regex + runtime cache | Canonical `instrument` record + `instrument_broker_map`; OpenFIGI/ISIN/MIC for equities, rules for crypto/forex |
| Instrument spec / precision | Per-broker fields (`price_increment` vs `fxcm_underlying_unit`); hardcoded `cfdDigits` ladder | Unified per-(instrument, broker) spec record (tick / lot / multiplier / digits / pip) sourced from each broker's instrument endpoint |
| Order model | `useOrderTicket` (Alpaca) and `FxcmOrderSheet` (FXCM) fully separate | Broker-agnostic order state + per-broker `mapFormToRequest` / `mapResponseToForm` + capability model |
| Streaming | Alpaca single-connection supervisor; FXCM push backlog | Per-broker stream adapter behind one fan-out SSE interface |
| Account/P/L | Alpaca `buying_power` taxonomy; FIFO from Alpaca FILLs | Normalized account summary; per-broker P/L sourcing |
| Config/auth | Single Alpaca key set hardcoded | Multi-broker credential config + per-broker auth (token / OAuth / gateway) |

### Suggested sequencing

1. **Foundation (no new broker yet):** introduce the canonical `instrument` +
   `instrument_broker_map` tables (extend, don't replace, `assets`); add the
   per-(instrument, broker) spec record and source `cfdDigits` from it as a
   fallback; define the `BrokerDriver` protocol and **refactor Alpaca + FXCM
   behind it** (proves the interface against the two brokers already in hand).
2. **First new broker — Tradier (options)** or **OANDA (forex/CFD)**: both are
   token-auth, sandbox-native, REST+stream, minimal ops. OANDA doubles as the
   spec-table metadata source.
3. **Generalize the frontend:** broker-agnostic order ticket + capability model;
   replace TV-datafeed `assetClass === "cfd"` branches with a `broker` lookup on
   the instrument.
4. **Optional:** adopt **ccxt** for the crypto silo; defer IBKR/Saxo until breadth
   is genuinely wanted.

### Cost / budget notes

- OpenFIGI: **free** (free key raises limits). ISIN/MIC/CFI: free/low-cost.
  CUSIP/RIC: licensed — skip.
- Tradier sandbox, OANDA practice, tastytrade cert, IBKR paper, Saxo simulation:
  **all free**.
- No new always-on infra strictly required for token-auth REST brokers (they fit
  the existing Vercel + Render split). **IBKR TWS API and any FIX path would need
  a persistent gateway** — only the Render relay can host that, matching the
  existing FXCM-bridge constraint.

---

## 7. Bottom line

Multi-broker is **architecturally feasible and partially precedented** — the
`source`/`asset_class` catalogue and the symbol-normalization helpers are the
right foundations. The blocker is the **absence of a shared broker interface**:
today each broker is a parallel silo, so cost scales linearly. The highest-value
move is a one-time **foundation pass** — canonical instrument layer, unified
spec/precision record, and a `BrokerDriver` protocol validated by refactoring
Alpaca + FXCM behind it — after which adding token-auth REST brokers like
Tradier and OANDA becomes incremental. Borrow Lean's
`IBrokerage`/`ISymbolMapper`/`IBrokerageModel` split as the model, and use ccxt
for crypto. Skip FIX, CUSIP, and RIC.
