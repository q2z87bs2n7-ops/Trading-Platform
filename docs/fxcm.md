# FXCM ForexConnect Integration

Comprehensive reference for the FXCM CFD silo (forex, indices, metals,
commodities, stock CFDs). Read before touching the bridge, the backend proxy,
or the frontend CFD Discover page. This doc is intentionally detailed so
another agent can pick up cold.

## Overview

The platform supports three trading silos:

| Silo | Data source | Runtime |
|------|-------------|---------|
| Stocks | Alpaca REST + WebSocket | Vercel + Render |
| Crypto | Alpaca REST + WebSocket | Vercel + Render |
| **CFDs** | **FXCM FCLite Java SDK** | **Render (co-runs with FastAPI)** |

The CFD silo is a **POC** running against a hardcoded FXCM demo account.
The FCLite Java bridge ships **in the same Render container** as the FastAPI
relay (multi-stage build in `backend/Dockerfile`, boot orchestrated by
`backend/entrypoint.sh`). The frontend still handles the bridge being offline
gracefully (shows an offline notice instead of crashing) — if the JVM dies,
`/api/fxcm/*` returns 503 and the page recovers when Render restarts the
container.

## Architecture

Two integration surfaces, both terminating at the same FXCM demo account:

```
Browser
  ↓  /api/fxcm/*  (FastAPI proxy)
backend/app/fxcm.py
  │
  ├─→  http://127.0.0.1:3001  (market data / trade execution)
  │    fxcm-bridge/java/target/fxcm-bridge-1.0.0.jar
  │    FCLite SDK (Apache HC5 + Tyrus WebSocket)
  │    → pdemo2.fxcorporate.com, mdt*prices.fxcorporate.com
  │
  └─→  https://endpoints-demo.fxcm.com         (auth, JWT mint)
       https://endpoints-demo.fxcorporate.com  (watchlist API)
       backend/app/fxcm_auth.py mints / caches the Bearer
```

The bridge owns the streaming session (prices, bars, positions, orders);
the Endpoints suite owns the user-side persisted **watchlist** (multiple
watchlists per user, FXCM-side storage). See "Watchlist API
(Endpoints suite)" below for the full spec.

### Why FCLite Java?

The FXCM REST API (`api-demo.fxcm.com`) does not resolve on the corporate
network. FCLite is FXCM's cross-platform Java SDK that uses the ForexConnect
protocol over WebSocket — it resolves via `api-demo.fxcm.com` (redirected via
JVM hosts file) to `pdemo2.fxcorporate.com`, which does resolve.

FCLite runs on any JVM (Java 8+), is platform-neutral, and is cloud-deployable
to Linux (Render), unlike the old Python 3.7 + C++ ForexConnect wheel
(Windows CP37 only).

## File Locations

| Path | Description |
|------|-------------|
| `fxcm-bridge/java/` | Maven project for the FCLite bridge |
| `fxcm-bridge/java/src/main/java/com/tradingplatform/bridge/BridgeServer.java` | HTTP server (port 3001), all route handlers |
| `fxcm-bridge/java/src/main/java/com/tradingplatform/bridge/FxcmSession.java` | FCLite session wrapper (login, managers, all data methods) |
| `fxcm-bridge/java/src/main/java/org/apache/hc/client5/http/ssl/DefaultHostnameVerifier.java` | No-op hostname verifier override (see SSL section below) |
| `fxcm-bridge/java/pom.xml` | Maven build config — FCLite dep + shade plugin |
| `fxcm-bridge/java/target/fxcm-bridge-1.0.0.jar` | Built fat JAR (all deps bundled) |
| `backend/app/fxcm.py` | FastAPI proxy router at `/api/fxcm/*` (bridge calls + watchlist Endpoints-suite proxy) |
| `backend/app/fxcm_auth.py` | JWT mint + cache for the Endpoints suite (`/iam/authenticate`, 60s lifetime, re-mint every ~50s) |
| `frontend/src/components/CfdDiscoverPage.tsx` | CFD Discover page |
| `frontend/src/components/CfdPriceChart.tsx` | Inline lightweight-charts panel on CFD Discover (FXCM history + live-tip) |
| `frontend/src/api.ts` | FXCM API functions (`getFxcm*` block). Bridge-dependent calls use `STREAM_BASE` (Render). DB-only calls (`getFxcmDisplayNames`, `getFxcmUnderlyingUnits`, `searchFxcmInstruments`) use `API_BASE` (Vercel). |
| `frontend/src/types.ts` | FXCM types (`FxcmAccount`, `FxcmPrice`, `FxcmBar`, `FxcmPosition`, `FxcmInstrument`) |
| `frontend/src/lib/asset-class.ts` | FXCM-aware `isCfdSymbol` / `isCryptoSymbol`; cache populated at boot by App.tsx |
| `frontend/src/lib/tv-datafeed.ts` | TV datafeed CFD branches (search/resolve/bars/quotes) |
| `frontend/src/lib/tv-broker.ts` | TV broker — Alpaca routes short-circuited in CFD mode |
| `frontend/src/components/trade/FxcmOrderSheet.tsx` | CFD order ticket (Alpaca's OrderSheet is not reusable) |
| `backend/Dockerfile`, `backend/entrypoint.sh`, `backend/jvm-hosts.txt` | Render build / boot / DNS |

## Building the Bridge (local)

The prod build runs inside `backend/Dockerfile` stage 1. For local dev:

```bash
cd fxcm-bridge/java
# FXCM's public-maven repo uses a non-Maven layout — pre-seed local repo:
curl -fsSL -o /tmp/fcl.jar "https://fxcorporate.com/public-maven/com.fxcm.api/forex-connect-lite/1.3.3/forex-connect-lite-1.3.3.jar"
curl -fsSL -o /tmp/fcl.pom "https://fxcorporate.com/public-maven/com.fxcm.api/forex-connect-lite/1.3.3/forex-connect-lite-1.3.3.pom"
mvn install:install-file -Dfile=/tmp/fcl.jar -DpomFile=/tmp/fcl.pom
mvn package -DskipTests
```

JDK 8+ (any current Temurin is fine; CI uses 17/21). Produces
`target/fxcm-bridge-1.0.0.jar` — a fat JAR with FCLite + Apache HC5
bundled. See `fxcm-bridge/java/README.md` for the Windows-flavoured
command flavour the original dev machine uses.

## Starting the Bridge (local)

```bash
java -Djdk.net.hosts.file=/path/to/jvm-hosts.txt \
     -jar fxcm-bridge/java/target/fxcm-bridge-1.0.0.jar
```

Where `jvm-hosts.txt` matches `backend/jvm-hosts.txt`. The bridge logs
`"FXCM connected — account D161665432"` when ready and listens on
`http://127.0.0.1:3001`.

**Verify:** `curl http://127.0.0.1:3001/health` → `{"status":"ok","account":"D161665432"}`

## DNS Workaround (jvm-hosts.txt)

FCLite 1.3.3 hardcodes `api-demo.fxcm.com` for demo connections. This
hostname no longer resolves in public DNS. The fix is the JVM hosts file
(`-Djdk.net.hosts.file`) which overrides DNS for the entire JVM process.

**Note:** `-Djdk.net.hosts.file` replaces the JVM's DNS entirely — it is not
additive. Hosts not in this file will not resolve, so all FXCM servers must be
listed.

`backend/jvm-hosts.txt` content (committed to the repo and baked into the Render image):
```
204.8.240.52 api-demo.fxcm.com
204.8.241.37 pdemo2.fxcorporate.com
204.8.241.31 mdt4prices.fxcorporate.com
204.8.241.21 mdt1prices.fxcorporate.com
204.8.240.16 mdt2prices.fxcorporate.com
204.8.240.24 mdt3prices.fxcorporate.com
204.8.240.130 mdt9prices.fxcorporate.com
204.8.240.130 mdt91prices.fxcorporate.com
204.8.240.130 mdt92prices.fxcorporate.com
204.8.240.130 mdt100prices.fxcorporate.com
204.8.240.130 mdt102prices.fxcorporate.com
```

IPs sourced from FXCM's platform Hosts XML (the same source their own PWA uses
for server discovery). All http-based price servers share `client-connection-factory=204.8.240.130`.
`mdt103` uses the dxfeed protocol and does not need a hosts entry.

