package com.tradingplatform.bridge;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;

import java.io.*;
import java.net.InetSocketAddress;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.security.SecureRandom;
import java.security.Security;
import java.security.cert.X509Certificate;
import java.util.*;
import java.util.concurrent.*;
import java.util.logging.*;
import javax.net.ssl.*;
import javax.net.ssl.HttpsURLConnection;

/**
 * FCLite bridge — exposes a local HTTP API on port 3001.
 * FastAPI backend calls this; it never talks to FXCM directly.
 *
 * Build:  mvn package   (inside fxcm-bridge/java/)
 * Run:    java -jar target/fxcm-bridge-1.0.0.jar
 */
public class BridgeServer {

    private static final Logger LOG = Logger.getLogger("fxcm-bridge");

    static final String FXCM_USER = env("FXCM_USER", "D161665432");
    static final String FXCM_PASS = env("FXCM_PASS", "Qak5i");
    static final String FXCM_URL  = env("FXCM_URL",  "https://api-demo.fxcm.com");
    static final String FXCM_CONN = env("FXCM_CONN", "Demo");
    // FXCM_BRIDGE_PORT, not PORT — Render (and most PaaS) inject PORT for the
    // public-facing process (uvicorn here), and the bridge must stay local.
    static final int    PORT      = Integer.parseInt(env("FXCM_BRIDGE_PORT", "3001"));
    // Bind host. Default localhost (co-located dev / single-container mode).
    // Set FXCM_BRIDGE_HOST=0.0.0.0 when the bridge runs as its own service so
    // the relay can reach it over Render's private network.
    static final String BIND_HOST = env("FXCM_BRIDGE_HOST", "127.0.0.1");

    static final ObjectMapper JSON = new ObjectMapper();

    // FCLite session — set after successful login
    static volatile FxcmSession session = null;

    static void trustAllSsl() {
        try {
            TrustManager[] tm = new TrustManager[]{new X509TrustManager() {
                public X509Certificate[] getAcceptedIssuers() { return new X509Certificate[0]; }
                public void checkClientTrusted(X509Certificate[] c, String a) {}
                public void checkServerTrusted(X509Certificate[] c, String a) {}
            }};

            // Cover HttpsURLConnection and SSLContext.getDefault() callers.
            SSLContext sc = SSLContext.getInstance("TLS");
            sc.init(null, tm, new SecureRandom());
            SSLContext.setDefault(sc);
            HttpsURLConnection.setDefaultSSLSocketFactory(sc.getSocketFactory());
            HttpsURLConnection.setDefaultHostnameVerifier((h, s) -> true);

            // FCLite internally creates SSLContexts via
            //   SSLContext.getInstance("TLS").init(null, null, null)
            // which resolves TrustManagers from the JSSE TrustManagerFactory
            // (PKIX / SunX509), not from SSLContext.getDefault(). Override
            // both factory algorithms so every new SSLContext also trusts all.
            Security.insertProviderAt(new java.security.Provider(
                    "TrustAllProvider", "1.0", "trust-all for FXCM price servers") {
                { put("TrustManagerFactory.PKIX",    TrustAllTMF.class.getName());
                  put("TrustManagerFactory.SunX509", TrustAllTMF.class.getName()); }
            }, 1);

        } catch (Exception e) { LOG.warning("SSL bypass failed: " + e.getMessage()); }
    }

    /** TrustManagerFactory SPI that trusts every certificate. Registered as
     *  the PKIX and SunX509 provider so FCLite's internal SSLContext.init()
     *  calls resolve to this instead of the JDK's cacerts-backed factory. */
    public static final class TrustAllTMF extends TrustManagerFactorySpi {
        @Override protected void engineInit(KeyStore ks) {}
        @Override protected void engineInit(ManagerFactoryParameters p) {}
        @Override protected TrustManager[] engineGetTrustManagers() {
            return new TrustManager[]{new X509TrustManager() {
                public X509Certificate[] getAcceptedIssuers() { return new X509Certificate[0]; }
                public void checkClientTrusted(X509Certificate[] c, String a) {}
                public void checkServerTrusted(X509Certificate[] c, String a) {}
            }};
        }
    }

