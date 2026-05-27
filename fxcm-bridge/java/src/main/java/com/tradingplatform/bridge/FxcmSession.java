package com.tradingplatform.bridge;

import com.fxcm.api.*;
import com.fxcm.api.commands.*;
import com.fxcm.api.entity.*;
import com.fxcm.api.interfaces.*;
import com.fxcm.api.tradingdata.*;

import java.text.SimpleDateFormat;
import java.util.*;
import java.util.concurrent.*;
import java.util.logging.*;

/**
 * Wraps the FCLite Java session and exposes plain Map/List results
 * that BridgeServer can directly serialize to JSON.
 */
public class FxcmSession {

    private static final Logger LOG = Logger.getLogger("fxcm-bridge");

    private final String user, pass, url, conn;
    private IFXConnectLiteSession session;
    private volatile boolean connected = false;

    // FCLite managers — loaded once after connect
    private IInstrumentsManager  instrumentsMgr;
    private IOffersManager       offersMgr;
    private IOrdersManager       ordersMgr;
    private IOpenPositionsManager positionsMgr;
    private IAccountsManager     accountsMgr;
    private IClosedPositionsManager closedMgr;
    private IPriceHistoryManager historyMgr;

    static final Map<String, int[]> TIMEFRAME_MAP = new LinkedHashMap<>();
    static {
        // {TimeframeUnit ordinal, count}  — we'll use string keys matching FCLite enums
        TIMEFRAME_MAP.put("m1",  new int[]{0, 1});
        TIMEFRAME_MAP.put("m5",  new int[]{0, 5});
        TIMEFRAME_MAP.put("m15", new int[]{0,15});
        TIMEFRAME_MAP.put("m30", new int[]{0,30});
        TIMEFRAME_MAP.put("H1",  new int[]{1, 1});
        TIMEFRAME_MAP.put("H4",  new int[]{1, 4});
        TIMEFRAME_MAP.put("D1",  new int[]{2, 1});
        TIMEFRAME_MAP.put("W1",  new int[]{3, 1});
        // TV resolution strings
        TIMEFRAME_MAP.put("1",   new int[]{0, 1});
        TIMEFRAME_MAP.put("5",   new int[]{0, 5});
        TIMEFRAME_MAP.put("15",  new int[]{0,15});
        TIMEFRAME_MAP.put("30",  new int[]{0,30});
        TIMEFRAME_MAP.put("60",  new int[]{1, 1});
        TIMEFRAME_MAP.put("240", new int[]{1, 4});
        TIMEFRAME_MAP.put("D",   new int[]{2, 1});
        TIMEFRAME_MAP.put("1D",  new int[]{2, 1});
        TIMEFRAME_MAP.put("W",   new int[]{3, 1});
        TIMEFRAME_MAP.put("1W",  new int[]{3, 1});
    }

    FxcmSession(String user, String pass, String url, String conn) {
        this.user = user; this.pass = pass; this.url = url; this.conn = conn;
    }

    boolean isConnected() { return connected; }

    void connect() throws Exception {
        session = FXConnectLiteSessionFactory.create("fxcm-bridge");

        CountDownLatch latch = new CountDownLatch(1);
        final Exception[] loginError = {null};

        session.subscribeConnectionStatusChange(status -> {
            if (status.isConnected()) {
                connected = true;
                latch.countDown();
            } else if (status.isDisconnected() && latch.getCount() > 0) {
                loginError[0] = new RuntimeException("Connection failed");
                latch.countDown();
            }
        });

        session.login(session, user, pass, url, conn, new ILoginCallback() {
            public void onLoginError(String err) {
                loginError[0] = new RuntimeException("Login error: " + err);
                latch.countDown();
            }
            public void onTradingTerminalRequest() {}
        });

        if (!latch.await(30, TimeUnit.SECONDS))
            throw new RuntimeException("Connection timeout");
        if (loginError[0] != null) throw loginError[0];

        // Load managers
        instrumentsMgr = loadManager(session.getInstrumentsManager());
        offersMgr      = loadManager(session.getOffersManager());
        ordersMgr      = loadManager(session.getOrdersManager());
        positionsMgr   = loadManager(session.getOpenPositionsManager());
        accountsMgr    = loadManager(session.getAccountsManager());
        try { closedMgr = loadManager(session.getClosedPositionsManager()); } catch (Exception e) { LOG.warning("closedMgr unavailable: " + e.getMessage()); }
        try { historyMgr = session.getPriceHistoryManager(); } catch (Exception e) { LOG.warning("historyMgr unavailable: " + e.getMessage()); }
    }