**Java 9+ required for `-Djdk.net.hosts.file`.** The flag silently does nothing
on Java 8 — the bridge will fail to resolve `api-demo.fxcm.com` and hang on
login. Use Java 9 or newer (the Render image uses OpenJDK 21; local dev has
been tested with JDK 25 portable zip).

## SSL / Hostname Verification

FCLite uses Apache HttpClient 5 (HC5) internally. After the DNS redirect,
`api-demo.fxcm.com` resolves to `204.8.240.52` (a `*.fxcorporate.com` server)
but the TLS certificate is for `*.fxcorporate.com`, not `api-demo.fxcm.com`.
HC5's default `DefaultHostnameVerifier` rejects this mismatch.

**Fix:** `fxcm-bridge/java/src/main/java/org/apache/hc/client5/http/ssl/DefaultHostnameVerifier.java`
is a no-op `HostnameVerifier` placed in the project source tree. The Maven shade
plugin gives project source classes priority over transitive dependency classes,
so this override wins over HC5's real `DefaultHostnameVerifier` in the fat JAR.

The override accepts a `PublicSuffixMatcher` constructor argument (the exact
signature HC5 uses when constructing it) to avoid `NoSuchMethodError`. The
`httpclient5:5.1` dependency is declared as `compile` scope in `pom.xml` so
the `PublicSuffixMatcher` type is resolvable at compile time and HC5 classes are
included in the fat JAR.

## Credentials

Hardcoded in `BridgeServer.java` as constants — intentional for the POC:

```java
static final String FXCM_USER = env("FXCM_USER", "D161665432");
static final String FXCM_PASS = env("FXCM_PASS", "Qak5i");
static final String FXCM_URL  = env("FXCM_URL",  "https://api-demo.fxcm.com");
static final String FXCM_CONN = env("FXCM_CONN", "Demo");
```

All four can be overridden via environment variables. Do not commit real/live
FXCM credentials to git.

## FCLite SDK Patterns

FCLite JAR: `com.fxcm.api:forex-connect-lite:1.3.3`. Key patterns learned from
decompiling the JAR:

### Connecting

```java
FXConnectLiteSession session = FXConnectLiteSessionFactory.create("app-name");

// Subscribe to connection status BEFORE calling login
CountDownLatch latch = new CountDownLatch(1);
session.subscribeConnectionStatusChange(status -> {
    if (status.isConnected()) { connected = true; latch.countDown(); }
});

// 5-param login — username/password only, NO OAuth
session.login(user, pass, url, conn, new ILoginCallback() {
    public void onLoginError(LoginError err) { /* handle */ }
    public void onTradingTerminalRequest(ITradingTerminalSelector sel, ITradingTerminal[] terms) {
        if (terms != null && terms.length > 0) sel.selectTerminal(terms[0]);
    }
    public void onPinCodeRequest(IPinCodeSetter setter) {}
});

latch.await(30, TimeUnit.SECONDS);
```

### Loading data managers

All managers except `IAccountsManager` implement `IDataManager` and use the
`subscribeStateChange` + `refresh()` + `CountDownLatch` pattern:

```java
<T extends IDataManager> T loadDataManager(T mgr) throws Exception {
    CountDownLatch latch = new CountDownLatch(1);
    mgr.subscribeStateChange(state -> {
        if (state.isReady()) latch.countDown();
    });
    mgr.refresh();
    latch.await(15, TimeUnit.SECONDS);
    return mgr;
}

IOffersManager offersMgr = loadDataManager(session.getOffersManager());
IOpenPositionsManager positionsMgr = loadDataManager(session.getOpenPositionsManager());
IOrdersManager ordersMgr = loadDataManager(session.getOrdersManager());
IClosedPositionsManager closedMgr = loadDataManager(session.getClosedPositionsManager());
IInstrumentsManager instrumentsMgr = loadDataManager(session.getInstrumentsManager());
```

`IAccountsManager` is loaded separately (no `subscribeStateChange`):
```java
final AccountInfo[] accounts = new AccountInfo[1];
CountDownLatch latch = new CountDownLatch(1);
session.getAccountsManager().getAccountsSnapshot(accs -> {
    if (accs != null && accs.length > 0) accounts[0] = accs[0];
    latch.countDown();
});
latch.await(15, TimeUnit.SECONDS);
```

### Symbol lookup

`OfferInfo` has no `getSymbol()` — use `instrumentsMgr`:

```java
String symbol = instrumentsMgr.getInstrumentByOfferId(offer.getOfferId()).getSymbol();
```

### Price history

`IPriceHistoryResponse` uses indexed access, not iteration:

```java
IPriceHistoryResponse response = session.getHistoryManager().getHistory(
    Timeframe.create(TimeframeUnit.Hour, 1),  // H1
    instrument, dtFrom, dtTo
);
for (int i = 0; i < response.getCount(); i++) {
    double open   = response.getBidOpen(i);
    double high   = response.getBidHigh(i);
    double low    = response.getBidLow(i);
    double close  = response.getBidClose(i);
    double askOpen = response.getAskOpen(i);
    int    volume = response.getVolume(i);
    Date   date   = response.getDate(i);
}
```