    public static void main(String[] args) throws Exception {
        setupLogging();
        trustAllSsl();

        LOG.info("Connecting to FXCM via FCLite...");
        session = new FxcmSession(FXCM_USER, FXCM_PASS, FXCM_URL, FXCM_CONN);
        session.connect();
        session.subscribeBootInstruments();
        LOG.info("FXCM connected — account " + FXCM_USER);

        HttpServer server = HttpServer.create(new InetSocketAddress(BIND_HOST, PORT), 0);
        server.createContext("/health",       ex -> handle(ex, BridgeServer::health));
        server.createContext("/account",      ex -> handle(ex, BridgeServer::account));
        server.createContext("/prices/live",   ex -> handle(ex, BridgeServer::pricesLive));
        server.createContext("/prices",        ex -> handle(ex, BridgeServer::prices));
        server.createContext("/subscribe",    ex -> handle(ex, BridgeServer::subscribe));
        server.createContext("/unsubscribe",  ex -> handle(ex, BridgeServer::unsubscribe));
        server.createContext("/positions",    ex -> handle(ex, BridgeServer::positions));
        server.createContext("/orders",       ex -> handle(ex, BridgeServer::orders));
        server.createContext("/closed_trades",ex -> handle(ex, BridgeServer::closedTrades));
        server.createContext("/instruments",  ex -> handle(ex, BridgeServer::instruments));
        server.createContext("/history",      ex -> handle(ex, BridgeServer::history));
        server.createContext("/order",        ex -> handleOrder(ex));
        server.createContext("/close",        ex -> handle(ex, BridgeServer::closePosition));
        server.createContext("/debug",        ex -> handle(ex, BridgeServer::debug));
        server.setExecutor(Executors.newCachedThreadPool());
        server.start();
        LOG.info("Bridge listening on http://" + BIND_HOST + ":" + PORT);
    }

    // ── Route handlers ────────────────────────────────────────────────────────

    static Object health(HttpExchange ex) {
        Map<String,Object> r = new LinkedHashMap<>();
        r.put("status", session != null && session.isConnected() ? "ok" : "connecting");
        r.put("account", FXCM_USER);
        return r;
    }

    static Object account(HttpExchange ex) throws Exception {
        return session.getAccount();
    }

    static Object prices(HttpExchange ex) throws Exception {
        Map<String,String> q = parseQuery(ex.getRequestURI());
        String instrument  = q.get("instrument");
        String typeFilter  = q.getOrDefault("type","").toLowerCase();
        List<Map<String,Object>> rows = session.getOffers();
        if (instrument != null && !instrument.isEmpty())
            rows.removeIf(r -> !instrument.equals(r.get("instrument")));
        if (!typeFilter.isEmpty() && !typeFilter.equals("forex"))
            rows.clear();
        return rows;
    }

    // Fast in-memory price read for the SSE feed — push-maintained cache,
    // no snapshot round-trip. Scoped to the subscribed (status-T) set.
    static Object pricesLive(HttpExchange ex) {
        return session.getLiveOffers();
    }

    @SuppressWarnings("unchecked")
    static Object subscribe(HttpExchange ex) throws Exception {
        if (!"POST".equals(ex.getRequestMethod()))
            throw new IllegalArgumentException("POST required");
        Map<String,Object> body = JSON.readValue(ex.getRequestBody(), Map.class);
        List<String> offerIds = (List<String>) body.get("offer_ids");
        if (offerIds == null || offerIds.isEmpty())
            throw new IllegalArgumentException("offer_ids list required");
        session.subscribeOfferIds(offerIds);
        return mapOf("status", "ok");
    }

    @SuppressWarnings("unchecked")
    static Object unsubscribe(HttpExchange ex) throws Exception {
        if (!"POST".equals(ex.getRequestMethod()))
            throw new IllegalArgumentException("POST required");
        Map<String,Object> body = JSON.readValue(ex.getRequestBody(), Map.class);
        List<String> offerIds = (List<String>) body.get("offer_ids");
        if (offerIds == null || offerIds.isEmpty())
            return mapOf("unsubscribed", 0);
        session.unsubscribeOfferIds(offerIds);
        return mapOf("unsubscribed", offerIds.size());
    }

    static Object positions(HttpExchange ex) throws Exception {
        return session.getOpenPositions();
    }

