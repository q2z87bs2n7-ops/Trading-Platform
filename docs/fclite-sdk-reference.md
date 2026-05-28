# FCLite SDK Reference

Extracted and cleaned from the FCLite API documentation and User Operating Guide
(internal FXCM documents, not publicly available online). The practical
implementation patterns are in `docs/fxcm.md`; this file covers the full API
surface for reference when extending the bridge.

**Note:** FCLite's official docs show TypeScript/JavaScript examples. The Java
interfaces follow identical naming conventions with standard getter method
signatures (`getXxx()`). Java examples were marked "in progress" in the original
docs — the Java patterns in `docs/fxcm.md` were discovered by decompiling the
JAR with `javap`.

---

## Session Lifecycle

### Connection status values

`IConnectionStatus` has four mutually-exclusive boolean methods:

| Method | Meaning |
|---|---|
| `isConnected()` | Session fully authenticated and ready |
| `isConnecting()` | Login in progress |
| `isReconnecting()` | Lost connection, attempting automatic recovery |
| `isDisconnected()` | Not connected (can check `hasError()` for cause) |

### Login methods

**Method 1 — username/password (what we use):**
```
session.login(user, password, tradingSystemUrl, connectionName, ILoginCallback)
```

**Method 2 — JWT token (OAuth):**
```
session.attach(jwt, tradingSystemUrl, connectionName)
```

**Logout:**
```
session.logout()
```

---

## Manager Loading

### Manager dependency order

Some managers require others to be loaded first or their data will be empty/incorrect.
Load in this order:

| Manager | Must load first |
|---|---|
| `IInstrumentsManager` | *(none)* |
| `IClientMessagesManager` | *(none)* |
| `ILeverageProfilesManager` | IInstrumentsManager |
| `IClosedPositionsManager` | IInstrumentsManager |
| `IRolloverProfilesManager` | IInstrumentsManager |
| `IAccountCommissionsManager` | IInstrumentsManager |
| `IOffersManager` | IInstrumentsManager |
| `IPriceHistoryManager` | IInstrumentsManager |
| `IOrdersManager` | IOffersManager |
| `IOpenPositionsManager` | IAccountCommissionsManager, IRolloverProfilesManager, IInstrumentsManager, ILeverageProfilesManager |
| `IAccountsManager` | IOpenPositionsManager |
| `IPositionsSummaryManager` | IOpenPositionsManager |

In practice for the bridge we load: `IInstrumentsManager` → `IOffersManager` →
`IOrdersManager` → `IOpenPositionsManager` → accounts via `getAccountsSnapshot`.

### Standard load pattern (subscribeStateChange + refresh)

All managers implementing `IDataManager` use this pattern:

```typescript
// TypeScript reference — see docs/fxcm.md for Java CountDownLatch equivalent
const loadManager = (manager: IDataManager): Promise<IDataManager> => {
    return new Promise((resolve, reject) => {
        const listener: IDataManagerStateChangeListener = {
            onStateChange: state => {
                if (state.isLoaded()) {
                    manager.unsubscribeStateChange(listener);
                    resolve(manager);
                } else if (state.hasError()) {
                    manager.unsubscribeStateChange(listener);
                    reject(state.getError());
                }
            },
        };
        manager.subscribeStateChange(listener);
        manager.refresh();
    });
};
```

`IAccountsManager` is the exception — it does not implement `IDataManager`.
Use `getAccountsSnapshot(IGetAccountsSnapshotCallback)` instead.

---

## Order Types and Codes

### Order type strings

| Code | Meaning |
|---|---|
| `"OM"` | Open market order (execute immediately) |
| `"LE"` | Limit entry (pending buy-below / sell-above) |
| `"SE"` | Stop entry (pending buy-above / sell-below) |
| `"CM"` | Close market order |
| `"L"` | Limit attached to a position (take-profit) |
| `"S"` | Stop attached to a position (stop-loss) |

### Time-in-force values

| Code | Meaning |
|---|---|
| `"IOC"` | Immediate-or-cancel |
| `"GTC"` | Good-till-cancelled |
| `"GFD"` | Good-for-day |

---

## Order Operations

### Place a market order (full builder pattern)

```typescript
// Get required IDs first
let instrument = instrumentsManager.getInstrumentBySymbol("EUR/USD");
let offerId = instrument.getOfferId();
let account = accountsManager.getAccountById(accountsManager.getAccountsInfo()[0].getId());

// Build and send
let request = manager.getRequestFactory()
    .createMarketOrderRequestBuilder()
    .setAccountId(account.getAccountId())
    .setAmount(amount)           // integer units
    .setOfferId(offerId)
    .setBuySell("B")             // "B" or "S"
    .setTimeInForce("IOC")
    .build();

manager.createOpenMarketOrder(request);
```

