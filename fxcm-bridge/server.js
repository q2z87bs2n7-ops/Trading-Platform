/**
 * FCLite bridge — exposes a local HTTP API on port 3001.
 * FastAPI backend calls this; it never talks to FXCM directly.
 *
 * Start: node server.js
 * Requires: npm install (pulls @gehtsoft/forex-connect-lite-node + express)
 */

'use strict';

const express = require('express');

// FCLite Node package (forex-connect-lite-node is the server/Node variant)
let FXConnectLite;
try {
  FXConnectLite = require('@gehtsoft/forex-connect-lite-node');
} catch {
  FXConnectLite = require('@gehtsoft/forex-connect-lite');
}

const { sessionFactory } = FXConnectLite;

// ── Config ────────────────────────────────────────────────────────────────────

const FXCM_USER   = process.env.FXCM_USER   || 'D161665432';
const FXCM_PASS   = process.env.FXCM_PASS   || 'Qak5i';
const FXCM_URL    = process.env.FXCM_URL    || 'https://api-demo.fxcm.com';
const FXCM_CONN   = process.env.FXCM_CONN   || 'Demo';
const PORT        = parseInt(process.env.PORT || '3001', 10);

// ── Timeframe map (TV resolution → FCLite TimeframeUnit + count) ──────────────

const TIMEFRAME_MAP = {
  '1':  { unit: FXConnectLite.TimeframeUnit?.Minute  ?? 'Minute',  count: 1  },
  '5':  { unit: FXConnectLite.TimeframeUnit?.Minute  ?? 'Minute',  count: 5  },
  '15': { unit: FXConnectLite.TimeframeUnit?.Minute  ?? 'Minute',  count: 15 },
  '30': { unit: FXConnectLite.TimeframeUnit?.Minute  ?? 'Minute',  count: 30 },
  '60': { unit: FXConnectLite.TimeframeUnit?.Hour    ?? 'Hour',    count: 1  },
  '240':{ unit: FXConnectLite.TimeframeUnit?.Hour    ?? 'Hour',    count: 4  },
  'D':  { unit: FXConnectLite.TimeframeUnit?.Day     ?? 'Day',     count: 1  },
  '1D': { unit: FXConnectLite.TimeframeUnit?.Day     ?? 'Day',     count: 1  },
  'W':  { unit: FXConnectLite.TimeframeUnit?.Week    ?? 'Week',    count: 1  },
  '1W': { unit: FXConnectLite.TimeframeUnit?.Week    ?? 'Week',    count: 1  },
  // FCLite native strings (bridge.py compat)
  'm1': { unit: FXConnectLite.TimeframeUnit?.Minute  ?? 'Minute',  count: 1  },
  'm5': { unit: FXConnectLite.TimeframeUnit?.Minute  ?? 'Minute',  count: 5  },
  'm15':{ unit: FXConnectLite.TimeframeUnit?.Minute  ?? 'Minute',  count: 15 },
  'm30':{ unit: FXConnectLite.TimeframeUnit?.Minute  ?? 'Minute',  count: 30 },
  'H1': { unit: FXConnectLite.TimeframeUnit?.Hour    ?? 'Hour',    count: 1  },
  'H4': { unit: FXConnectLite.TimeframeUnit?.Hour    ?? 'Hour',    count: 4  },
  'D1': { unit: FXConnectLite.TimeframeUnit?.Day     ?? 'Day',     count: 1  },
  'W1': { unit: FXConnectLite.TimeframeUnit?.Week    ?? 'Week',    count: 1  },
};

// ── Session state ─────────────────────────────────────────────────────────────

let session = null;
let connected = false;

// Wrap manager loading in a promise (waits for state.isLoaded())
function loadManager(manager) {
  return new Promise((resolve, reject) => {
    if (manager.getState && manager.getState().isLoaded()) {
      return resolve(manager);
    }
    const listener = {
      onStateChange(state) {
        if (state.isLoaded()) {
          manager.unsubscribeStateChange(listener);
          resolve(manager);
        } else if (state.hasError && state.hasError()) {
          manager.unsubscribeStateChange(listener);
          reject(new Error(state.getError ? state.getError() : 'Manager load error'));
        }
      },
    };
    manager.subscribeStateChange(listener);
    manager.refresh();
  });
}