    static Object orders(HttpExchange ex) throws Exception {
        return session.getOrders();
    }

    static Object closedTrades(HttpExchange ex) throws Exception {
        return session.getClosedPositions();
    }

    static Object instruments(HttpExchange ex) throws Exception {
        Map<String,String> q = parseQuery(ex.getRequestURI());
        String typeFilter  = q.getOrDefault("type","").toLowerCase();
        boolean tradableOnly = "true".equals(q.get("tradable"));
        List<Map<String,Object>> items = session.getInstruments();
        if (!typeFilter.isEmpty() && !typeFilter.equals("forex")) items.clear();
        if (tradableOnly) {
            Set<Object> tradable = new HashSet<>();
            for (Map<String,Object> o : session.getOffers()) tradable.add(o.get("instrument"));
            items.removeIf(i -> !tradable.contains(i.get("Name")));  // TODO: post-subscribe this reflects subscribed set only
        }
        return items;
    }

    static Object history(HttpExchange ex) throws Exception {
        Map<String,String> q = parseQuery(ex.getRequestURI());
        String instrument = q.getOrDefault("instrument","EUR/USD");
        String timeframe  = q.getOrDefault("timeframe","H1");
        String from       = q.get("from");
        String to         = q.get("to");
        // Bound the request to a recent bar count. Unbounded (-1) over the wide
        // intraday window pulled a liquid major's whole Friday session (m1 ≈
        // 1400+ bars) — heavy enough to blow the read budget so the chart never
        // rendered. FCLite returns the most-recent `count` bars (still spans the
        // weekend back into Friday). Caps m1/m5 without truncating H1/D1/W1.
        int count = 1500;
        try {
            String c = q.get("count");
            if (c != null && !c.isEmpty()) count = Integer.parseInt(c);
        } catch (NumberFormatException ignore) {}
        return session.getHistory(instrument, timeframe, from, to, count);
    }

    static Object closePosition(HttpExchange ex) throws Exception {
        if (!"POST".equals(ex.getRequestMethod()))
            throw new IllegalArgumentException("POST required");
        @SuppressWarnings("unchecked")
        Map<String,Object> body = JSON.readValue(ex.getRequestBody(), Map.class);
        Object tradeId = body.get("trade_id");
        if (tradeId == null) throw new IllegalArgumentException("trade_id required");
        int amount = body.containsKey("amount") ? ((Number)body.get("amount")).intValue() : 0;
        session.closePosition(tradeId.toString(), amount);
        Map<String,Object> r = new LinkedHashMap<>();
        r.put("status","close_submitted");
        r.put("trade_id", tradeId.toString());
        return r;
    }

    static Object debug(HttpExchange ex) throws Exception {
        Map<String,Object> r = new LinkedHashMap<>();
        List<Map<String,Object>> offers    = session.getOffers();
        List<Map<String,Object>> positions = session.getOpenPositions();
        List<Map<String,Object>> orders    = session.getOrders();
        r.put("offers",    debugSection(offers));
        r.put("positions", debugSection(positions));
        r.put("orders",    debugSection(orders));
        return r;
    }

