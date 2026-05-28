# FXCM ForexConnect Integration

Comprehensive reference for the FXCM forex silo. Read before touching the
bridge, the backend proxy, or the frontend Forex Discover page. This doc is
intentionally detailed so another agent can pick up cold.

## Overview

The platform supports three trading silos:

| Silo | Data source | Runtime |
|------|-------------|---------|
| Stocks | Alpaca REST + WebSocket | Vercel + Render |
| Crypto | Alpaca REST + WebSocket | Vercel + Render |
| **Forex** | **FXCM FCLite Java SDK** | **Render (co-runs with FastAPI)** |

The Forex silo is a **POC** running against a hardcoded FXCM demo account.
The FCLite Java bridge ships **in the same Render container** as the FastAPI
relay (multi-stage build in `backend/Dockerfile`, boot orchestrated by
`backend/entrypoint.sh`). The frontend still handles the bridge being offline
gracefully (shows an offline notice instead of crashing) — if the JVM dies,
`/api/fxcm/*` returns 503 and the page recovers when Render restarts the
container.

## Architecture

```
Browser
  ↓  /api/fxcm/*  (FastAPI proxy)
backend/app/fxcm.py
  ↓  http://127.0.0.1:3001  (httpx async, TIMEOUT=10s)
fxcm-bridge/java/target/fxcm-bridge-1.0.0.jar  (FCLite Java bridge, port 3001)
  ↓  FCLite SDK (Apache HC5 + Tyrus WebSocket)
FXCM demo servers  (pdemo2.fxcorporate.com, mdt*prices.fxcorporate.com)
```

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
| `backend/app/fxcm.py` | FastAPI proxy router at `/api/fxcm/*` |
| `frontend/src/components/ForexDiscoverPage.tsx` | Forex Discover page |
| `frontend/src/api.ts` | FXCM API functions (`getFxcm*` block). Hit Render directly via `STREAM_BASE` — Vercel has no bridge. |
| `frontend/src/types.ts` | FXCM types (`FxcmAccount`, `FxcmPrice`, `FxcmBar`, `FxcmPosition`, `FxcmInstrument`) |
| `frontend/src/lib/asset-class.ts` | FXCM-aware `isForexSymbol` / `isCryptoSymbol`; cache populated at boot by App.tsx |
| `frontend/src/lib/tv-datafeed.ts` | TV datafeed forex branches (search/resolve/bars/quotes) |
| `frontend/src/lib/tv-broker.ts` | TV broker — Alpaca routes short-circuited in forex mode |
| `frontend/src/components/trade/FxcmOrderSheet.tsx` | Forex order ticket (Alpaca's OrderSheet is not reusable) |
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

`C:\Temp\jvm-hosts.txt` content:
```
204.8.240.52 api-demo.fxcm.com
204.8.241.37 pdemo2.fxcorporate.com
204.8.241.31 mdt4prices.fxcorporate.com
204.8.241.21 mdt1prices.fxcorporate.com
204.8.240.16 mdt2prices.fxcorporate.com
204.8.240.24 mdt3prices.fxcorporate.com
```

The IPs were resolved from `www.fxcorporate.com/Hosts.jsp` (the endpoint FXCM's
own PWA uses for server discovery — visible via browser DevTools Network tab).

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
| `GET /prices` | `GET /api/fxcm/prices` | All offers (live bid/ask); `?instrument=EUR/USD` or `?type=forex` to filter |
| `GET /watchlist` | `GET /api/fxcm/watchlist` | 8 major pairs subset |
| `GET /positions` | `GET /api/fxcm/positions` | Open trades |
| `GET /orders` | `GET /api/fxcm/orders` | Pending orders |
| `GET /summary` | `GET /api/fxcm/summary` | — (proxied but not yet implemented in bridge) |
| `GET /closed_trades` | `GET /api/fxcm/closed_trades` | Closed trade history |
| `GET /instruments` | `GET /api/fxcm/instruments` | All FXCM instruments — see note below |
| `GET /instruments/{name}` | `GET /api/fxcm/instruments/{name:path}` | Single instrument (e.g. `EUR/USD`) |
| `GET /history` | `GET /api/fxcm/history` | OHLCV bars; params: `instrument`, `timeframe`, `from`, `to` |
| `POST /order` | `POST /api/fxcm/order` | Place order |
| `DELETE /order/{id}` | `DELETE /api/fxcm/order/{id}` | Cancel pending order |
| `POST /close` | `POST /api/fxcm/close` | Close open trade by `trade_id` |
| `GET /debug` | `GET /api/fxcm/debug` | Raw snapshot counts (dev only) |

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

`Status`: `T` = tradable, `V` = visible (priced), `D` = disabled. Roughly
516 entries across forex pairs, indices, metals, commodities, and stock
CFDs. `frontend/src/api.ts → getFxcmInstruments()` normalises to lowercase
`{instrument, offer_id, status}` at the API boundary so callers see the same
shape as `/watchlist` / `/prices` / `/positions`. Bridge-side normalisation
is backlogged.

**The `?type=forex` query param does nothing useful** — the bridge handler
short-circuits to `[]` for any other value and returns everything for both
`forex` and unset. The `?tradable=true` filter does work (intersects against
the offers manager).

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

## Frontend Integration

### Silo routing

`App.tsx`:
- `AssetClassMode` includes `"forex"`.
- When `activeClass === "forex"` and `mode === "discover"`, renders `<ForexDiscoverPage />`.
- `TradeBar` is suppressed in forex mode (no Alpaca order entry).
- Forex accent: `oklch(72% 0.18 55)` (orange/amber).

### ForexDiscoverPage

`frontend/src/components/ForexDiscoverPage.tsx`

- Checks bridge health on mount (`getFxcmHealth()`). If offline, shows an offline notice.
- Polls `/api/fxcm/watchlist` every 3 s for live bid/ask.
- Price rows colour bid green/red on uptick/downtick (prev vs current comparison
  held in `prevPrices` Map).
- Spread displayed in pips (multiplied by 100,000 for most pairs, 1,000 for JPY).
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

### FXCM-aware classifier (`lib/asset-class.ts`)

Crypto and FXCM symbols both use BASE/QUOTE form (BTC/USD vs EUR/USD vs
XAU/USD). FXCM also serves non-pair symbols (US30, NAS100, SPX500, stock
CFDs like RBLX.us). Slash alone is ambiguous — the classifier is two-tier:

1. **Cache** populated from `/api/fxcm/instruments` at app boot via
   `registerFxcmSymbols(symbols)`. Authoritative; covers indices, metals,
   commodities, stock CFDs.
2. **ISO 4217 fiat regex** fallback for the synchronous pre-boot path.
   Catches every common forex pair (`<fiat>/<fiat>`) before the bridge
   fetch resolves.

```ts
isForexSymbol("EUR/USD") // true (regex)
isForexSymbol("XAU/USD") // true after boot (cache); false pre-boot (benign)
isCryptoSymbol("BTC/USD") // true (slash, not in cache, not fiat/fiat)
isCryptoSymbol("EUR/USD") // false
```

`isCryptoSymbol(s)` is just `s.includes("/") && !isForexSymbol(s)`. The
backend mirror in `alpaca/client.py` keeps only the ISO-fiat check (no
cache) — it's a safety net since frontend silo gating already prevents
FXCM symbols from reaching Alpaca routes.

### Chart-mode forex (TV datafeed)

`lib/tv-datafeed.ts` branches on `getAssetClass() === "forex"` in six places
— all FXCM symbol types flow through correctly regardless of shape:

| Method | Forex branch | Notes |
|---|---|---|
| `searchSymbols` | `/api/fxcm/instruments?search=` | Bridge fuzzy-matches client-side; passes through TV's search UI. |
| `resolveSymbol` | Local hardcoded shape | Forex/CFD symbols aren't in Alpaca's catalogue. `pricescale` derived from `forexPriceScale(symbol)` (JPY: 1000, else 100000) — still hardcoded; switch to `digits` from the offers row when wiring that backlog item. |
| `getBars` | `/api/fxcm/history` | TV resolutions map via `FXCM_RESOLUTION_MAP` (`"1"→"m1"`, `"60"→"H1"`, `"D"→"D1"`, …). |
| `subscribeBars` | **no-op** | Bridge has no SSE bar stream; the historical bars stay static between fetches, the live price line still moves via `subscribeQuotes`. Real-time bar updates are a backlog item. |
| `getQuotes` | `/api/fxcm/prices` (one call, filter client-side) | Cheaper than per-symbol fetches. |
| `subscribeQuotes` | 3s `setInterval` polling `/api/fxcm/prices`, diff-only emission | Mirrors `ForexDiscoverPage`'s cadence. Replace with FCLite push subscription when that lands. |

`tv-broker.ts` short-circuits every Alpaca-bound route (`/api/account`,
`/api/orders`, `/api/positions`, `/api/activities`) when `getAssetClass()`
returns `"forex"` — the TV account manager stays empty in forex mode.
Forex trading still happens via `ForexDiscoverPage` + `FxcmOrderSheet`.

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
- All read + write routes (read: account/prices/positions/orders/closed_trades/watchlist/instruments/history; write: order/close)
- FastAPI proxy at `/api/fxcm/*`
- Frontend forex silo end-to-end: orange accent, splash card (live FXCM
  equity / day P/L / positions on the Account Hub overlay),
  ForexDiscoverPage (account hero, live watchlist, FxcmPositions panel,
  FXCM-country-filtered economic calendar), FxcmOrderSheet
- Render deployment co-located with FastAPI (`backend/Dockerfile` multi-stage, `backend/entrypoint.sh` dual-process)
- FXCM-aware classifier + TV datafeed forex branches for the chart

Outstanding work lives in `BACKLOG.md` → "Forex (FXCM)".

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

## Running the Full Stack Locally (with Forex)

```bash
# Terminal 1 — FXCM bridge (see "Starting the Bridge (local)" above)
java -Djdk.net.hosts.file=/path/to/jvm-hosts.txt \
     -jar fxcm-bridge/java/target/fxcm-bridge-1.0.0.jar

# Terminal 2 — FastAPI backend
cd backend && python -m uvicorn app.main:app --reload --port 8000

# Terminal 3 — Frontend
cd frontend && npm run dev
```

Open http://localhost:5173, pick **Forex** from the splash. If you'd rather
not run the bridge locally, leave `VITE_STREAM_BASE` pointed at the Render
relay and the deployed bridge handles FXCM calls.

## Relation to Other Docs

- `CLAUDE.md` — Workflow rules, architecture overview; FXCM bridge described under "Four runtime targets".
- `docs/landmines.md` — Runtime gotchas; FXCM section documents the HC5 SSL / JVM DNS issues.
- `BACKLOG.md` — Deferred Forex work.
- `README.md` — Setup instructions include the bridge build/run step.
