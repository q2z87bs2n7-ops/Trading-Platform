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
| **Forex** | **FXCM FCLite Java SDK** | **Local sidecar only (for now)** |

The Forex silo is a **POC** running against a hardcoded FXCM demo account. It
is **local-only** — the bridge runs on the developer's machine; it is not yet
deployed to Vercel or Render. The frontend handles the bridge being offline
gracefully (shows an offline notice instead of crashing).

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
| `frontend/src/api.ts` | FXCM API functions (bottom of file, `getFxcm*`) |
| `frontend/src/types.ts` | FXCM types (`FxcmAccount`, `FxcmPrice`, `FxcmBar`, `FxcmPosition`) |

## Building the Bridge

```powershell
# Requires: JDK 8+ (JDK 25 installed at C:\jdk25\jdk-25.0.3+9) + Maven 3.x
$env:JAVA_HOME = "C:\jdk25\jdk-25.0.3+9"
$env:Path = "$env:JAVA_HOME\bin;C:\maven\apache-maven-3.9.16\bin;$env:Path"

cd C:\Users\cmischel\Trading-Platform\fxcm-bridge\java
mvn package -DskipTests
```

Produces `target\fxcm-bridge-1.0.0.jar` — a fat JAR with all dependencies
bundled, including the FCLite SDK and Apache HttpClient 5.

## Starting the Bridge

```powershell
# From any directory — requires the JVM hosts file (see DNS section)
& "C:\jdk25\jdk-25.0.3+9\bin\java.exe" `
    -Djdk.net.hosts.file=C:\Temp\jvm-hosts.txt `
    -jar "C:\Users\cmischel\Trading-Platform\fxcm-bridge\java\target\fxcm-bridge-1.0.0.jar"
```

The bridge logs `"FXCM connected — account D161665432"` when ready. It
listens on `http://127.0.0.1:3001`.

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
| `GET /instruments` | `GET /api/fxcm/instruments` | All instruments; `?type=forex` / `?tradable=true` |
| `GET /instruments/{name}` | `GET /api/fxcm/instruments/{name:path}` | Single instrument (e.g. `EUR/USD`) |
| `GET /history` | `GET /api/fxcm/history` | OHLCV bars; params: `instrument`, `timeframe`, `from`, `to` |
| `POST /order` | `POST /api/fxcm/order` | Place order |
| `DELETE /order/{id}` | `DELETE /api/fxcm/order/{id}` | Cancel pending order |
| `POST /close` | `POST /api/fxcm/close` | Close open trade by `trade_id` |
| `GET /debug` | `GET /api/fxcm/debug` | Raw snapshot counts (dev only) |

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

### `isCryptoSymbol` slash conflict

`lib/asset-class.ts` uses `symbol.includes("/")` to fast-detect crypto. Forex
pairs (EUR/USD, GBP/USD …) also contain a slash. **This is not a bug in the
current POC** because forex symbols never enter the Alpaca flows. If forex
symbols ever reach `useOrderTicket` or the TradingView datafeed, the slash
detection will misclassify them as crypto. Track this before deepening the
Chart-mode integration.

## Known Gotchas

### DNS / network

- `api-demo.fxcm.com` does not resolve in DNS — use the JVM hosts file workaround.
- `-Djdk.net.hosts.file` replaces the JVM's resolver entirely (not additive). All
  FXCM servers must be in the file or they will fail to connect.
- On Linux (Render), the system `/etc/hosts` can be written directly — the JVM
  hosts file trick is only needed on Windows without admin rights.

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

## What's Implemented

- [x] FCLite Java bridge with persistent session (login, manager loading, reconnect)
- [x] All read routes (account, prices, positions, orders, closed trades, watchlist, instruments, history)
- [x] Order placement (market) and cancellation
- [x] Trade close
- [x] FastAPI proxy router (`/api/fxcm/*`)
- [x] Frontend Forex silo: `AssetClassMode` extended, orange accent, splash card, settings switcher
- [x] ForexDiscoverPage: account hero + live watchlist (3s polling, tick colouring)

## What's NOT Implemented (Next Steps)

See also `BACKLOG.md` → "Forex (FXCM)".

1. **Order entry UI** — bridge has `/order` + `/close`; no frontend order ticket yet.

2. **Positions panel** — `/api/fxcm/positions` data exists; no frontend table yet.

3. **Chart integration** — `/api/fxcm/history` returns OHLCV bars compatible with
   TradingView's format. The TV datafeed needs a forex branch. Resolve the
   `isCryptoSymbol` slash conflict first.

4. **Real-time price updates** — currently 3s polling. FCLite supports push callbacks
   for genuine real-time quotes.

5. **Render deployment** — the bridge is local-only. To deploy:
   - Add Java build step to `backend/Dockerfile` (or a separate Render service).
   - On Linux, add FXCM servers to `/etc/hosts` instead of using the JVM hosts file.
   - The `DefaultHostnameVerifier` override and fat JAR approach work identically on Linux.

6. **Credentials in env** — already env-var ready (`FXCM_USER`, `FXCM_PASS`, `FXCM_URL`,
   `FXCM_CONN`); hardcoded defaults are for the demo POC only.

7. **Spread pip denominator** — hardcoded in frontend. Use the `digits` field from the
   offers data instead.

## Running the Full Stack Locally (with Forex)

```powershell
# Terminal 1 — FXCM bridge
& "C:\jdk25\jdk-25.0.3+9\bin\java.exe" `
    -Djdk.net.hosts.file=C:\Temp\jvm-hosts.txt `
    -jar "C:\Users\cmischel\Trading-Platform\fxcm-bridge\java\target\fxcm-bridge-1.0.0.jar"

# Terminal 2 — FastAPI backend
cd backend
python -m uvicorn app.main:app --reload --port 8000

# Terminal 3 — Frontend
cd frontend
npm run dev
```

Open http://localhost:5173, pick **Forex** from the splash or Settings → Market.

## Relation to Other Docs

- `CLAUDE.md` — Workflow rules, architecture overview; FXCM bridge described under "Four runtime targets".
- `docs/landmines.md` — Runtime gotchas; FXCM section documents the HC5 SSL / JVM DNS issues.
- `BACKLOG.md` — Deferred Forex work.
- `README.md` — Setup instructions include the bridge build/run step.