### Place an entry (pending) order

```typescript
let request = manager.getRequestFactory()
    .createEntryOrderRequestBuilder()
    .setAccountId(accountId)
    .setAmount(amount)
    .setOfferId(offerId)
    .setBuySell("B")
    .setTimeInForce("GTC")
    .setCustomId("my-order-id")   // optional reference string
    .setRate(entryRate)           // the trigger price
    .setRateRange(10)             // slippage tolerance in pips
    .setLimitRate(takeProfitRate) // 0 = none
    .setStopRate(stopLossRate)    // 0 = none
    .enableTrailingStop(TrailingStopType.Fixed, 10) // optional
    .build();

manager.createEntryOrder(request);
```

### Attach stop-loss to an open position

```typescript
let builder = manager.getRequestFactory().createStopOrderRequestBuilder();
builder.setTradeId(openPosition.getTradeID());
// builder.setOrderId(orderId);  // use setOrderId to attach to an entry order instead
builder.setRate(openPosition.getOpenRate() - openPosition.getOpenRate() / 100);
manager.createStopOrder(builder.build());
```

### Attach take-profit (limit) to an open position

```typescript
let builder = manager.getRequestFactory().createLimitOrderRequestBuilder();
builder.setTradeId(openPosition.getTradeID());
builder.setRate(openPosition.getOpenRate() + openPosition.getOpenRate() / 100);
manager.createLimitOrder(builder.build());
```

**When to use `setTradeId` vs `setOrderId`:** Use `setTradeId` to attach to an
open position. Use `setOrderId` to attach to a pending entry order.

### Modify an existing order

```typescript
const builder = ordersManager.getRequestFactory().createChangeOrderRequestBuilder();
builder.setOrderId(orderId);
builder.setAmount(10000);
builder.setRate(1.5214);
builder.setRateRange(0.0014);
builder.setTrailingType(TrailingStopType.Fixed);
builder.setTrailingStep(10);
ordersManager.changeOrder(builder.build());
```

### Close all positions

```typescript
let requestBuilder = ordersManager.getRequestFactory()
    .createCloseAllPositionsRequestBuilder();

requestBuilder
    .setCustomId("CloseAll#1")
    .setAcctId(accountId)
    .setTimeInForce("GTC")
    .setSymbol("EUR/USD")  // optional — omit to close all instruments
    .setSide("B");          // optional — "B" or "S", omit to close both sides

ordersManager.closeAllPositions(requestBuilder.build());
```

---

## Real-Time Price Updates

Subscribe to `IOffersManager` for push-based price ticks instead of polling:

```typescript
offersManager.subscribeOfferChange({
    onChange(offerInfo: OfferInfo): void {
        let offer = offersManager.getOfferById(offerInfo.getOfferId());
        // offer.getBid(), offer.getAsk(), offer.getHigh(), offer.getLow()
    },
    onAdd(offerInfo: OfferInfo): void {
        // new instrument offered
    }
});
offersManager.subscribeStateChange(stateChangeListener);
offersManager.refresh();
```

This is the correct approach for real-time forex prices — more efficient than
the 3s polling currently used in the bridge.

---

## Instrument Subscriptions

An instrument must be subscribed before full data is available. Instrument
descriptors exist for all instruments, but `getInstrumentBySymbol` returns null
for unsubscribed instruments.

```typescript
// Get all descriptors (subscribed and unsubscribed)
let descriptors = instrumentsManager.getAllInstrumentDescriptors();
// descriptor.getOfferId(), .getSymbol(), .getSubscriptionStatus(), .getPriceStreamId()

// Get only subscribed
let subscribed = instrumentsManager.getSubscribedInstruments(); // array of symbols

// Subscribe
instrumentsManager.subscribeInstruments(["EUR/USD", "GBP/USD"], {
    onSuccess() { /* ready */ },
    onError(error: string) { /* handle */ }
});

// Unsubscribe
instrumentsManager.unsubscribeInstruments(["EUR/USD"], callbackObject);
```

---

## Price History

### Callback-based pattern (alternative to the indexed response we use)