Timeframe constants (int values from `TimeframeUnit`):
`TimeframeUnit.Minute`, `TimeframeUnit.Hour`, `TimeframeUnit.Day`,
`TimeframeUnit.Week`, `TimeframeUnit.Month`.

FXCM timeframe strings: `t1 m1 m5 m15 m30 H1 H4 D1 W1 M1` (used in API
query params; mapped to `Timeframe.create()` calls in `FxcmSession.java`).

### Placing an order

`createOpenMarketOrder()` and `createEntryOrder()` return void. Capture the
new order ID via `IOrderChangeListener.onAdd()`:

```java
final String[] orderId = {null};
CountDownLatch latch = new CountDownLatch(1);
IOrderChangeListener listener = new IOrderChangeListener() {
    public void onAdd(OrderInfo order) { orderId[0] = order.getOrderId(); latch.countDown(); }
    public void onChange(OrderInfo o) {}
    public void onDelete(OrderInfo o) {}
};
ordersMgr.subscribeOrderChange(listener);
try {
    // market order
    ordersMgr.createOpenMarketOrderRequest(instrument, accountId, buySell, amount)
             .send();
    latch.await(10, TimeUnit.SECONDS);
} finally {
    ordersMgr.unsubscribeOrderChange(listener);
}
return orderId[0];
```

### Cancelling an order

```java
ordersMgr.removeOrder(orderId);  // String, no request builder
```

### Closing a position

```java
CloseMarketOrderRequestBuilder builder =
    positionsMgr.createCloseMarketOrderRequest(tradeId, accountId, amount);
builder.send();
```

## Bridge Routes

All routes are wrapped by the FastAPI proxy in `backend/app/fxcm.py` and
exposed at `/api/fxcm/*`.

| Bridge route | FastAPI route | Description |
|---|---|---|
| `GET /health` | `GET /api/fxcm/health` | Bridge + connection status |
| `GET /account` | `GET /api/fxcm/account` | Account balance/equity/margin |
| `GET /prices` | `GET /api/fxcm/prices` | Subscribed offers (live bid/ask/digits/point_size/instrument_type/base_unit_size); only instruments in the active subscription set are returned |
| `POST /subscribe` | (internal) | Push offer IDs to subscribe (set status T). Body: `{"offer_ids": ["1", "121", ...]}`. Idempotent. Called by `fxcm.py` when watchlist adds instruments. |
| `POST /unsubscribe` | (internal) | Push offer IDs to unsubscribe (set status D). Body: `{"offer_ids": [...]}`. Bridge guards against unsubscribing offer IDs still held in open positions or orders. Called by `fxcm.py` when watchlist removes instruments. |
| `GET /positions` | `GET /api/fxcm/positions` | Open trades |
| `GET /orders` | `GET /api/fxcm/orders` | Pending orders |
| `GET /summary` | `GET /api/fxcm/summary` | — (proxied but not yet implemented in bridge) |
| `GET /closed_trades` | `GET /api/fxcm/closed_trades` | Closed trade history |
| `GET /instruments` | `GET /api/fxcm/instruments` | All FXCM instruments — see note below |
| `GET /instruments/{name}` | `GET /api/fxcm/instruments/{name:path}` | Single instrument (e.g. `EUR/USD`) |
| `GET /history` | `GET /api/fxcm/history` | OHLCV bars; params: `instrument`, `timeframe`, `from`, `to` |
| `POST /order` | `POST /api/fxcm/order` | Place order |
| `DELETE /order/{id}` | `DELETE /api/fxcm/order/{id}` | Cancel pending order |
| `PATCH /order/{id}` | `PATCH /api/fxcm/order/{id}` | Modify pending entry order — body `{rate?, stop?, limit?}`; `0` = leave unchanged (FCLite `ChangeOrderRequest`, wired reflectively) |
| `POST /close` | `POST /api/fxcm/close` | Close open trade — body `{trade_id, amount}`; `amount: 0` = full close |
| `GET /debug` | `GET /api/fxcm/debug` | Raw snapshot counts (dev only) |

### DB-only endpoints (no bridge required)

These three routes live on the same `/api/fxcm/*` router but query the
`fxcm_instruments` Postgres table directly — they never call the bridge
and return `{}` / `[]` gracefully when the DB is unreachable. Critically,
they are fetched via **`API_BASE` (Vercel)** by the frontend, not via
`STREAM_BASE` (Render), because Render's `DATABASE_URL` is not guaranteed
to be set. Vercel always has `DATABASE_URL`.

| FastAPI route | Description |
|---|---|
| `GET /api/fxcm/display-names` | `{name: display_name}` map for instruments where `display_name` differs from the raw name (e.g. `"XAU/USD" → "Gold"`). Used by `useFxcmDisplayNames()` hook (`staleTime: Infinity`). |
| `GET /api/fxcm/underlying-units` | `{name: underlying_unit}` map (e.g. `"XAU/USD" → "oz"`). Used by `useFxcmUnderlyingUnit()` hook. Falls back to `"units"` when a key is absent. |
| `GET /api/fxcm/search-instruments?q=<term>` | Case-insensitive ILIKE search across `name`, `display_name`, and `alternatives[]`. Returns `[{name, display_name, description, type}]`, ranked: prefix matches first. Used by `AssetSearch` (`source="fxcm"`) — replaces the old full-list bridge fetch + client-side filter. |