    @SuppressWarnings("unchecked")
    private <T extends IDataManager> T loadManager(T mgr) throws Exception {
        if (mgr.getState().isLoaded()) return mgr;
        CountDownLatch latch = new CountDownLatch(1);
        final Exception[] err = {null};
        mgr.subscribeStateChange(state -> {
            if (state.isLoaded())              { mgr.unsubscribeStateChange(null); latch.countDown(); }
            else if (state.hasError())         { err[0] = new RuntimeException(state.getError().toString()); latch.countDown(); }
        });
        mgr.refresh();
        if (!latch.await(30, TimeUnit.SECONDS)) throw new RuntimeException("Manager load timeout: " + mgr.getClass().getSimpleName());
        if (err[0] != null) throw err[0];
        return mgr;
    }

    // ── Data accessors ────────────────────────────────────────────────────────

    Map<String,Object> getAccount() {
        IAccountsInfo[] infos = accountsMgr.getAccountsInfo();
        if (infos == null || infos.length == 0) return Collections.emptyMap();
        IAccount acct = accountsMgr.getAccountById(infos[0].getId());
        Map<String,Object> m = new LinkedHashMap<>();
        m.put("account_id",   safe(() -> acct.getAccountId()));
        m.put("account_name", safe(() -> acct.getAccountName()));
        m.put("balance",      safe(() -> acct.getBalance()));
        m.put("equity",       safe(() -> acct.getEquity()));
        m.put("usedmargin",   safe(() -> acct.getUsedMargin()));
        m.put("usablemargin", safe(() -> acct.getUsableMargin()));
        m.put("day_pl",       safe(() -> acct.getDayPL()));
        m.put("gross_pl",     safe(() -> acct.getGrossPL()));
        return m;
    }

    List<Map<String,Object>> getOffers() {
        List<IOfferInfo> snap = offersMgr.getOffersSnapshot();
        if (snap == null) return Collections.emptyList();
        List<Map<String,Object>> result = new ArrayList<>();
        for (IOfferInfo info : snap) {
            IOffer offer = offersMgr.getOfferById(info.getOfferId());
            if (offer == null) continue;
            Map<String,Object> m = new LinkedHashMap<>();
            m.put("offer_id",   safe(() -> offer.getOfferId()));
            m.put("instrument", safe(() -> offer.getSymbol()));
            m.put("bid",        safe(() -> offer.getBid()));
            m.put("ask",        safe(() -> offer.getAsk()));
            m.put("high",       safe(() -> offer.getHigh()));
            m.put("low",        safe(() -> offer.getLow()));
            m.put("volume",     safe(() -> offer.getVolume()));
            result.add(m);
        }
        return result;
    }

    List<Map<String,Object>> getOpenPositions() {
        List<IOpenPositionInfo> snap = positionsMgr.getOpenPositionsSnapshot();
        if (snap == null) return Collections.emptyList();
        List<Map<String,Object>> result = new ArrayList<>();
        for (IOpenPositionInfo info : snap) {
            IOpenPosition pos = positionsMgr.getOpenPosition(info.getId());
            if (pos == null) continue;
            Map<String,Object> m = new LinkedHashMap<>();
            m.put("trade_id",    safe(() -> pos.getTradeID()));
            m.put("account_id",  safe(() -> pos.getAccountId()));
            m.put("offer_id",    safe(() -> pos.getOfferId()));
            m.put("instrument",  safe(() -> pos.getSymbol()));
            m.put("amount",      safe(() -> pos.getAmount()));
            m.put("buy_sell",    safe(() -> pos.getBuySell()));
            m.put("open",        safe(() -> pos.getOpenRate()));
            m.put("close",       safe(() -> pos.getCloseRate()));
            m.put("pl",          safe(() -> pos.getPL()));
            m.put("gross_pl",    safe(() -> pos.getGrossPL()));
            m.put("used_margin", safe(() -> pos.getUsedMargin()));
            m.put("stop_rate",   safe(() -> pos.getStopRate()));
            m.put("limit_rate",  safe(() -> pos.getLimitRate()));
            result.add(m);
        }
        return result;
    }