```typescript
let manager = session.getPriceHistoryManager();
let timeframe = Timeframe.create(TimeframeUnit.Minute, 30);  // M30

manager.getPrices(instrument, timeframe, from, to, -1, {
    onSuccess(response: IPriceHistoryResponse) {
        for (let i = 0; i < response.getCount(); i++) {
            // response.getBidOpen(i), getBidHigh(i), getBidLow(i), getBidClose(i)
            // response.getAskOpen(i), getAskHigh(i), getAskLow(i), getAskClose(i)
            // response.getVolume(i), getDate(i)
        }
    },
    onError(error: IFXConnectLiteError) {
        console.log(error.getMessage());
    }
});
```

### Check if instrument has ask price history

```typescript
let hasAsk = manager.hasAskPrice("EUR/USD"); // boolean
```

Not all instruments store ask-side history — only bid is guaranteed.

### Timeframe reference

| String | TimeframeUnit | Count | Description |
|--------|--------------|-------|-------------|
| `t1` | Tick | 1 | Every tick |
| `m1` | Minute | 1 | 1-minute bars |
| `m5` | Minute | 5 | 5-minute bars |
| `m15` | Minute | 15 | 15-minute bars |
| `m30` | Minute | 30 | 30-minute bars |
| `H1` | Hour | 1 | 1-hour bars |
| `H4` | Hour | 4 | 4-hour bars |
| `D1` | Day | 1 | Daily bars |
| `W1` | Week | 1 | Weekly bars |
| `M1` | Month | 1 | Monthly bars |

---

## Full Field Reference

### Account fields

All available getters on an `Account` object:

```
getAccountId()              // "1654031"
getAccountName()            // "01654031"
getAccountKind()            // account type string
getBaseCurrency()           // "USD"
getBaseCurrencyPrecision()  // decimal places
getATPId()
getBalance()                // float
getBaseUnitSize()
getDayPL()                  // float, today's P/L
getEquity()                 // float
getGrossPL()                // float, total unrealized P/L
getLastMarginCallDate()
getLeverageProfileId()
getM2MEquity()
getMaintenanceFlag()
getMaintenanceType()
getManagerAccountId()
getMarginCallFlag()
getNonTradeEquity()
getOrderAmountLimit()
getUsableMaintenanceMargin()
getUsableMaintenanceMarginPercentage()
getUsableMargin()           // free margin (usable)
getUsableMarginPercentage()
getUsedMaintenanceMargin()
getUsedMargin()             // used margin
getRefreshProfileFlags()    // Set<String> — triggers manager refreshes (see below)
```

### Account refresh profile flags

When `account.getRefreshProfileFlags()` returns non-empty, refresh the indicated managers:

| Flag(s) | Manager to refresh |
|---|---|
| `A`, `a`, `B`, `b`, `P` | `getAccountCommissionsManager()` |
| `L`, `l`, `M`, `m` | `getLeverageProfilesManager()` |
| `R`, `r`, `Y` | `getRolloverProfilesManager()` |
| `X` | Both `AccountCommissionsManager` and `LeverageProfilesManager` |

### OpenPosition fields

```
getTradeID()               // trade ID string
getAccountId()
getAccountName()
getAccountKind()
getOfferId()               // offer/instrument ID
getAmount()                // units
getBuySell()               // "B" or "S"
getOpenRate()              // entry price
getOpenTime()              // Date
getOpenQuoteId()
getOpenOrderId()
getOpenOrderReqId()
getOpenOrderRequestTXT()
getCommission()
getRolloverInterest()
getTradeIdOrigin()
getValueDate()
getParties()
getPL()                    // unrealized P/L in account currency
getPLPips()                // unrealized P/L in pips
getGrossPL()               // gross P/L
getCloseRate()             // current market close rate
getStopRate()              // stop-loss rate (0 = none)
getLimitRate()             // take-profit rate (0 = none)
getStopOrderID()           // ID of attached stop order
getLimitOrderID()          // ID of attached limit order
getUsedMargin()
getDividends()
```

### ClosedPosition fields

```
getTradeID()
getAccountId()
getAccountName()
getAccountKind()
getOfferId()
getAmount()
getBuySell()
getOpenRate()
getOpenTime()
getOpenQuoteId()
getOpenOrderId()
getOpenOrderReqId()
getOpenOrderRequestTXT()
getCloseRate()
getCloseTime()
getCloseQuoteId()
getCloseOrderId()
getCloseOrderReqId()
getCloseOrderRequestTXT()
getCommission()
getRolloverInterest()
getTradeIdOrigin()
getValueDate()
getCloseOrderParties()
getPL()
getNetPL()                 // net P/L after commission/rollover
getPLPips()
getGrossPL()
```