The `fxcm_instruments` table is seeded once via `POST /api/_dev/seed-fxcm-instruments`
(Render-only, requires bridge to get the account's instrument list). Schema in
`backend/sql/004_fxcm_instruments.sql`.

### Selective subscription

The bridge does **not** call `loadDataManager(offersMgr)` at boot — that
call internally calls `IOffersManager.refresh()` which bulk-subscribes all
~501 instruments in the user's FXCM account, causing a 10+ second flood of
offer-snapshot noise at startup.

Instead, subscriptions are demand-driven and T/D status is kept accurate:

- **Boot** — `FxcmSession.subscribeBootInstruments()` reads open positions and
  open orders, subscribes their offer IDs via `offersMgr.getLatestOffersSnapshot`
  **and** calls `instrumentsMgr.subscribeInstruments()` to set FCLite status `T`.
- **Watchlist add** — `GET /api/fxcm/watchlist` diffs `current_ids` against
  `_last_subscribed_offer_ids`; new IDs fire a background `POST /subscribe`
  (asyncio `create_task`). `_last_subscribed_offer_ids` is a **snapshot** of the
  current watchlist (not an accumulating union) so removals are also detected.
- **Watchlist remove** — removed IDs fire a background `POST /unsubscribe`.
  The bridge's `unsubscribeOfferIds()` skips any offer ID still present in an
  open position or order (those must stay `T` unconditionally), then calls
  `instrumentsMgr.unsubscribeInstruments()` to restore status `D`.
- **Subscribe call** — `FxcmSession.subscribeOfferIds()` filters already-subscribed
  IDs (tracked in `subscribedOfferIds` ConcurrentHashMap), calls
  `getLatestOffersSnapshot`, then calls `subscribeInstruments()`. Idempotent.

**T/D rule:** `T` = instrument is in view (being price-polled); `D` = not in view.
Positions and orders are always `T` regardless of watchlist state. The bridge
enforces this guard on every unsubscribe call.

`/prices` returns only the currently subscribed set; `FxcmSession.getOffers()`
calls `getLatestOffersSnapshot` with the full `subscribedOfferIds` set on each
request (live values each time, no stale cache).

### Per-instrument price precision

`/prices` and `/positions` rows now include `digits` and `point_size` from the
FCLite `Instrument` object (read via `instrumentsMgr.getInstrumentByOfferId()`
after subscription):

- **`digits`** — decimal places for price display (e.g. EUR/USD = 5, USD/JPY = 3,
  US30 = 1, XAU/USD = 2). Prefer over the frontend's hardcoded `cfdDigits()`
  heuristic; the heuristic is kept as a fallback for pre-subscription states.
- **`point_size`** — the size of one point/pip (e.g. 0.0001 for most FX pairs,
  0.01 for JPY pairs, 1.0 for indices). Used to compute spread in pips:
  `spread = (ask - bid) / point_size`.
- **`instrument_type`** — FCLite integer type code. `1` = FX pair; `2` = index;
  `8` = stock CFD; others = commodity/treasury/bullion. Used by `FxcmOrderSheet`
  to set the amount step: type `1` → 1,000-unit lots; all others → `BaseUnitSize`.
- **`base_unit_size`** — minimum tradeable unit for non-FX instruments (e.g. `1`
  for indices and stock CFDs). Used as both the default amount and the step in
  `FxcmOrderSheet` when `instrument_type ≠ 1`.

`fmtSpread(bid, ask, pointSize)` in `frontend/src/lib/format.ts` applies this
formula and renders as `"1.2 pts"`.

### `/api/fxcm/instruments` response shape (mind the casing)

Unlike every other FXCM endpoint, `/instruments` returns the raw FCLite
`InstrumentInfo` with **PascalCase** keys:

```json
[
  {"Name": "EUR/USD", "OfferId": "1", "Status": "T"},
  {"Name": "XAU/USD", "OfferId": "121", "Status": "T"},
  {"Name": "US30", "OfferId": "1001", "Status": "T"},
  {"Name": "RBLX.us", "OfferId": "80625", "Status": "D"}
]
```

`Status`: `T` = tradable, `V` = visible (priced), `D` = **not subscribed**
(NOT "disabled" — the user's FXCM account just doesn't have a market-data
subscription for that instrument; resolving subscriptions is a separate
workflow). **Do not filter `D` out** of search results, watchlist add
flows, or any UI surface — the user will resolve subscriptions later and
hiding them prevents that. Roughly
516 entries across fiat-forex pairs, indices, metals, commodities, and stock
CFDs. `frontend/src/api.ts → getFxcmInstruments()` normalises to lowercase
`{instrument, offer_id, status}` at the API boundary so callers see the same
shape as `/watchlist` / `/prices` / `/positions`. Bridge-side normalisation
is backlogged.

**The `?type=forex` query param does nothing useful** — the bridge handler
short-circuits to `[]` for any other value and returns everything for both
`forex` and unset. The `?tradable=true` filter does work (intersects against
the offers manager).

### Enriched row fields (Portfolio screen)

`/positions`, `/orders`, and `/closed_trades` were extended for the Portfolio
screen build. New (all optional — bridge falls back silently when a getter
isn't present in the FCLite build):

- **`/positions`** rows now carry `bid`, `ask`, `mid`, `live_pl`, `digits`,
  `open_time`. The FastAPI proxy in `backend/app/fxcm.py` additionally
  aliases `market_value = used_margin` so the shared `AllocationDonut`
  reads a uniform shape. `live_pl` currently mirrors `gross_pl` (the
  FCLite-maintained "fresh as of this call" value) — a from-mid pip
  recompute was prototyped and pulled because cross-pair currency
  conversion needs more work; the raw `bid`/`ask`/`mid` are present so a
  frontend recompute is straightforward when needed.
- **`/orders`** rows now carry `stop`, `limit`, `digits`, `created_time`.
- **`/closed_trades`** rows now carry `open_time`, `close_time` (ISO 8601;
  absent if the SDK build's `ClosedPosition` doesn't expose the getter).

### Order placement body

```json
{
  "instrument": "EUR/USD",
  "buy_sell": "B",
  "amount": 1000,
  "order_type": "OM",
  "rate": 1.0800,
  "stop": 0,
  "limit": 0
}
```

`buy_sell`: `"B"` = buy, `"S"` = sell.
`order_type`: `"OM"` = market, `"SE"` = stop entry, `"LE"` = limit entry.
`rate`: opening rate for non-market orders (ignored for market). `stop`/`limit`:
protective stop / take-profit rates (0 = none).

### History example

```
GET /api/fxcm/history?instrument=EUR/USD&timeframe=H1&from=2026-05-01&to=2026-05-27
```

Response: array of `FxcmBar`:
```json
[{"time":"2026-05-27T10:00:00","open":1.08341,"high":1.08412,"low":1.08290,"close":1.08385,"ask_open":1.08360,"volume":1423}]
```

## Watchlist API (Endpoints suite, JWT-backed)

This is a **separate FXCM surface** from the FCLite bridge. FCLite gives us
market data + trade execution; the Endpoints suite (`endpoints-demo.fxcm.com`
for auth, `endpoints-demo.fxcorporate.com` for the watchlist itself) is a
REST API behind FXCM's `api-gateway` with OAuth-ish JWT auth — the same
service `app.fxcm.com` uses. Both surfaces live on the same FXCM demo
account (`D161665432`); they just speak different protocols.

| Surface | Host (demo) | Auth | Used for |
|---|---|---|---|
| FCLite | (FCLite WebSocket via `pdemo2.fxcorporate.com`) | username/password handshake at JVM startup | Quotes, history, positions, orders, instrument list |
| Endpoints suite — IAM | `endpoints-demo.fxcm.com` | none for `/iam/authenticate`; cookies + CSRF for `/iam/refresh` | JWT mint + refresh |
| Endpoints suite — Watchlist API | `endpoints-demo.fxcorporate.com` | `Authorization: Bearer <accessToken>` | User-side persisted watchlists |

Live (non-demo) hosts have the same shape minus the `-demo` suffix:
`endpoints.fxcm.com` + `endpoints.fxcorporate.com`. Not wired today — change
the two constants in `backend/app/fxcm_auth.py` and `backend/app/fxcm.py` to
promote.

### Auth flow

The web app's flow has three steps; we implement only the first to keep
state minimal.

```
mint (initial):  POST /iam/authenticate   body: {appName, loginId, password,
                                                  tradingSessionId,
                                                  tradingSessionSubId}
                                          → {accessToken (60s JWT),
                                             refreshToken (30d JWT)}

refresh (rolling): POST /iam/refresh        body: (empty)
                   cookie: refresh-token + XSRF-TOKEN
                   x-xsrf-token: <matches XSRF-TOKEN cookie value>
                   x-cookie-domain: fxcm.com
                                          → {accessToken, refreshToken}
                                            (cookies rotated)

use:    Authorization: Bearer <accessToken>  on every
        endpoints-demo.fxcorporate.com/* call
```

**Our implementation in `backend/app/fxcm_auth.py`:**
- Cache the accessToken in a module-level singleton with a 10s safety
  buffer. Concurrent first requests share one mint via an `asyncio.Lock`.
- Re-mint via `/iam/authenticate` every ~50s rather than implementing the
  refresh-token rolling flow at `/iam/refresh`. Trade-off chosen for a
  single-user paper app: 1 extra HTTP request per minute vs. ~50 LOC of
  cookie-jar + CSRF echo state. Refresh is documented above for when
  multi-user / live trading work needs it.
- Reads credentials from the same `FXCM_USER` / `FXCM_PASS` env vars the
  Java bridge uses (defaults to demo `D161665432` / hardcoded password if
  unset, same as `BridgeServer.java`).
- Parses the JWT `exp` claim to compute lifetime — doesn't trust any
  server-supplied `expires_in` (the response has none).

### JWT payload reference

Decoded payload of an `accessToken` (between the two `.`s of the JWT):

```json
{
  "sub":                   "D161665432",            // demo account ID
  "TradingSessionSubID":   "MINIDEMO",
  "SSOToken":              "036EA8CC679268C0214B8E5B11898C4593D7C93A",
  "TradingSessionID":      "FXCM",
  "UserID":                "1665432",
  "iss":                   "https://fxcm.com",
  "UserKind":              "20",
  "iat":                   1779955305,
  "exp":                   1779955365,              // 60s lifetime
  "jti":                   "c5865aa2-..."
}
```

`refreshToken` adds an outer `SID` (server-side session id, stable across
rolls) and has `exp = iat + 2592000` (30 days).

The `SSOToken` rotates on each mint. It's also what FCLite's
`session.getSSOToken()` would return — same value space, but FCLite uses
its own SSO token for its own session. We don't bridge the two.

### Watchlist API spec (Endpoints suite)

Base: `https://endpoints-demo.fxcorporate.com`. Every endpoint needs
`Authorization: Bearer <accessToken>` and (per the captured CORS preflight)
the `Origin: https://app.fxcm.com` header.

| Route | Method | Purpose | Body | Errors |
|---|---|---|---|---|
| `/` | `POST` | Create a watchlist (PWADEV-3190) | `WatchlistInput` | `409 code=2`: name taken |
| `/id/{id}` | `GET` | Fetch watchlist by ID | — | `404 code=1`: not found |
| `/name/{name}` | `GET` | Fetch watchlist by name | — | `404 code=1`: not found |
| `/id/{id}` | `PUT` | Full update (rename, etc.) (PWADEV-3290) | `WatchlistInput` | `404 code=1`, `409 code=2` |
| `/id/{id}` | `DELETE` | Delete a watchlist | — | `404 code=1` |
| `/id/{id}?mode=ADD\|REMOVE\|REPLACE` | `PATCH` | Mutate `offerIds` only (PWADEV-1258). **⚠️ Documented but not implemented on the demo backend — returns `{"code":0,"message":"Request method 'PATCH' not supported"}`.** `app.fxcm.com` itself does read-modify-write with `PUT /id/{id}` (full doc replace) instead. Our proxy does the same. | `{"offerIds": [int]}` | n/a (unsupported) |
| `/sort` | `PUT` | Reorder all of a user's watchlists | `[<id1>, <id2>, ...]` | `404 code=1` |
| `/watchlist` | `GET` | (Implicit list-all — not in the spec doc but the web app uses it.) | — | — |

#### Data models

`WatchlistOutput` — returned by `GET / POST / PUT / PATCH`:

```json
{
  "id":        "string",      // unique watchlist ID
  "loginId":   "string",      // FXCM user's login ID
  "name":      "string",
  "offerIds":  [ "integer" ], // FCLite OfferId per instrument
  "shared":    "boolean",
  "sortOrder": "integer"      // appears to be epoch-ms of creation
}
```

`WatchlistInput` — sent on `POST` / `PUT`:

```json
{
  "name":      "string",
  "offerIds":  [ "integer" ],
  "shared":    "boolean",
  "sortOrder": "integer"
}
```

`Error` — uniform error body:

```json
{ "code": "integer", "message": "string" }
```

#### Subscription virtualization

When `GET /api/fxcm/watchlist` fetches the watchlist from the Endpoints
suite it has the full `offerIds` list. Those IDs are pushed to the bridge
via `POST /subscribe` only when the set has grown since the last poll
(tracked in `_last_subscribed_offer_ids` frozenset in `fxcm.py`). This is
incremental — already-subscribed IDs are dropped in `FxcmSession.subscribeOfferIds`
before the bridge makes any network call. Result: watchlist instruments are
subscribed within one poll cycle (≤3 s), with zero redundant bridge calls.

### Our proxy mapping (`backend/app/fxcm.py`)

We pin to one watchlist per user (single-user app) and expose a singular
surface that mirrors the old hardcoded-subset shape so callers don't
change.

| Our route | What it does | FXCM call(s) |
|---|---|---|
| `GET /api/fxcm/watchlist` | Returns the user's pinned watchlist enriched with live bid/ask + display_name (same `FxcmPrice[]` shape as `/api/fxcm/prices`). | `GET /watchlist/id/{id}` → translate offerIds to symbols → intersect with `/api/fxcm/prices` (bridge) |
| `POST /api/fxcm/watchlist` body `{"instrument": "XAU/USD"}` | Add an instrument by symbol. Read-modify-write: server resolves the offerId via the FCLite `/instruments` cache, GETs the current watchlist, appends the new offerId, PUTs the full document back. Skipped if the offerId is already present. | `GET /watchlist/id/{id}` then `PUT /watchlist/id/{id}` with new `offerIds` |
| `DELETE /api/fxcm/watchlist/{instrument:path}` | Remove an instrument by symbol. Same read-modify-write shape as add. | `GET /watchlist/id/{id}` then `PUT /watchlist/id/{id}` with filtered `offerIds` |

#### Find-or-create

The watchlist ID is resolved lazily on first request and cached in memory:

```
on resolve:
  if cached:        return it
  list = GET /watchlist          (full list across the user's account)
  if list non-empty: cache list[0].id; return
  else:             POST / body {"name":"Trading Platform", "offerIds":[],
                                  "shared": false, "sortOrder": now_ms}
                    cache returned id; return
```

If the user deletes the pinned watchlist on FXCM's side, our `GET /watchlist`
404s; the route catches that, calls `_reset_watchlist_id()`, and re-resolves
on the retry. Self-healing.

#### offerId ↔ symbol map

The Endpoints suite speaks in `offerIds` (integers, e.g. `1` = EUR/USD,
`80619` = some stock CFD). FCLite's `/instruments` exposes the same
`OfferId` per `Name`. We pull the full list once per hour into a Python
`dict` and translate at the proxy boundary:

- On `GET`: offerId → symbol (so the response shape matches `FxcmPrice[]`)
- On `POST` / `DELETE`: symbol → offerId (so the user-facing API speaks
  symbols, not magic numbers)

On a cache miss (e.g. the user adds a symbol that FCLite saw for the
first time today), the map auto-refreshes once before failing with 404.

## Frontend Integration

### Silo routing

`App.tsx`:
- `AssetClassMode` includes `"cfd"`. Legacy `"forex"` localStorage values
  are migrated to `"cfd"` on read.
- When `activeClass === "cfd"` and `mode === "discover"`, renders `<CfdDiscoverPage />`.
- `TradeBar` is suppressed in CFD mode (no Alpaca order entry).
- CFD accent: `oklch(72% 0.18 55)` (orange/amber).

### CfdDiscoverPage

`frontend/src/components/CfdDiscoverPage.tsx`

- No page-level header — the silo title ("CFDs") and bridge status badge were removed; the `BridgeStatus` component is gone. Bridge health is still checked on mount (`getFxcmHealth()`) to gate data-fetch hooks; if offline, shows an inline offline notice.
- Polls `/api/fxcm/watchlist` every 3 s for live bid/ask.
- Price rows colour bid green/red on uptick/downtick (prev vs current comparison
  held in `prevPrices` Map).
- Spread displayed via `fmtSpread(bid, ask, pointSize)` = `(ask - bid) / pointSize` rendered as pts — uses `point_size` from the `/prices` row (per-instrument from FCLite), not a hardcoded pair-class multiplier.
- Account hero shows equity, balance, used margin, free margin.
- Standard `EconomicCard` mounted under the watchlist, filtered to the
  FXCM-derived country set via `lib/fxcm-countries.ts` (maps any FXCM
  instrument → country set: fiat/fiat pairs → both quote countries + EU
  for euro legs, metal pairs via the quote leg, stock-CFD suffixes
  `.us`/`.de`/`.hk`/..., index name prefixes `US30`/`UK100`/`GER30`/...).
  `useFxcmInstruments` caches the symbol list for 1 h; the resulting
  countries are passed to `useEconomicCalendar(countries, enabled)`
  which forwards them to the backend `/api/calendar/economic?countries=`
  filter.
- **Inline price chart** (`CfdPriceChart`, mounted between the watchlist
  and the economic calendar) — a `lightweight-charts` candle panel for
  the row currently selected on the watchlist. Local `selected` state
  seeded with the first row on first prices-load; clicking another row
  highlights it (`--accent-bg`) and switches the chart. OHLCV comes from
  `useFxcmBars` (queries `/api/fxcm/history` with per-timeframe `from`/`to`
  windows — `m1`/2d, `m5`/7d, `m15`/14d, `m30`/21d, `H1`/60d, `H4`/180d,
  `D1`/2y, `W1`/5y — since the bridge requires explicit dates; 60 s refetch
  on intraday timeframes, 5 min on daily/weekly). The live tip rides the
  page's existing 3 s `/api/fxcm/prices` poll (the `livePrice` prop) — no
  extra request floor. Day Δ% derives from the second-to-last D1 close so
  it stays consistent across timeframe switches; React Query dedupes when
  the chart is already on D1. Precision uses `digits` from the live `/prices`
  row (per-instrument from FCLite), falling back to `cfdDigits(symbol)` when
  not yet subscribed — applies to both the live-price header and the chart
  right price axis (`priceFormat.precision`). Spread chip uses
  `fmtSpread(bid, ask, point_size)`. "Open ↗" propagates the selected instrument to
  App-level state via `onSelectSymbol` and fires `onOpenChart` to switch
  into full TV Chart mode. Sibling rather than a branch inside
  `PriceChart` because the data shapes (`FxcmBar` ISO time vs Alpaca
  epoch), hooks, and per-type formatting all differ, and `PriceChart`
  already carries the Workspace `responsive` tier branches — the CFD
  Discover surface is single-column / full-tier only.

### FXCM-aware classifier (`lib/asset-class.ts`)


Crypto and FXCM symbols both use BASE/QUOTE form (BTC/USD vs EUR/USD vs
XAU/USD). FXCM also serves non-pair symbols (US30, NAS100, SPX500, stock
CFDs like RBLX.us). Slash alone is ambiguous — the classifier is two-tier:

1. **Cache** populated from `/api/fxcm/instruments` at app boot via
   `registerFxcmSymbols(symbols)`. Authoritative; covers indices, metals,
   commodities, stock CFDs.
2. **ISO 4217 fiat regex** fallback for the synchronous pre-boot path.
   Catches every common fiat-forex pair (`<fiat>/<fiat>`) before the bridge
   fetch resolves.

```ts
isCfdSymbol("EUR/USD") // true (regex)
isCfdSymbol("XAU/USD") // true after boot (cache); false pre-boot (benign)
isCryptoSymbol("BTC/USD") // true (slash, not in cache, not fiat/fiat)
isCryptoSymbol("EUR/USD") // false
```

`isCryptoSymbol(s)` is just `s.includes("/") && !isCfdSymbol(s)`. The
backend mirror in `alpaca/client.py` keeps only the ISO-fiat check (no
cache, named `is_forex` since it strictly detects fiat/fiat pairs) — it's a
safety net since frontend silo gating already prevents FXCM symbols from
reaching Alpaca routes.

### Chart-mode CFD (TV datafeed)

`lib/tv-datafeed.ts` branches on `getAssetClass() === "cfd"` in six places
— all FXCM symbol types flow through correctly regardless of shape:

| Method | CFD branch | Notes |
|---|---|---|
| `searchSymbols` | `api.getFxcmInstruments()` + client-side filter | The bridge silently ignores `?search=`, and `/api/fxcm/instruments` returns raw PascalCase (`Name`/`OfferId`/`Status`). Route through `api.getFxcmInstruments()` for the lowercase normalisation, then substring-filter client-side (prefix matches first, capped at 50). All status codes — incl. `D` ("not subscribed", not "disabled") — stay in results. Note: the **watchlist** `AssetSearch` now uses `searchFxcmInstruments` (DB-backed, searches name/display_name/alternatives ILIKE) instead of this bridge path — see "DB-only endpoints" above. |
| `resolveSymbol` | Local hardcoded shape | CFD symbols aren't in Alpaca's catalogue. `pricescale` derived from `cfdPriceScale(symbol)` (JPY: 1000, else 100000) — still hardcoded; switch to `digits` from the offers row when wiring that backlog item. |
| `getBars` | `/api/fxcm/history` | TV resolutions map via `FXCM_RESOLUTION_MAP` (`"1"→"m1"`, `"60"→"H1"`, `"D"→"D1"`, …). Bar `time` is a naive ISO string (no zone) but the bridge's timestamps are UTC — append `Z` before `Date.parse` or every candle shifts by the user's TZ offset. |
| `subscribeBars` | **no-op** | Bridge has no SSE bar stream; the historical bars stay static between fetches, the live price line still moves via `subscribeQuotes`. Real-time bar updates are a backlog item. |
| `getQuotes` | `/api/fxcm/prices` (one call, filter client-side) | Cheaper than per-symbol fetches. |
| `subscribeQuotes` | 3s `setInterval` polling `/api/fxcm/prices`, diff-only emission | Mirrors `CfdDiscoverPage`'s cadence. Replace with FCLite push subscription when that lands. |

`tv-broker.ts` short-circuits every Alpaca-bound route (`/api/account`,
`/api/orders`, `/api/positions`, `/api/activities`) when `getAssetClass()`
returns `"cfd"` — the TV account manager stays empty in CFD mode.
CFD trading still happens via `CfdDiscoverPage` + `FxcmOrderSheet`.

## Known Gotchas

### DNS / network

- `api-demo.fxcm.com` does not resolve in DNS — use the JVM hosts file workaround.
- `-Djdk.net.hosts.file` replaces the JVM's resolver entirely (not additive). All
  FXCM servers must be in the file or they will fail to connect.
- The same JVM hosts file works identically on Linux — we bake it into the
  Render image at `/app/jvm-hosts.txt` (source: `backend/jvm-hosts.txt`) and
  pass `-Djdk.net.hosts.file=/app/jvm-hosts.txt` from `entrypoint.sh`. This
  avoids mutating `/etc/hosts` at container runtime and keeps Render
  Blueprints (which expose no `extra_hosts`) viable.

### SSL / hostname

- FCLite uses Apache HttpClient 5 (HC5) internally — `SSLContext.setDefault()`
  and `HttpsURLConnection.setDefaultSSLSocketFactory()` do NOT affect it.
- The `DefaultHostnameVerifier` override in project source is the correct fix.
  It works because Maven shade gives project source priority over transitive deps.
- The override constructor must accept `PublicSuffixMatcher` (not `Object`) to
  match the exact signature HC5 uses — otherwise `NoSuchMethodError` at runtime.
- `httpclient5:5.1` must be `compile` scope (not `provided`) so HC5 classes land
  in the fat JAR — without them, `NoClassDefFoundError: HttpClientConnectionManager`.

### FCLite API quirks

- `OfferInfo` has no `getSymbol()` — always use `instrumentsMgr.getInstrumentByOfferId(offerId).getSymbol()`.
- `IPriceHistoryResponse` is not iterable — use `getCount()` + indexed `getBidOpen(i)` etc.
- `IAccountsManager` does not extend `IDataManager` — load with `getAccountsSnapshot(callback)`.
- `createOpenMarketOrder()` returns void — capture order ID via `IOrderChangeListener.onAdd()`.
- `ordersMgr.removeOrder(orderId)` is the cancellation method (not `deleteOrder`).

## What's Shipped

- FCLite Java bridge with persistent session (login, manager loading)
- **Selective subscription** — bridge subscribes only open-position and open-order
  instruments at boot; watchlist instruments are pushed incrementally via `POST /subscribe`
  as the user's watchlist is fetched. No bulk `IOffersManager.refresh()` at startup.
- **Per-instrument precision** — `/prices` rows include `digits` (decimal places)
  and `point_size` from FCLite `Instrument`; all CFD price display surfaces prefer `digits`
  over the hardcoded `cfdDigits()` heuristic: `CfdDiscoverPage`, `CfdPriceChart` (chart
  header + axis `priceFormat`), `TradeBar` (`fmtPriceChip`), and `FxcmOrderSheet` (rate
  display + input placeholder). `cfdDigits()` / `cfdPriceScale()` remain as pre-subscription
  fallbacks. Spread displayed via `fmtSpread` = `(ask - bid) / point_size`. The TV chart's
  `resolveSymbol` `pricescale` is still hardcoded (backlog).
- All read + write routes (read: account/prices/positions/orders/closed_trades/instruments/history; write: order/close + `PATCH /order/{id}` modify)
- FastAPI proxy at `/api/fxcm/*`
- Frontend CFD silo end-to-end: orange accent, splash card (live FXCM
  equity / day P/L / positions on the Account Hub overlay),
  CfdDiscoverPage (account hero, FXCM-side watchlist as SparkCard grid +
  AddSymbolTile mirroring stocks/crypto, FxcmPositions panel, inline
  `CfdPriceChart` for the selected instrument, FXCM-country-filtered
  economic calendar), FxcmOrderSheet
- **FXCM-side watchlist CRUD** — `backend/app/fxcm_auth.py` mints + caches
  a 60s JWT from `/iam/authenticate` (re-mints every ~50s). `fxcm.py`
  proxies the Endpoints-suite watchlist API at
  `endpoints-demo.fxcorporate.com` — find-or-create resolution, offerId
  ↔ symbol translation via the FCLite `/instruments` table, GET (enriched
  with live bid/ask) / POST (add) / DELETE (remove). Frontend's
  AddSymbolTile + SparkCard pattern works against it identically to
  stocks/crypto.
- **CFD Portfolio screen** — `CfdPortfolioHero` (equity + day-chip +
  Free margin / Total P/L / Open orders; no sparkline), shared
  `AllocationDonut` over per-instrument used-margin, netted-per-instrument
  `Positions` view + `FxcmClosePositionCard` (partial close loops over
  underlying trade_ids), sibling `FxcmOrders` blotter + `FxcmModifyOrderCard`,
  `Activities` mapping FXCM closed trades into the shared feed
- Render deployment co-located with FastAPI (`backend/Dockerfile` multi-stage, `backend/entrypoint.sh` dual-process)
- FXCM-aware classifier + TV datafeed CFD branches for the chart

- **Display names** — `fxcm_instruments` Postgres table (seeded once via
  `POST /api/_dev/seed-fxcm-instruments`) stores `display_name` (e.g. "Gold"
  for XAU/USD), `underlying_unit` (e.g. "oz"), and `alternatives[]` for
  search. `useFxcmDisplayNames()` and `useFxcmUnderlyingUnit()` hooks fetch
  once per session (`staleTime: Infinity`) via Vercel (`API_BASE`). Display
  names propagate to every CFD symbol surface: watchlist, positions, orders,
  activities, order sheets, close cards, chart header. Raw `name` (e.g.
  "XAU/USD") is always used for API calls; `display_name` is display-only.
- **CFD header status** — header and mobile header show "Open · 24/5" for
  the CFD silo (was incorrectly showing the Alpaca stock-market clock). Fixed
  by passing `activeClass` (not `alpacaSilo`) to `HeaderStatusInline` /
  `MobileHeader`; both components now handle `assetClass === "cfd"`.
- **CFD Discover page cleanup** — removed "+ New Order" button, "Bridge
  connected" badge, and the "FXCM ForexConnect — demo account" subtitle from
  the page header (all were clutter not present in the stocks/crypto silos).
  The `BridgeStatus` component is gone.
- **DB-backed CFD search** — `AssetSearch` with `source="fxcm"` queries
  `GET /api/fxcm/search-instruments` (name + display_name + alternatives
  ILIKE) and shows `display_name` as the label. Replaces the old full-list
  bridge fetch + client-side substring filter.
- **Workspace integration** — CFD is a first-class Workspace silo across every
  widget (Chart, Mini chart, Positions, Orders, Activity, Account, Watchlist,
  Trade, Profile/Fundamentals for stock CFDs, the Tipranks research widgets
  resolving US (`.us` / `.ext`) underlyings), plus AI/Ask-anything control and a
  silo-aware ChartBot. Full per-widget reference in `docs/workspace.md` → "CFD silo".

Outstanding work lives in `BACKLOG.md` → "CFDs (FXCM)".

## Render Deployment

The bridge ships in the same container as the FastAPI relay. Touched files:

| File | Role |
|---|---|
| `backend/Dockerfile` | Multi-stage: `maven:3.9-eclipse-temurin-17` builds the fat JAR; `python:3.12-slim` + `openjdk-21-jre-headless` runs both processes. |
| `backend/entrypoint.sh` | Backgrounds the JVM with tuned heap flags + `-Djdk.net.hosts.file=/app/jvm-hosts.txt`, then runs uvicorn. `kill -0` poll loop waits on both PIDs; SIGTERM kills both. |
| `backend/jvm-hosts.txt` | DNS overrides baked into the image. |
| `render.yaml` | Adds `FXCM_USER` / `FXCM_PASS` as `sync: false` secrets. |

The proxy in `backend/app/fxcm.py` talks to `http://127.0.0.1:3001`, which
now resolves to the in-container JVM. The bridge stays bound to `127.0.0.1`
so it's not reachable from outside the container. From the **frontend**, FXCM
calls go directly to the Render origin (`VITE_STREAM_BASE`) — Vercel's
serverless container has no bridge.

**Render plan:** `starter` (512 MB). With the heap caps below the steady-state
is ≈ 350–400 MB; bump to `standard` if it OOMs under load.

### Deploy lessons (don't re-learn these)

These cost real time during the first deploy. Future agents touching the
container should know:

- **FXCM's `public-maven` repo uses a non-Maven layout.** Artifacts live at
  `com.fxcm.api/forex-connect-lite/1.3.3/...` — `groupId` stays dotted, not
  slashed. Neither Maven 2 default nor Maven 1 legacy layout resolvers can
  consume it. Workaround: `curl` the jar + pom, then
  `mvn install:install-file -DpomFile=...` to seed the local repo before
  `mvn package`. See the Dockerfile's stage-1 `RUN`.
- **Render injects `PORT` for the public-facing process** (uvicorn here).
  The bridge originally read the same `PORT` env var and crashed with
  `java.net.BindException: Address already in use`. Renamed to
  `FXCM_BRIDGE_PORT` (default `3001`). Never name a sub-process port env
  `PORT` on a Render service.
- **`python:3.12-slim` now pulls Debian trixie.** `openjdk-17-jre-headless`
  is gone from trixie — use `openjdk-21-jre-headless`. FCLite is Java 8
  bytecode; runs identically on 21.
- **`/bin/sh` in the slim image is dash, not bash.** `wait -n` is a bash
  builtin and crashes dash with `Illegal option -n`. The entrypoint uses a
  portable `kill -0` poll loop instead.
- **JVM defaults are heap-hungry on a 512 MB container.** Out of the box
  the JVM grabbed ~25 % of container RAM as max heap plus ~150 MB of
  metaspace/code-cache/native and pushed RSS to 99 %. Caps:
  `-Xms64m -Xmx192m -XX:MaxMetaspaceSize=96m -XX:ReservedCodeCacheSize=32m
  -XX:+UseSerialGC`. The bridge is a single FXCM session, mostly I/O — these
  are several × what it actually uses.

### To deploy

1. Set `FXCM_USER` / `FXCM_PASS` in the Render dashboard for the
   `trading-relay` service. Unset = hardcoded demo defaults from
   `BridgeServer.java`.
2. Push to `main` (or whichever branch `autoDeploy` watches). The Docker
   build runs both stages; first build pulls ~100 MB of Maven deps.
3. Verify: `curl https://<service>.onrender.com/api/fxcm/health` → `{"status":"ok","account":"<acct>"}` ~5–10 s after the container starts.
   Logs should show, in order: `Connecting to FXCM via FCLite...` →
   `FXCM connected — account ...` → `Bridge listening on http://127.0.0.1:3001`
   → `Uvicorn running on http://0.0.0.0:10000`.

## Running the Full Stack Locally (with CFDs)

```bash
# Terminal 1 — FXCM bridge (see "Starting the Bridge (local)" above)
java -Djdk.net.hosts.file=/path/to/jvm-hosts.txt \
     -jar fxcm-bridge/java/target/fxcm-bridge-1.0.0.jar

# Terminal 2 — FastAPI backend
cd backend && python -m uvicorn app.main:app --reload --port 8000

# Terminal 3 — Frontend
cd frontend && npm run dev
```

Open http://localhost:5173, pick **CFDs** from the splash. If you'd rather
not run the bridge locally, leave `VITE_STREAM_BASE` pointed at the Render
relay and the deployed bridge handles FXCM calls.

## Relation to Other Docs

- `CLAUDE.md` — Workflow rules, architecture overview; FXCM bridge described under "Four runtime targets".
- `docs/landmines.md` — Runtime gotchas; FXCM section documents the HC5 SSL / JVM DNS issues.
- `BACKLOG.md` — Deferred CFD work.
- `README.md` — Setup instructions include the bridge build/run step.