    // Order route handles GET (not used) + POST + DELETE
    static void handleOrder(HttpExchange ex) throws IOException {
        try {
            String method = ex.getRequestMethod();
            if ("POST".equals(method)) {
                @SuppressWarnings("unchecked")
                Map<String,Object> body = JSON.readValue(ex.getRequestBody(), Map.class);
                String instrument = (String) body.get("instrument");
                if (instrument == null || instrument.isEmpty()) {
                    sendJson(ex, 400, mapOf("error","instrument required")); return;
                }
                String buySell   = (String) body.getOrDefault("buy_sell","B");
                int    amount    = ((Number) body.getOrDefault("amount", 1000)).intValue();
                String orderType = (String) body.getOrDefault("order_type","OM");
                Double rate      = body.containsKey("rate")  ? ((Number)body.get("rate")).doubleValue()  : null;
                Double stop      = body.containsKey("stop")  ? ((Number)body.get("stop")).doubleValue()  : null;
                Double limit     = body.containsKey("limit") ? ((Number)body.get("limit")).doubleValue() : null;
                String orderId   = session.placeOrder(instrument, buySell, amount, orderType, rate, stop, limit);
                sendJson(ex, 200, mapOf("status","submitted","order_id", orderId));

            } else if ("DELETE".equals(method)) {
                String path    = ex.getRequestURI().getPath(); // /order/{id}
                String orderId = path.substring(path.lastIndexOf('/') + 1);
                session.cancelOrder(orderId);
                sendJson(ex, 200, mapOf("status","cancelled","order_id", orderId));

            } else if ("PATCH".equals(method)) {
                String path    = ex.getRequestURI().getPath(); // /order/{id}
                String orderId = path.substring(path.lastIndexOf('/') + 1);
                @SuppressWarnings("unchecked")
                Map<String,Object> body = JSON.readValue(ex.getRequestBody(), Map.class);
                double rate  = body.get("rate")  instanceof Number ? ((Number)body.get("rate")).doubleValue()  : 0;
                double stop  = body.get("stop")  instanceof Number ? ((Number)body.get("stop")).doubleValue()  : 0;
                double limit = body.get("limit") instanceof Number ? ((Number)body.get("limit")).doubleValue() : 0;
                session.changeOrder(orderId, rate, stop, limit);
                sendJson(ex, 200, mapOf("status","change_submitted","order_id", orderId));

            } else {
                sendJson(ex, 405, mapOf("error","method not allowed"));
            }
        } catch (Exception e) {
            LOG.log(Level.SEVERE, "order error", e);
            try { sendJson(ex, 500, mapOf("error", e.getMessage())); } catch (Exception ignored) {}
        }
    }

    // ── HTTP helpers ──────────────────────────────────────────────────────────

    @FunctionalInterface interface RouteHandler { Object handle(HttpExchange ex) throws Exception; }

    static void handle(HttpExchange ex, RouteHandler h) throws IOException {
        try {
            Object result = h.handle(ex);
            sendJson(ex, 200, result);
        } catch (IllegalArgumentException e) {
            try { sendJson(ex, 400, mapOf("error", e.getMessage())); } catch (Exception ignored) {}
        } catch (Exception e) {
            LOG.log(Level.SEVERE, ex.getRequestURI().getPath() + " error", e);
            try { sendJson(ex, 500, mapOf("error", e.getMessage())); } catch (Exception ignored) {}
        }
    }

    static void sendJson(HttpExchange ex, int status, Object body) throws IOException {
        byte[] bytes = JSON.writeValueAsBytes(body);
        ex.getResponseHeaders().set("Content-Type","application/json");
        ex.sendResponseHeaders(status, bytes.length);
        try (OutputStream os = ex.getResponseBody()) { os.write(bytes); }
    }

    static Map<String,String> parseQuery(URI uri) {
        Map<String,String> map = new LinkedHashMap<>();
        String query = uri.getQuery();
        if (query == null) return map;
        for (String pair : query.split("&")) {
            int idx = pair.indexOf('=');
            if (idx > 0) map.put(pair.substring(0,idx), pair.substring(idx+1));
        }
        return map;
    }

    static Map<String,Object> mapOf(Object... kv) {
        Map<String,Object> m = new LinkedHashMap<>();
        for (int i = 0; i < kv.length - 1; i += 2) m.put(kv[i].toString(), kv[i+1]);
        return m;
    }

    static Map<String,Object> debugSection(List<Map<String,Object>> rows) {
        Map<String,Object> s = new LinkedHashMap<>();
        s.put("count", rows.size());
        s.put("first", rows.isEmpty() ? Collections.emptyMap() : rows.get(0));
        return s;
    }

    static String env(String key, String def) {
        String v = System.getenv(key);
        return (v != null && !v.isEmpty()) ? v : def;
    }

    static void setupLogging() {
        Logger root = Logger.getLogger("");
        root.setLevel(Level.INFO);
        for (java.util.logging.Handler h : root.getHandlers()) {
            if (h instanceof ConsoleHandler) {
                h.setFormatter(new SimpleFormatter() {
                    @Override public String format(LogRecord r) {
                        return String.format("[%tT] %s %s%n", r.getMillis(), r.getLevel(), r.getMessage());
                    }
                });
            }
        }
    }
}