### Order fields

```
getOrderId()
getAccountId()
getOfferId()
getAmount()
getRate()                  // trigger/entry rate
getType()                  // "OM", "LE", "SE", "L", "S", etc.
getStatus()                // "W" waiting, "P" pending, "E" executed, "C" cancelled
getBuySell()               // "B" or "S"
getTradeId()               // non-null if attached to an open position
```

---

## Change Listeners

All listeners follow the same `onAdd` / `onChange` / `onDelete` / `onRefresh` pattern.

### IOrderChangeListener

```java
void onAdd(OrderInfo info)     // new order placed (capture ID here for market orders)
void onChange(OrderInfo info)  // order modified or status changed
void onDelete(OrderInfo info)  // order cancelled or executed
void onError(OrderInfo info)   // order rejected (info.getError().getMessage())
```

Subscribe: `ordersMgr.subscribeOrderChange(listener)`
Unsubscribe: `ordersMgr.unsubscribeOrderChange(listener)`

### IOpenPositionChangeListener

```java
void onAdd(OpenPositionInfo info)     // new position opened
void onChange(OpenPositionInfo info)  // position updated (price tick, stop/limit change)
void onDelete(OpenPositionInfo info)  // position closed
void onRefresh()                      // full snapshot refreshed
```

Subscribe: `openPositionsMgr.subscribeOpenPositionChange(listener)`

### IClosedPositionChangeListener

```java
void onAdd(ClosedPositionInfo info)     // trade closed
void onChange(ClosedPositionInfo info)  // closed trade record updated
void onRefresh()                        // snapshot refreshed
```

Subscribe: `closedMgr.subscribeClosedPositionChange(listener)`

### IAccountChangeListener

```java
void onAdd(AccountInfo info)
void onChange(AccountInfo info)   // balance/equity/margin updated
void onDelete(AccountInfo info)
void onRefresh()
```

Subscribe: `session.getAccountsManager().subscribeAccountChange(listener)`

### IOfferChangeListener

```java
void onAdd(OfferInfo info)       // new instrument available
void onChange(OfferInfo info)    // price tick (bid/ask updated)
```

Subscribe: `offersMgr.subscribeOfferChange(listener)`
Access current data: `offersMgr.getOfferById(offerInfo.getOfferId())`

---

## Reports

Generate a URL to an account statement PDF/HTML/CSV:

```typescript
session.getSystemSettingsProvider().getReportUrl(
    accountInfo,
    fromDate,     // new Date(0) = "since account open"
    toDate,       // new Date(0) = "until now"
    ReportType.CUSTOMER_ACCOUNT_STATEMENT,  // or CUSTOMER_TRADE_ACTIVITY, CUSTOMER_TRADE_SUMMARY
    ReportFormat.HTML,  // or PDF, CSV
    "enu",        // language code
    {
        onSuccess(url: string) { /* open in browser */ },
        onError(error: string) { /* handle */ }
    }
);
```

The returned URL includes a short-lived token and can be opened directly in a browser.

---

## Table Types Reference

| Table | Description | Key fields |
|---|---|---|
| Accounts | Trading accounts | AccountID, Balance, Equity, UsedMargin |
| Offers | Available instruments + live prices | Instrument, Bid, Ask, High, Low |
| Orders | Active/pending orders | OrderID, Type, Status, Rate, Amount |
| Trades | Open positions | TradeID, OpenRate, Amount, PL, GrossPL |
| ClosedTrades | Trade history | CloseTime, GrossPL, Commission |
| Summary | Exposure by instrument | Instrument, SellAmount, BuyAmount, NetPL |
| Messages | System notifications | MessageID, Text, Time, Type |

---

## Additional Managers

These exist on the session but are not currently used in the bridge:

| Manager | Purpose |
|---|---|
| `getAccountCommissionsManager()` | Commission schedules per instrument |
| `getLeverageProfilesManager()` | Leverage ratios |
| `getRolloverProfilesManager()` | Overnight rollover/swap rates |
| `getPositionsSummaryManager()` | Aggregated exposure by instrument |
| `getClientMessagesManager()` | FXCM system messages/notifications |
| `getSystemSettingsProvider()` | Report generation, system settings |

---

## Official Resources

- SDK docs (internal): `https://docs.gehtsoftusa.com/fclite/`
- GitHub: `https://github.com/FXCMAPI/FCLite`
- Support email: `api@fxcm.com`
