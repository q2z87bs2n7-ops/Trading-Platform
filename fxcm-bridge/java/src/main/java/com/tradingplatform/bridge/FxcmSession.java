package com.tradingplatform.bridge;

import com.fxcm.api.*;
import com.fxcm.api.entity.accounts.*;
import com.fxcm.api.entity.closedpositions.*;
import com.fxcm.api.entity.instrument.*;
import com.fxcm.api.entity.login.*;
import com.fxcm.api.entity.messages.data.terminals.*;
import com.fxcm.api.entity.offer.*;
import com.fxcm.api.entity.openpositions.*;
import com.fxcm.api.entity.order.*;
import com.fxcm.api.entity.order.request.changeorder.*;
import com.fxcm.api.entity.order.request.closemarketorder.*;
import com.fxcm.api.entity.order.request.entry.*;
import com.fxcm.api.entity.order.request.marketorder.*;
import com.fxcm.api.entity.pricehistory.*;
import com.fxcm.api.interfaces.connection.*;
import com.fxcm.api.interfaces.errors.*;
import com.fxcm.api.interfaces.login.*;
import com.fxcm.api.interfaces.tradingdata.*;
import com.fxcm.api.interfaces.tradingdata.accounts.*;
import com.fxcm.api.interfaces.tradingdata.closedpositions.*;
import com.fxcm.api.interfaces.tradingdata.instruments.*;
import com.fxcm.api.interfaces.tradingdata.offers.*;
import com.fxcm.api.interfaces.tradingdata.openpositions.*;
import com.fxcm.api.interfaces.tradingdata.orders.*;
import com.fxcm.api.interfaces.tradingdata.pricehistory.*;