    List<Map<String,Object>> getOrders() {
        List<IOrderInfo> snap = ordersMgr.getOrdersSnapshot();
        if (snap == null) return Collections.emptyList();
        List<Map<String,Object>> result = new ArrayList<>();
        for (IOrderInfo info : snap) {
            IOrder order = ordersMgr.getOrderById(info.getOrderId());
            if (order == null) continue;
            Map<String,Object> m = new LinkedHashMap<>();
            m.put("order_id",   safe(() -> order.getOrderId()));
            m.put("account_id", safe(() -> order.getAccountId()));
            m.put("offer_id",   safe(() -> order.getOfferId()));
            m.put("amount",     safe(() -> order.getAmount()));
            m.put("rate",       safe(() -> order.getRate()));
            m.put("type",       safe(() -> order.getType()));
            m.put("status",     safe(() -> order.getStatus()));
            m.put("buy_sell",   safe(() -> order.getBuySell()));
            result.add(m);
        }
        return result;
    }

    List<Map<String,Object>> getClosedPositions() {
        if (closedMgr == null) return Collections.emptyList();
        List<IClosedPositionInfo> snap = closedMgr.getClosedPositionsSnapshot();
        if (snap == null) return Collections.emptyList();
        List<Map<String,Object>> result = new ArrayList<>();
        for (IClosedPositionInfo info : snap) {
            IClosedPosition pos = closedMgr.getClosedPosition(info.getId());
            if (pos == null) continue;
            Map<String,Object> m = new LinkedHashMap<>();
            m.put("trade_id",   safe(() -> pos.getTradeID()));
            m.put("instrument", safe(() -> pos.getSymbol()));
            m.put("amount",     safe(() -> pos.getAmount()));
            m.put("buy_sell",   safe(() -> pos.getBuySell()));
            m.put("open_rate",  safe(() -> pos.getOpenRate()));
            m.put("close_rate", safe(() -> pos.getCloseRate()));
            m.put("pl",         safe(() -> pos.getPL()));
            m.put("gross_pl",   safe(() -> pos.getGrossPL()));
            result.add(m);
        }
        return result;
    }

    List<Map<String,Object>> getInstruments() {
        List<IInstrumentDescriptor> descs = instrumentsMgr.getAllInstrumentDescriptors();
        if (descs == null) return Collections.emptyList();
        List<Map<String,Object>> result = new ArrayList<>();
        for (IInstrumentDescriptor d : descs) {
            Map<String,Object> m = new LinkedHashMap<>();
            m.put("Name",    safe(() -> d.getSymbol()));
            m.put("OfferId", safe(() -> d.getOfferId()));
            m.put("Status",  safe(() -> d.getSubscriptionStatus()));
            result.add(m);
        }
        return result;
    }