async function connect() {
  console.log('Connecting to FXCM via FCLite…');
  session = sessionFactory.create('fxcm-bridge');

  await new Promise((resolve, reject) => {
    let resolved = false;

    const statusListener = {
      onConnectionStatusChange(status) {
        if (status.isConnected() && !resolved) {
          resolved = true;
          connected = true;
          console.log(`FXCM connected — account ${FXCM_USER}`);
          resolve();
        } else if (status.isDisconnected() && !resolved) {
          resolved = true;
          reject(new Error('Connection failed'));
        }
      },
    };

    session.subscribeConnectionStatusChange(statusListener);

    const loginCb = {
      onLoginError(err) {
        if (!resolved) { resolved = true; reject(new Error(err)); }
      },
      onTradingTerminalRequest() {},
    };

    session.login(session, FXCM_USER, FXCM_PASS, FXCM_URL, FXCM_CONN, loginCb);
  });

  // Load core managers in dependency order (per FCLite docs)
  await loadManager(session.getInstrumentsManager());
  await loadManager(session.getOffersManager());
  await loadManager(session.getOrdersManager());
  await loadManager(session.getOpenPositionsManager());
  await loadManager(session.getAccountsManager());

  console.log('All managers loaded — bridge ready');
}

// ── Helper: serialize managers to plain objects ────────────────────────────────

function serializeOffer(offer) {
  try {
    return {
      offer_id:    offer.getOfferId    ? offer.getOfferId()    : null,
      instrument:  offer.getSymbol     ? offer.getSymbol()     : null,
      bid:         offer.getBid        ? offer.getBid()        : null,
      ask:         offer.getAsk        ? offer.getAsk()        : null,
      high:        offer.getHigh       ? offer.getHigh()       : null,
      low:         offer.getLow        ? offer.getLow()        : null,
      volume:      offer.getVolume     ? offer.getVolume()     : null,
    };
  } catch { return {}; }
}

function serializePosition(pos) {
  try {
    return {
      trade_id:   pos.getTradeID      ? pos.getTradeID()      : null,
      account_id: pos.getAccountId    ? pos.getAccountId()    : null,
      offer_id:   pos.getOfferId      ? pos.getOfferId()      : null,
      instrument: pos.getSymbol       ? pos.getSymbol()       : null,
      amount:     pos.getAmount       ? pos.getAmount()       : null,
      buy_sell:   pos.getBuySell      ? pos.getBuySell()      : null,
      open:       pos.getOpenRate     ? pos.getOpenRate()     : null,
      close:      pos.getCloseRate    ? pos.getCloseRate()    : null,
      pl:         pos.getPL           ? pos.getPL()           : null,
      gross_pl:   pos.getGrossPL      ? pos.getGrossPL()      : null,
      used_margin:pos.getUsedMargin   ? pos.getUsedMargin()   : null,
      stop_rate:  pos.getStopRate     ? pos.getStopRate()     : null,
      limit_rate: pos.getLimitRate    ? pos.getLimitRate()    : null,
      open_time:  pos.getOpenTime     ? pos.getOpenTime()     : null,
    };
  } catch { return {}; }
}

function serializeOrder(order) {
  try {
    return {
      order_id:   order.getOrderId    ? order.getOrderId()   : null,
      account_id: order.getAccountId  ? order.getAccountId() : null,
      offer_id:   order.getOfferId    ? order.getOfferId()   : null,
      amount:     order.getAmount     ? order.getAmount()    : null,
      rate:       order.getRate       ? order.getRate()      : null,
      type:       order.getType       ? order.getType()      : null,
      status:     order.getStatus     ? order.getStatus()    : null,
      buy_sell:   order.getBuySell    ? order.getBuySell()   : null,
    };
  } catch { return {}; }
}

function serializeAccount(acct) {
  try {
    return {
      account_id:   acct.getAccountId    ? acct.getAccountId()   : null,
      account_name: acct.getAccountName  ? acct.getAccountName() : null,
      balance:      acct.getBalance      ? acct.getBalance()     : null,
      equity:       acct.getEquity       ? acct.getEquity()      : null,
      usedmargin:   acct.getUsedMargin   ? acct.getUsedMargin()  : null,
      usablemargin: acct.getUsableMargin ? acct.getUsableMargin(): null,
      day_pl:       acct.getDayPL        ? acct.getDayPL()       : null,
      gross_pl:     acct.getGrossPL      ? acct.getGrossPL()     : null,
    };
  } catch { return {}; }
}