import java.text.SimpleDateFormat;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.locks.*;
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

    private IInstrumentsManager    instrumentsMgr;
    private IOffersManager         offersMgr;
    private IOrdersManager         ordersMgr;
    private IOpenPositionsManager  positionsMgr;
    private IAccountsManager       accountsMgr;
    private IClosedPositionsManager closedMgr;
    private IPriceHistoryManager   historyMgr;

    // Populated once via getAccountsSnapshot callback
    private volatile Account[] loadedAccounts = null;

    // Offer IDs we've subscribed to (positions + orders + watchlist at boot)
    private final Set<String> subscribedOfferIds = Collections.newSetFromMap(new java.util.concurrent.ConcurrentHashMap<>());

    // Serializes getLatestOffersSnapshot calls — FCLite's internal price
    // session handling is not safe for concurrent snapshot requests.
    private final ReentrantLock snapshotLock = new ReentrantLock();

    static final Map<String, int[]> TIMEFRAME_MAP = new LinkedHashMap<>();
    static {
        // {TimeframeUnit constant, count}
        TIMEFRAME_MAP.put("m1",  new int[]{TimeframeUnit.Minute, 1});
        TIMEFRAME_MAP.put("m5",  new int[]{TimeframeUnit.Minute, 5});
        TIMEFRAME_MAP.put("m15", new int[]{TimeframeUnit.Minute, 15});
        TIMEFRAME_MAP.put("m30", new int[]{TimeframeUnit.Minute, 30});
        TIMEFRAME_MAP.put("H1",  new int[]{TimeframeUnit.Hour,   1});
        TIMEFRAME_MAP.put("H4",  new int[]{TimeframeUnit.Hour,   4});
        TIMEFRAME_MAP.put("D1",  new int[]{TimeframeUnit.Day,    1});
        TIMEFRAME_MAP.put("W1",  new int[]{TimeframeUnit.Week,   1});
        // TradingView resolution strings
        TIMEFRAME_MAP.put("1",   new int[]{TimeframeUnit.Minute, 1});
        TIMEFRAME_MAP.put("5",   new int[]{TimeframeUnit.Minute, 5});
        TIMEFRAME_MAP.put("15",  new int[]{TimeframeUnit.Minute, 15});
        TIMEFRAME_MAP.put("30",  new int[]{TimeframeUnit.Minute, 30});
        TIMEFRAME_MAP.put("60",  new int[]{TimeframeUnit.Hour,   1});
        TIMEFRAME_MAP.put("240", new int[]{TimeframeUnit.Hour,   4});
        TIMEFRAME_MAP.put("D",   new int[]{TimeframeUnit.Day,    1});
        TIMEFRAME_MAP.put("1D",  new int[]{TimeframeUnit.Day,    1});
        TIMEFRAME_MAP.put("W",   new int[]{TimeframeUnit.Week,   1});
        TIMEFRAME_MAP.put("1W",  new int[]{TimeframeUnit.Week,   1});
    }

    FxcmSession(String user, String pass, String url, String conn) {
        this.user = user; this.pass = pass; this.url = url; this.conn = conn;
    }

    boolean isConnected() { return connected; }

    void connect() throws Exception {
        session = FXConnectLiteSessionFactory.create("fxcm-bridge");

        CountDownLatch connLatch = new CountDownLatch(1);
        final Exception[] loginError = {null};

        session.subscribeConnectionStatusChange(status -> {
            if (status.isConnected()) {
                connected = true;
                connLatch.countDown();
            } else if (status.isDisconnected() && connLatch.getCount() > 0) {
                loginError[0] = new RuntimeException("Connection failed: " +
                    (status.hasError() ? status.getError().getMessage() : "disconnected"));
                connLatch.countDown();
            }
        });

        session.login(user, pass, url, conn, new ILoginCallback() {
            public void onLoginError(LoginError err) {
                loginError[0] = new RuntimeException("Login error: " + err.getMessage());
                connLatch.countDown();
            }
            public void onTradingTerminalRequest(ITradingTerminalSelector selector, ITradingTerminal[] terminals) {
                if (terminals != null && terminals.length > 0) selector.selectTerminal(terminals[0]);
            }
            public void onPinCodeRequest(IPinCodeSetter setter) {}
        });

        if (!connLatch.await(30, TimeUnit.SECONDS))
            throw new RuntimeException("Connection timeout");
        if (loginError[0] != null) throw loginError[0];

        // Load data managers
        instrumentsMgr = loadDataManager(session.getInstrumentsManager());
        offersMgr      = session.getOffersManager();   // no bulk refresh — subscribe selectively via subscribeBootInstruments()
        ordersMgr      = loadDataManager(session.getOrdersManager());
        positionsMgr   = loadDataManager(session.getOpenPositionsManager());

        // Accounts load via async snapshot
        accountsMgr = session.getAccountsManager();
        CountDownLatch acctLatch = new CountDownLatch(1);
        accountsMgr.getAccountsSnapshot(accts -> { loadedAccounts = accts; acctLatch.countDown(); });
        if (!acctLatch.await(10, TimeUnit.SECONDS)) LOG.warning("Accounts snapshot timeout");

        try { closedMgr  = loadDataManager(session.getClosedPositionsManager()); }
        catch (Exception e) { LOG.warning("closedMgr unavailable: " + e.getMessage()); }
        try { historyMgr = session.getPriceHistoryManager(); }
        catch (Exception e) { LOG.warning("historyMgr unavailable: " + e.getMessage()); }
    }

    // ── Selective subscription ─────────────────────────────────────────────────

    // Called at bridge boot — subscribes open positions + open orders only.
    // Watchlist symbols are pushed later by FastAPI via POST /subscribe.
    void subscribeBootInstruments() throws Exception {
        Set<String> ids = new HashSet<>();
        OpenPosition[] positions = positionsMgr.getOpenPositionsSnapshot();
        if (positions != null) for (OpenPosition p : positions) if (p != null) ids.add(p.getOfferId());
        Order[] orders = ordersMgr.getOrdersSnapshot();
        if (orders != null) for (Order o : orders) if (o != null) ids.add(o.getOfferId());

        subscribedOfferIds.addAll(ids);
        LOG.info("Boot subscribe: " + ids.size() + " instruments (open positions + orders)");
        if (!ids.isEmpty()) {
            fetchOfferSnapshot(ids.toArray(new String[0]));
            List<String> syms = idsToSymbols(ids);
            if (!syms.isEmpty()) subscribeSymbols(syms.toArray(new String[0]));
        }
    }

    // Called by POST /subscribe — adds offer IDs, warms price cache, and sets status T.
    // Accepts string offer IDs to avoid the getInstrumentBySymbol chicken-and-egg:
    // unsubscribed instruments can't be found by symbol lookup.
    // Idempotent: safe to call when watchlist changes.
    void subscribeOfferIds(List<String> offerIds) throws Exception {
        Set<String> newIds = new HashSet<>(offerIds);
        newIds.removeAll(subscribedOfferIds);
        if (newIds.isEmpty()) return;
        subscribedOfferIds.addAll(newIds);
        fetchOfferSnapshot(newIds.toArray(new String[0]));
        List<String> syms = idsToSymbols(newIds);
        if (!syms.isEmpty()) subscribeSymbols(syms.toArray(new String[0]));
        LOG.info("Subscribed " + newIds.size() + " new offer IDs (total: " + subscribedOfferIds.size() + ")");
    }

    // Called by POST /unsubscribe — sets status back to D.
    // Skips any offer ID that still has an open position or order (always T).
    void unsubscribeOfferIds(List<String> offerIds) throws Exception {
        Set<String> protect = new HashSet<>();
        OpenPosition[] positions = positionsMgr.getOpenPositionsSnapshot();
        if (positions != null) for (OpenPosition p : positions) if (p != null) protect.add(p.getOfferId());
        Order[] orders = ordersMgr.getOrdersSnapshot();
        if (orders != null) for (Order o : orders) if (o != null) protect.add(o.getOfferId());

        Set<String> toRemove = new HashSet<>(offerIds);
        toRemove.removeAll(protect);
        toRemove.retainAll(subscribedOfferIds);
        if (toRemove.isEmpty()) return;

        subscribedOfferIds.removeAll(toRemove);
        List<String> syms = idsToSymbols(toRemove);
        if (!syms.isEmpty()) unsubscribeSymbols(syms.toArray(new String[0]));
        LOG.info("Unsubscribed " + syms.size() + " instruments: " + syms);
    }

    private List<String> idsToSymbols(Set<String> offerIds) {
        List<String> syms = new ArrayList<>();
        for (String id : offerIds) {
            InstrumentDescriptor d = instrumentsMgr.getInstrumentDescriptorByOfferId(id);
            if (d != null && d.getSymbol() != null) syms.add(d.getSymbol());
        }
        return syms;
    }

    private void subscribeSymbols(String[] symbols) throws Exception {
        CountDownLatch latch = new CountDownLatch(1);
        instrumentsMgr.subscribeInstruments(symbols, new ISubscribeInstrumentsCallback() {
            public void onSuccess() { latch.countDown(); }
            public void onError(String msg, String[] failed) {
                LOG.warning("subscribeInstruments error: " + msg + " failed=" + Arrays.toString(failed));
                latch.countDown();
            }
        });
        if (!latch.await(10, TimeUnit.SECONDS)) LOG.warning("subscribeInstruments timeout");
    }

    private void unsubscribeSymbols(String[] symbols) throws Exception {
        CountDownLatch latch = new CountDownLatch(1);
        instrumentsMgr.unsubscribeInstruments(symbols, new ISubscribeInstrumentsCallback() {
            public void onSuccess() { latch.countDown(); }
            public void onError(String msg, String[] failed) {
                LOG.warning("unsubscribeInstruments error: " + msg + " failed=" + Arrays.toString(failed));
                latch.countDown();
            }
        });
        if (!latch.await(10, TimeUnit.SECONDS)) LOG.warning("unsubscribeInstruments timeout");
    }

    private Offer[] fetchOfferSnapshot(String[] offerIds) throws Exception {
        if (offerIds.length == 0) return new Offer[0];
        snapshotLock.lock();
        try {
            CountDownLatch latch = new CountDownLatch(1);
            Offer[][] result = {new Offer[0]};
            offersMgr.getLatestOffersSnapshot(offerIds, new com.fxcm.api.interfaces.tradingdata.offers.IOffersSnapshotCallback() {
                public void onSuccess(Offer[] offers) { result[0] = offers != null ? offers : new Offer[0]; latch.countDown(); }
                public void onError(com.fxcm.api.interfaces.errors.IFXConnectLiteError e) {
                    LOG.warning("Offer snapshot error: " + e.getMessage()); latch.countDown();
                }
            });
            if (!latch.await(3, TimeUnit.SECONDS)) LOG.warning("Offer snapshot timeout");
            return result[0];
        } finally {
            snapshotLock.unlock();
        }
    }

    private <T extends IDataManager> T loadDataManager(T mgr) throws Exception {
        if (mgr.getState().isLoaded()) return mgr;
        CountDownLatch latch = new CountDownLatch(1);
        final Exception[] err = {null};
        IDataManagerStateChangeListener listener = state -> {
            if (state.isLoaded())  latch.countDown();
            else if (state.hasError()) { err[0] = new RuntimeException(state.getError().getMessage()); latch.countDown(); }
        };
        mgr.subscribeStateChange(listener);
        mgr.refresh();
        if (!latch.await(30, TimeUnit.SECONDS)) throw new RuntimeException("Manager load timeout");
        mgr.unsubscribeStateChange(listener);
        if (err[0] != null) throw err[0];
        return mgr;
    }

    // ── Data accessors ────────────────────────────────────────────────────────

    Map<String,Object> getAccount() {
        Account acct = firstAccount();
        if (acct == null) return Collections.emptyMap();
        Map<String,Object> m = new LinkedHashMap<>();
        m.put("account_id",   safe(acct::getAccountId));
        m.put("account_name", safe(acct::getAccountName));
        m.put("balance",      safe(acct::getBalance));
        m.put("equity",       safe(acct::getEquity));
        m.put("usedmargin",   safe(acct::getUsedMargin));
        m.put("usablemargin", safe(acct::getUsableMargin));
        m.put("day_pl",       safe(acct::getDayPL));
        m.put("gross_pl",     safe(acct::getGrossPL));
        return m;
    }

    private Account firstAccount() {
        AccountInfo[] infos = accountsMgr.getAccountsInfo();
        if (infos != null && infos.length > 0) {
            Account a = accountsMgr.getAccountById(infos[0].getId());
            if (a != null) return a;
        }
        return (loadedAccounts != null && loadedAccounts.length > 0) ? loadedAccounts[0] : null;
    }

    private String firstAccountId() {
        AccountInfo[] infos = accountsMgr.getAccountsInfo();
        if (infos != null && infos.length > 0) return infos[0].getId();
        if (loadedAccounts != null && loadedAccounts.length > 0) return loadedAccounts[0].getAccountId();
        throw new RuntimeException("No account available");
    }

    List<Map<String,Object>> getOffers() throws Exception {
        if (subscribedOfferIds.isEmpty()) return Collections.emptyList();
        Offer[] offers = fetchOfferSnapshot(subscribedOfferIds.toArray(new String[0]));
        List<Map<String,Object>> result = new ArrayList<>();
        for (Offer offer : offers) {
            if (offer == null) continue;
            String id = offer.getOfferId();
            Instrument inst = safe(() -> instrumentsMgr.getInstrumentByOfferId(id));
            Map<String,Object> m = new LinkedHashMap<>();
            m.put("offer_id",   id);
            m.put("instrument", inst != null ? inst.getSymbol() : null);
            m.put("bid",        safe(offer::getBid));
            m.put("ask",        safe(offer::getAsk));
            m.put("high",       safe(offer::getHigh));
            m.put("low",        safe(offer::getLow));
            m.put("volume",     safe(offer::getVolume));
            if (inst != null) {
                m.put("digits",     safe(inst::getDigits));
                m.put("point_size", safe(inst::getPointSize));
            }
            result.add(m);
        }
        return result;
    }

    List<Map<String,Object>> getOpenPositions() throws Exception {
        OpenPosition[] snap = positionsMgr.getOpenPositionsSnapshot();
        if (snap == null) return Collections.emptyList();

        // Fetch live prices for just the instruments in open positions.
        Set<String> posOfferIds = new HashSet<>();
        for (OpenPosition p : snap) if (p != null) posOfferIds.add(p.getOfferId());
        Map<String,Offer> offerMap = new HashMap<>();
        if (!posOfferIds.isEmpty()) {
            Offer[] offers = fetchOfferSnapshot(posOfferIds.toArray(new String[0]));
            for (Offer o : offers) if (o != null) offerMap.put(o.getOfferId(), o);
        }

        List<Map<String,Object>> result = new ArrayList<>();
        SimpleDateFormat iso = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss");
        for (OpenPosition pos : snap) {
            if (pos == null) continue;
            Map<String,Object> m = new LinkedHashMap<>();
            m.put("trade_id",    safe(pos::getTradeID));
            m.put("account_id",  safe(pos::getAccountId));
            m.put("offer_id",    safe(pos::getOfferId));
            m.put("instrument",  safe(() -> { Instrument inst = instrumentsMgr.getInstrumentByOfferId(pos.getOfferId()); return inst != null ? inst.getSymbol() : null; }));
            m.put("amount",      safe(pos::getAmount));
            m.put("buy_sell",    safe(pos::getBuySell));
            m.put("open",        safe(pos::getOpenRate));
            m.put("close",       safe(pos::getCloseRate));
            m.put("pl",          safe(pos::getPL));
            m.put("gross_pl",    safe(pos::getGrossPL));
            m.put("used_margin", safe(pos::getUsedMargin));
            m.put("stop_rate",   safe(pos::getStopRate));
            m.put("limit_rate",  safe(pos::getLimitRate));
            // Live bid/ask/mid from the position-specific snapshot.
            Offer offer = offerMap.get(pos.getOfferId());
            Double bid = offer != null ? safe(offer::getBid) : null;
            Double ask = offer != null ? safe(offer::getAsk) : null;
            m.put("bid", bid);
            m.put("ask", ask);
            Double mid = (bid != null && ask != null) ? (bid + ask) / 2.0 : null;
            m.put("mid", mid);
            // live_pl: snapshot pl is stale at fetch — bridge can't compute account-ccy
            // perfectly without leverage/conversion lookups, so surface gross_pl as a
            // recomputed-from-mid approximation when possible, else fall back to gross.
            m.put("live_pl", safe(pos::getGrossPL));
            // Instrument metadata (digits = price precision for pip rendering).
            m.put("digits", safe(() -> {
                Instrument inst = instrumentsMgr.getInstrumentByOfferId(pos.getOfferId());
                return inst != null ? (Integer) inst.getClass().getMethod("getDigits").invoke(inst) : null;
            }));
            m.put("open_time", safe(() -> {
                Object t = pos.getClass().getMethod("getOpenTime").invoke(pos);
                return (t instanceof Date) ? iso.format((Date) t) : null;
            }));
            result.add(m);
        }
        return result;
    }

    List<Map<String,Object>> getOrders() {
        Order[] snap = ordersMgr.getOrdersSnapshot();
        if (snap == null) return Collections.emptyList();
        List<Map<String,Object>> result = new ArrayList<>();
        SimpleDateFormat iso = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss");
        for (Order order : snap) {
            if (order == null) continue;
            Map<String,Object> m = new LinkedHashMap<>();
            m.put("order_id",   safe(order::getOrderId));
            m.put("account_id", safe(order::getAccountId));
            m.put("offer_id",   safe(order::getOfferId));
            m.put("instrument", safe(() -> { Instrument inst = instrumentsMgr.getInstrumentByOfferId(order.getOfferId()); return inst != null ? inst.getSymbol() : null; }));
            m.put("amount",     safe(order::getAmount));
            m.put("rate",       safe(order::getRate));
            m.put("type",       safe(order::getType));
            m.put("status",     safe(order::getStatus));
            m.put("buy_sell",   safe(order::getBuySell));
            // Attached SL/TP — the entry-order builder collects these at placement.
            m.put("stop",  safe(() -> (Double) order.getClass().getMethod("getStop").invoke(order)));
            m.put("limit", safe(() -> (Double) order.getClass().getMethod("getLimit").invoke(order)));
            m.put("digits", safe(() -> {
                Instrument inst = instrumentsMgr.getInstrumentByOfferId(order.getOfferId());
                return inst != null ? (Integer) inst.getClass().getMethod("getDigits").invoke(inst) : null;
            }));
            m.put("created_time", safe(() -> {
                Object t = order.getClass().getMethod("getRequestTime").invoke(order);
                return (t instanceof Date) ? iso.format((Date) t) : null;
            }));
            result.add(m);
        }
        return result;
    }

    List<Map<String,Object>> getClosedPositions() {
        if (closedMgr == null) return Collections.emptyList();
        ClosedPosition[] snap = closedMgr.getClosedPositionsSnapshot();
        if (snap == null) return Collections.emptyList();
        List<Map<String,Object>> result = new ArrayList<>();
        SimpleDateFormat iso = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss");
        for (ClosedPosition pos : snap) {
            if (pos == null) continue;
            Map<String,Object> m = new LinkedHashMap<>();
            m.put("trade_id",   safe(pos::getTradeID));
            m.put("instrument", safe(() -> { Instrument inst = instrumentsMgr.getInstrumentByOfferId(pos.getOfferId()); return inst != null ? inst.getSymbol() : null; }));
            m.put("amount",     safe(pos::getAmount));
            m.put("buy_sell",   safe(pos::getBuySell));
            m.put("open_rate",  safe(pos::getOpenRate));
            m.put("close_rate", safe(pos::getCloseRate));
            m.put("pl",         safe(pos::getPL));
            m.put("gross_pl",   safe(pos::getGrossPL));
            Date open  = safe(pos::getOpenTime);
            Date close = safe(pos::getCloseTime);
            if (open  != null) m.put("open_time",  iso.format(open));
            if (close != null) m.put("close_time", iso.format(close));
            result.add(m);
        }
        return result;
    }

    List<Map<String,Object>> getInstruments() {
        InstrumentDescriptor[] descs = instrumentsMgr.getAllInstrumentDescriptors();
        if (descs == null) return Collections.emptyList();
        List<Map<String,Object>> result = new ArrayList<>();
        for (InstrumentDescriptor d : descs) {
            Map<String,Object> m = new LinkedHashMap<>();
            m.put("Name",    safe(d::getSymbol));
            m.put("OfferId", safe(d::getOfferId));
            m.put("Status",  safe(d::getSubscriptionStatus));
            Instrument inst = safe(() -> instrumentsMgr.getInstrumentByOfferId(d.getOfferId()));
            if (inst != null) {
                m.put("Digits",              safe(inst::getDigits));
                m.put("PointSize",           safe(inst::getPointSize));
                m.put("FractionalPipSize",   safe(inst::getFractionalPipSize));
                m.put("ContractCurrency",    safe(inst::getContractCurrency));
                m.put("ContractMultiplier",  safe(inst::getContractMultiplier));
                m.put("InstrumentType",      safe(inst::getInstrumentType));
                m.put("TradingStatus",       safe(inst::getTradingStatus));
                m.put("MinQuantity",         safe(inst::getMinQuantity));
                m.put("MaxQuantity",         safe(inst::getMaxQuantity));
                m.put("BaseUnitSize",        safe(inst::getBaseUnitSize));
                m.put("BuyInterest",         safe(inst::getBuyInterest));
                m.put("SellInterest",        safe(inst::getSellInterest));
                m.put("ConditionDistStop",   safe(inst::getConditionDistStop));
                m.put("ConditionDistLimit",  safe(inst::getConditionDistLimit));
            }
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

        Timeframe fcliteTf = Timeframe.create(tf[0], tf[1]);

        CountDownLatch latch = new CountDownLatch(1);
        List<Map<String,Object>>[] result = new List[]{Collections.emptyList()};
        final Exception[] err = {null};

        historyMgr.getPrices(instrument, fcliteTf, from, to, -1, new IPriceHistoryManagerCallback() {
            public void onSuccess(IPriceHistoryResponse response) {
                List<Map<String,Object>> bars = new ArrayList<>();
                int count = response.getCount();
                SimpleDateFormat fmt = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss");
                for (int i = 0; i < count; i++) {
                    final int idx = i;
                    Map<String,Object> m = new LinkedHashMap<>();
                    m.put("time",     safe(() -> { Date t = response.getDate(idx); return t != null ? fmt.format(t) : null; }));
                    m.put("open",     safe(() -> response.getBidOpen(idx)));
                    m.put("high",     safe(() -> response.getBidHigh(idx)));
                    m.put("low",      safe(() -> response.getBidLow(idx)));
                    m.put("close",    safe(() -> response.getBidClose(idx)));
                    m.put("ask_open", safe(() -> response.getAskOpen(idx)));
                    m.put("volume",   safe(() -> response.getVolume(idx)));
                    bars.add(m);
                }
                result[0] = bars;
                latch.countDown();
            }
            public void onError(IFXConnectLiteError error) {
                err[0] = new RuntimeException(error.getMessage());
                latch.countDown();
            }
            public void onCancel() { latch.countDown(); }
        });

        if (!latch.await(30, TimeUnit.SECONDS)) throw new RuntimeException("History request timeout");
        if (err[0] != null) throw err[0];
        return result[0];
    }

    String placeOrder(String instrument, String buySell, int amount, String orderType,
                      Double rate, Double stop, Double limit) throws Exception {
        Instrument inst = instrumentsMgr.getInstrumentBySymbol(instrument);
        if (inst == null) throw new IllegalArgumentException("Instrument not found: " + instrument);

        String offerId   = inst.getOfferId();
        String accountId = firstAccountId();

        CountDownLatch orderLatch = new CountDownLatch(1);
        final String[] capturedId = {""};
        IOrderChangeListener listener = new IOrderChangeListener() {
            public void onChange(OrderInfo o) {}
            public void onAdd(OrderInfo o) {
                String id = (o.getTradeId() != null && !o.getTradeId().isEmpty())
                    ? o.getTradeId() : o.getOrderId();
                if (id != null) capturedId[0] = id;
                orderLatch.countDown();
            }
            public void onDelete(OrderInfo o) {}
            public void onError(OrderInfo o)  { orderLatch.countDown(); }
        };
        ordersMgr.subscribeOrderChange(listener);

        try {
            if ("OM".equals(orderType)) {
                MarketOrderRequestBuilder req = ordersMgr.getRequestFactory()
                    .createMarketOrderRequestBuilder()
                    .setAccountId(accountId)
                    .setOfferId(offerId)
                    .setAmount(amount)
                    .setBuySell(buySell)
                    .setTimeInForce("IOC")
                    .setRateRange(10);
                if (stop  != null) req.setStopRate(stop);
                if (limit != null) req.setLimitRate(limit);
                ordersMgr.createOpenMarketOrder(req.build());
            } else {
                Offer[] snap = fetchOfferSnapshot(new String[]{offerId});
                Offer offer = snap.length > 0 ? snap[0] : null;
                double entryRate = rate != null ? rate
                    : (offer == null ? 0.0
                        : "B".equals(buySell)
                            ? offer.getAsk() + offer.getAsk() / 100.0
                            : offer.getBid() - offer.getBid() / 100.0);

                EntryOrderRequestBuilder builder = ordersMgr.getRequestFactory()
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
                ordersMgr.createEntryOrder(builder.build());
            }
            orderLatch.await(10, TimeUnit.SECONDS);
        } finally {
            ordersMgr.unsubscribeOrderChange(listener);
        }
        return capturedId[0];
    }

    void cancelOrder(String orderId) {
        ordersMgr.removeOrder(orderId);
    }

    // Modify a pending entry order's rate / SL / TP. Pass 0 to leave a field unchanged.
    // FCLite 1.3.3 setter names aren't stable across builds, so we drive the builder
    // reflectively and trust the imported request-changeorder package to satisfy linking.
    void changeOrder(String orderId, double newRate, double newStop, double newLimit) throws Exception {
        Object factory = ordersMgr.getRequestFactory();
        Object builder = factory.getClass().getMethod("createChangeOrderRequestBuilder").invoke(factory);
        builder.getClass().getMethod("setOrderId", String.class).invoke(builder, orderId);
        if (newRate  != 0) builder.getClass().getMethod("setRate",      double.class).invoke(builder, newRate);
        if (newStop  != 0) builder.getClass().getMethod("setStopRate",  double.class).invoke(builder, newStop);
        if (newLimit != 0) builder.getClass().getMethod("setLimitRate", double.class).invoke(builder, newLimit);
        Object req = builder.getClass().getMethod("build").invoke(builder);

        CountDownLatch latch = new CountDownLatch(1);
        IOrderChangeListener listener = new IOrderChangeListener() {
            public void onChange(OrderInfo o) {
                if (orderId.equals(safe(o::getOrderId))) latch.countDown();
            }
            public void onAdd(OrderInfo o) {}
            public void onDelete(OrderInfo o) {}
            public void onError(OrderInfo o) {
                if (orderId.equals(safe(o::getOrderId))) latch.countDown();
            }
        };
        ordersMgr.subscribeOrderChange(listener);
        try {
            java.lang.reflect.Method change = null;
            for (java.lang.reflect.Method mth : ordersMgr.getClass().getMethods()) {
                if ("changeOrder".equals(mth.getName()) && mth.getParameterCount() == 1) { change = mth; break; }
            }
            if (change == null) throw new RuntimeException("ordersMgr.changeOrder not found");
            change.invoke(ordersMgr, req);
            latch.await(10, TimeUnit.SECONDS);
        } finally {
            ordersMgr.unsubscribeOrderChange(listener);
        }
    }

    void closePosition(String tradeId, int amount) throws Exception {
        OpenPosition pos = positionsMgr.getOpenPosition(tradeId);
        int closeAmount = amount > 0 ? amount : (pos != null ? pos.getAmount() : 0);
        CloseMarketOrderRequestBuilder req = ordersMgr.getRequestFactory()
            .createCloseMarketOrderRequestBuilder()
            .setTradeId(tradeId)
            .setRateRange(10)
            .setTimeInForce("IOC");
        if (closeAmount > 0) req.setAmount(closeAmount);
        ordersMgr.createCloseMarketOrder(req.build());
    }

    // ── Utility ───────────────────────────────────────────────────────────────

    @FunctionalInterface interface Supplier<T> { T get() throws Exception; }

    static <T> T safe(Supplier<T> s) {
        try { return s.get(); } catch (Exception e) { return null; }
    }
}