    List<Map<String,Object>> getHistory(String instrument, String timeframe, String fromStr, String toStr) throws Exception {
        if (historyMgr == null) throw new RuntimeException("Price history manager unavailable");

        int[] tf = TIMEFRAME_MAP.get(timeframe);
        if (tf == null) throw new IllegalArgumentException("Unknown timeframe: " + timeframe);

        SimpleDateFormat sdf = new SimpleDateFormat("yyyy-MM-dd");
        Date from = fromStr != null ? sdf.parse(fromStr) : new Date(System.currentTimeMillis() - 7L*86400*1000);
        Date to   = toStr   != null ? sdf.parse(toStr)   : new Date();

        ITimeframe fcliteTf = Timeframe.create(TimeframeUnit.values()[tf[0]], tf[1]);

        CountDownLatch latch = new CountDownLatch(1);
        List<Map<String,Object>>[] result = new List[]{Collections.emptyList()};
        final Exception[] err = {null};

        historyMgr.getPrices(instrument, fcliteTf, from, to, -1, new IPriceHistoryManagerCallback() {
            public void onSuccess(IPriceHistoryResponse response) {
                List<Map<String,Object>> bars = new ArrayList<>();
                List<?> prices = response.getPrices();
                if (prices != null) {
                    for (Object raw : prices) {
                        IPriceBar bar = (IPriceBar) raw;
                        Map<String,Object> m = new LinkedHashMap<>();
                        m.put("time",     safe(() -> { Date t = bar.getTime(); return t != null ? new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss").format(t) : null; }));
                        m.put("open",     safe(() -> bar.getBidOpen()));
                        m.put("high",     safe(() -> bar.getBidHigh()));
                        m.put("low",      safe(() -> bar.getBidLow()));
                        m.put("close",    safe(() -> bar.getBidClose()));
                        m.put("ask_open", safe(() -> bar.getAskOpen()));
                        m.put("volume",   safe(() -> bar.getVolume()));
                        bars.add(m);
                    }
                }
                result[0] = bars;
                latch.countDown();
            }
            public void onError(IFXConnectLiteError error) {
                err[0] = new RuntimeException(error.getMessage());
                latch.countDown();
            }
        });

        if (!latch.await(30, TimeUnit.SECONDS)) throw new RuntimeException("History request timeout");
        if (err[0] != null) throw err[0];
        return result[0];
    }

    String placeOrder(String instrument, String buySell, int amount, String orderType,
                      Double rate, Double stop, Double limit) throws Exception {
        IInstrument inst = instrumentsMgr.getInstrumentBySymbol(instrument);
        if (inst == null) throw new IllegalArgumentException("Instrument not found: " + instrument);

        String offerId   = inst.getOfferId();
        String accountId = accountsMgr.getAccountsInfo()[0].getId();

        if ("OM".equals(orderType)) {
            IMarketOrderRequest req = ordersMgr.getRequestFactory()
                .createMarketOrderRequestBuilder()
                .setAccountId(accountId)
                .setOfferId(offerId)
                .setAmount(amount)
                .setBuySell(buySell)
                .setTimeInForce("IOC")
                .build();
            Object id = ordersMgr.createOpenMarketOrder(req);
            return id != null ? id.toString() : "";
        } else {
            IOffer offer = offersMgr.getOfferById(offerId);
            double entryRate = rate != null ? rate
                : ("B".equals(buySell)
                    ? offer.getAsk() + offer.getAsk() / 100.0
                    : offer.getBid() - offer.getBid() / 100.0);

            IEntryOrderRequestBuilder builder = ordersMgr.getRequestFactory()
                .createEntryOrderRequestBuilder()
                .setAccountId(accountId)
                .setOfferId(offerId)
                .setAmount(amount)
                .setBuySell(buySell)
                .setTimeInForce("GTC")
                .setRate(entryRate)
                .setRateRange(10);

            if (stop  != null) builder.setStopRate(stop);
            if (limit != null) builder.setLimitRate(limit);

            Object id = ordersMgr.createEntryOrder(builder.build());
            return id != null ? id.toString() : "";
        }
    }

    void cancelOrder(String orderId) throws Exception {
        IChangeOrderRequestBuilder builder = ordersMgr.getRequestFactory()
            .createChangeOrderRequestBuilder();
        builder.setOrderId(orderId);
        ordersMgr.deleteOrder(builder.build());
    }

    void closePosition(String tradeId, int amount) throws Exception {
        IOpenPosition pos = positionsMgr.getOpenPosition(tradeId);
        int closeAmount = amount > 0 ? amount : (pos != null ? pos.getAmount() : 0);
        ICloseMarketOrderRequest req = ordersMgr.getRequestFactory()
            .createCloseMarketOrderRequestBuilder()
            .setTradeId(tradeId)
            .setAmount(closeAmount)
            .setRateRange(10)
            .setTimeInForce("IOC")
            .build();
        ordersMgr.createCloseMarketOrder(req);
    }

    // ── Utility ───────────────────────────────────────────────────────────────

    @FunctionalInterface interface Supplier<T> { T get() throws Exception; }

    static <T> T safe(Supplier<T> s) {
        try { return s.get(); } catch (Exception e) { return null; }
    }
}