// ── Express app ────────────────────────────────────────────────────────────────

const app = express();
app.use(express.json());

function requireConnected(req, res, next) {
  if (!connected || !session) {
    return res.status(503).json({ error: 'Bridge not connected' });
  }
  next();
}

// Health
app.get('/health', (req, res) => {
  res.json({ status: connected ? 'ok' : 'connecting', account: FXCM_USER });
});

// Account
app.get('/account', requireConnected, (req, res) => {
  try {
    const mgr = session.getAccountsManager();
    const infos = mgr.getAccountsInfo();
    if (!infos || infos.length === 0) return res.json({});
    const acct = mgr.getAccountById(infos[0].getId());
    res.json(serializeAccount(acct));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Prices (offers)
app.get('/prices', requireConnected, (req, res) => {
  try {
    const mgr = session.getOffersManager();
    const instrument = req.query.instrument;
    const typeFilter = (req.query.type || '').toLowerCase();

    // getOffersSnapshot is the sync snapshot method
    const snap = mgr.getOffersSnapshot ? mgr.getOffersSnapshot() : [];
    let rows = snap.map(serializeOffer);

    if (instrument) rows = rows.filter(r => r.instrument === instrument);
    // type filter not applicable to raw offers (all are forex), pass through
    if (typeFilter && typeFilter !== 'forex') rows = [];

    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Watchlist — major pairs subset
const DEFAULT_WATCHLIST = [
  'EUR/USD','GBP/USD','USD/JPY','AUD/USD',
  'USD/CAD','USD/CHF','NZD/USD','EUR/GBP',
];

app.get('/watchlist', requireConnected, (req, res) => {
  try {
    const mgr = session.getOffersManager();
    const snap = mgr.getOffersSnapshot ? mgr.getOffersSnapshot() : [];
    const byName = {};
    snap.forEach(o => { const s = serializeOffer(o); byName[s.instrument] = s; });
    const result = DEFAULT_WATCHLIST.filter(s => byName[s]).map(s => byName[s]);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Positions (open trades)
app.get('/positions', requireConnected, (req, res) => {
  try {
    const mgr = session.getOpenPositionsManager();
    const snap = mgr.getOpenPositionsSnapshot ? mgr.getOpenPositionsSnapshot() : [];
    res.json(snap.map(serializePosition));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Orders
app.get('/orders', requireConnected, (req, res) => {
  try {
    const mgr = session.getOrdersManager();
    const snap = mgr.getOrdersSnapshot ? mgr.getOrdersSnapshot() : [];
    res.json(snap.map(serializeOrder));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Closed trades
app.get('/closed_trades', requireConnected, (req, res) => {
  try {
    const mgr = session.getClosedPositionsManager
      ? session.getClosedPositionsManager()
      : null;
    if (!mgr) return res.json([]);
    const snap = mgr.getClosedPositionsSnapshot ? mgr.getClosedPositionsSnapshot() : [];
    res.json(snap.map(p => {
      try {
        return {
          trade_id:   p.getTradeID    ? p.getTradeID()    : null,
          instrument: p.getSymbol     ? p.getSymbol()     : null,
          amount:     p.getAmount     ? p.getAmount()     : null,
          buy_sell:   p.getBuySell    ? p.getBuySell()    : null,
          open_rate:  p.getOpenRate   ? p.getOpenRate()   : null,
          close_rate: p.getCloseRate  ? p.getCloseRate()  : null,
          open_time:  p.getOpenTime   ? p.getOpenTime()   : null,
          close_time: p.getCloseTime  ? p.getCloseTime()  : null,
          pl:         p.getPL         ? p.getPL()         : null,
          gross_pl:   p.getGrossPL    ? p.getGrossPL()    : null,
        };
      } catch { return {}; }
    }));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Instruments
app.get('/instruments', requireConnected, (req, res) => {
  try {
    const mgr = session.getInstrumentsManager();
    const descriptors = mgr.getAllInstrumentDescriptors
      ? mgr.getAllInstrumentDescriptors()
      : [];
    let items = descriptors.map(d => ({
      Name:   d.getSymbol           ? d.getSymbol()           : null,
      OfferId:d.getOfferId          ? d.getOfferId()          : null,
      Status: d.getSubscriptionStatus ? d.getSubscriptionStatus() : null,
    }));

    const typeFilter   = (req.query.type    || '').toLowerCase();
    const tradableOnly = req.query.tradable === 'true';

    // all FCLite instruments are forex/CFD — type filter: only "forex" passes
    if (typeFilter && typeFilter !== 'forex') items = [];

    if (tradableOnly) {
      const mgr2 = session.getOffersManager();
      const snap  = mgr2.getOffersSnapshot ? mgr2.getOffersSnapshot() : [];
      const tradable = new Set(snap.map(o => o.getSymbol ? o.getSymbol() : null));
      items = items.filter(i => tradable.has(i.Name));
    }

    res.json(items);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/instruments/:name(*)', requireConnected, (req, res) => {
  try {
    const name = req.params.name;
    const mgr  = session.getInstrumentsManager();
    const inst  = mgr.getInstrumentBySymbol ? mgr.getInstrumentBySymbol(name) : null;
    if (!inst) return res.status(404).json({ error: `Instrument not found: ${name}` });
    res.json({ Name: name });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Price history
app.get('/history', requireConnected, async (req, res) => {
  const instrument = req.query.instrument || 'EUR/USD';
  const timeframe  = req.query.timeframe  || 'H1';
  const fromStr    = req.query.from;
  const toStr      = req.query.to;

  try {
    const tf = TIMEFRAME_MAP[timeframe];
    if (!tf) return res.status(400).json({ error: `Unknown timeframe: ${timeframe}` });

    const from = fromStr ? new Date(fromStr) : new Date(Date.now() - 7 * 86400000);
    const to   = toStr   ? new Date(toStr)   : new Date();

    const fcliteTf = FXConnectLite.Timeframe
      ? FXConnectLite.Timeframe.create(tf.unit, tf.count)
      : tf;

    const mgr = session.getPriceHistoryManager();

    const bars = await new Promise((resolve, reject) => {
      mgr.getPrices(instrument, fcliteTf, from, to, -1, {
        onSuccess(response) {
          try {
            const result = [];
            const prices = response.getPrices ? response.getPrices() : [];
            prices.forEach(bar => {
              try {
                const ts = bar.getTime ? bar.getTime() : null;
                result.push({
                  time:     ts ? (ts instanceof Date ? ts.toISOString() : ts) : null,
                  open:     bar.getBidOpen  ? bar.getBidOpen()  : null,
                  high:     bar.getBidHigh  ? bar.getBidHigh()  : null,
                  low:      bar.getBidLow   ? bar.getBidLow()   : null,
                  close:    bar.getBidClose ? bar.getBidClose() : null,
                  ask_open: bar.getAskOpen  ? bar.getAskOpen()  : null,
                  volume:   bar.getVolume   ? bar.getVolume()   : null,
                });
              } catch { /* skip bad bar */ }
            });
            resolve(result);
          } catch (e) { reject(e); }
        },
        onError(err) {
          reject(new Error(err.getMessage ? err.getMessage() : String(err)));
        },
      });
    });

    res.json(bars);
  } catch (e) {
    console.error('history error', e.message);
    res.status(500).json({ error: e.message });
  }
});

// Place order (POST)
app.post('/order', requireConnected, async (req, res) => {
  const { instrument, buy_sell = 'B', amount = 1000, order_type = 'OM', rate, stop, limit } = req.body || {};
  if (!instrument) return res.status(400).json({ error: 'instrument required' });

  try {
    const instrMgr = session.getInstrumentsManager();
    const inst     = instrMgr.getInstrumentBySymbol(instrument);
    if (!inst) return res.status(404).json({ error: `Instrument not found: ${instrument}` });

    const offerId    = inst.getOfferId();
    const acctsMgr   = session.getAccountsManager();
    const accountId  = acctsMgr.getAccountsInfo()[0].getId();
    const ordersMgr  = session.getOrdersManager();
    const offersMgr  = session.getOffersManager();
    const offer      = offersMgr.getOfferById(offerId);

    let orderId = null;

    if (order_type === 'OM') {
      // Market order
      const request = ordersMgr.getRequestFactory()
        .createMarketOrderRequestBuilder()
        .setAccountId(accountId)
        .setOfferId(offerId)
        .setAmount(parseInt(amount, 10))
        .setBuySell(buy_sell)
        .setTimeInForce('IOC')
        .build();
      orderId = ordersMgr.createOpenMarketOrder(request);
    } else {
      // Entry order (SE = stop entry, LE = limit entry)
      const entryRate = rate
        ? parseFloat(rate)
        : (buy_sell === 'B'
            ? offer.getAsk() + offer.getAsk() / 100
            : offer.getBid() - offer.getBid() / 100);

      const builder = ordersMgr.getRequestFactory()
        .createEntryOrderRequestBuilder()
        .setAccountId(accountId)
        .setOfferId(offerId)
        .setAmount(parseInt(amount, 10))
        .setBuySell(buy_sell)
        .setTimeInForce('GTC')
        .setRate(entryRate)
        .setRateRange(10);

      if (stop)  builder.setStopRate(parseFloat(stop));
      if (limit) builder.setLimitRate(parseFloat(limit));

      orderId = ordersMgr.createEntryOrder(builder.build());
    }

    res.json({ status: 'submitted', order_id: String(orderId || '') });
  } catch (e) {
    console.error('order error', e.message);
    res.status(500).json({ error: e.message });
  }
});

// Cancel order (DELETE)
app.delete('/order/:orderId', requireConnected, (req, res) => {
  try {
    const mgr   = session.getOrdersManager();
    const order = mgr.getOrderById(req.params.orderId);
    if (!order) return res.status(404).json({ error: 'Order not found' });

    const builder = mgr.getRequestFactory().createChangeOrderRequestBuilder();
    builder.setOrderId(req.params.orderId);
    mgr.deleteOrder(builder.build());

    res.json({ status: 'cancelled', order_id: req.params.orderId });
  } catch (e) {
    console.error('cancel error', e.message);
    res.status(500).json({ error: e.message });
  }
});

// Close position (POST)
app.post('/close', requireConnected, (req, res) => {
  const { trade_id, amount } = req.body || {};
  if (!trade_id) return res.status(400).json({ error: 'trade_id required' });

  try {
    const ordersMgr  = session.getOrdersManager();
    const posMgr     = session.getOpenPositionsManager();
    const pos        = posMgr.getOpenPosition(String(trade_id));
    const closeAmount = amount ? parseInt(amount, 10) : (pos ? pos.getAmount() : 0);

    const request = ordersMgr.getRequestFactory()
      .createCloseMarketOrderRequestBuilder()
      .setTradeId(String(trade_id))
      .setAmount(closeAmount)
      .setRateRange(10)
      .setTimeInForce('IOC')
      .build();

    ordersMgr.createCloseMarketOrder(request);
    res.json({ status: 'close_submitted', trade_id: String(trade_id) });
  } catch (e) {
    console.error('close error', e.message);
    res.status(500).json({ error: e.message });
  }
});

// Debug — dumps snapshot counts for inspection
app.get('/debug', requireConnected, (req, res) => {
  try {
    const offers    = session.getOffersManager().getOffersSnapshot?.()           ?? [];
    const positions = session.getOpenPositionsManager().getOpenPositionsSnapshot?.() ?? [];
    const orders    = session.getOrdersManager().getOrdersSnapshot?.()           ?? [];
    const infos     = session.getAccountsManager().getAccountsInfo?.()           ?? [];
    res.json({
      offers:    { count: offers.length,    first: offers[0]    ? serializeOffer(offers[0])       : {} },
      positions: { count: positions.length, first: positions[0] ? serializePosition(positions[0]) : {} },
      orders:    { count: orders.length,    first: orders[0]    ? serializeOrder(orders[0])       : {} },
      accounts:  { count: infos.length },
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Boot ───────────────────────────────────────────────────────────────────────

connect()
  .then(() => {
    app.listen(PORT, '127.0.0.1', () => {
      console.log(`FXCM bridge listening on http://127.0.0.1:${PORT}`);
    });
  })
  .catch(err => {
    console.error('Failed to connect:', err.message);
    process.exit(1);
  });
