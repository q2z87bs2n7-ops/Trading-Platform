"""
FXCM ForexConnect bridge — exposes a local HTTP API on port 3001.
FastAPI backend calls this; it never talks to FXCM directly.
"""

import datetime
import threading
import logging
import urllib.request
import json as _json

from flask import Flask, jsonify, request
from forexconnect import ForexConnect

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("fxcm-bridge")

FXCM_USER = "D161665432"
FXCM_PASS = "Qak5i"
FXCM_URL  = "www.fxcorporate.com/Hosts.jsp"
FXCM_ENV  = "Demo"
PORT      = 3001

app = Flask(__name__)

# ── Instrument cache ──────────────────────────────────────────────────────────

INSTRUMENTS_URL   = "https://endpoints.fxcorporate.com/symbol/data?type=alt&platform=mobile&locale=enu"
REFRESH_INTERVAL  = 86400  # 24 h in seconds

# Default watchlist shown on the Forex Discover page — major pairs
DEFAULT_WATCHLIST = [
    "EUR/USD", "GBP/USD", "USD/JPY", "AUD/USD",
    "USD/CAD", "USD/CHF", "NZD/USD", "EUR/GBP",
]

_instruments: dict = {}          # Name -> full metadata dict
_instruments_lock  = threading.Lock()
_refresh_timer     = None


def _load_instruments():
    """Fetch instrument metadata from the FXCM public endpoint and cache it."""
    global _instruments, _refresh_timer
    try:
        ctx = __import__("ssl").create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = __import__("ssl").CERT_NONE
        with urllib.request.urlopen(INSTRUMENTS_URL, context=ctx, timeout=15) as resp:
            data = _json.loads(resp.read().decode())

        # response is {"Version": "...", "Symbols": [...]}
        symbols = data.get("Symbols", data) if isinstance(data, dict) else data
        by_name = {item["Name"]: item for item in symbols if "Name" in item}
        with _instruments_lock:
            _instruments = by_name
        log.info("Instrument cache loaded — %d instruments", len(by_name))
    except Exception:
        log.exception("Failed to load instrument cache (will retry at next interval)")

    # schedule next refresh
    _refresh_timer = threading.Timer(REFRESH_INTERVAL, _load_instruments)
    _refresh_timer.daemon = True
    _refresh_timer.start()


# ── Session state ─────────────────────────────────────────────────────────────

_fc: ForexConnect = None
_lock = threading.Lock()


def _row_to_dict(row) -> dict:
    cols = row.columns
    n = cols.size
    out = {}
    for i in range(n):
        col = cols.get(i)
        val = row.get_cell(i)
        if isinstance(val, datetime.datetime):
            val = val.isoformat() if val.year > 1900 else None
        out[col.id] = val
    return out


def _read_table(table_type) -> list:
    rows = []
    try:
        reader = _fc.get_table_reader(table_type)
        if reader is None:
            return rows
        for row in reader:
            rows.append(_row_to_dict(row))
    except TypeError:
        pass  # empty table iterates as None
    return rows


# ── Routes ────────────────────────────────────────────────────────────────────

@app.route("/health")
def health():
    return jsonify({"status": "ok", "account": FXCM_USER})


@app.route("/account")
def account():
    with _lock:
        rows = _read_table(_fc.ACCOUNTS)
    return jsonify(rows[0] if rows else {})


@app.route("/prices")
def prices():
    with _lock:
        rows = _read_table(_fc.OFFERS)

    # merge instrument metadata into each price row
    with _instruments_lock:
        for row in rows:
            meta = _instruments.get(row.get("instrument"), {})
            if meta:
                row["display_name"]  = meta.get("DisplayName")
                row["type"]          = meta.get("Type")
                row["currency"]      = meta.get("Currency")
                row["session"]       = meta.get("Session")
                row["timezone"]      = meta.get("Timezone")
                row["unit"]          = meta.get("UnderlyingUnit")
                row["amount_mode"]   = meta.get("AmountMode")
                row["alternatives"]  = meta.get("Alternatives", [])
                row["description"]   = meta.get("Description")

    # filter by instrument name
    instrument = request.args.get("instrument")
    if instrument:
        rows = [r for r in rows if r.get("instrument") == instrument]

    # filter by type (e.g. ?type=forex)
    type_filter = request.args.get("type", "").lower()
    if type_filter:
        rows = [r for r in rows if r.get("type", "").lower() == type_filter]

    return jsonify(rows)


@app.route("/positions")
def positions():
    with _lock:
        trades = _read_table(_fc.TRADES)
        offers = _read_table(_fc.OFFERS)
    # TRADES rows only carry offer_id; join to OFFERS so the frontend gets instrument names
    offer_map = {str(o.get("offer_id", "")): o.get("instrument", "") for o in offers}
    for trade in trades:
        oid = str(trade.get("offer_id", ""))
        if oid in offer_map:
            trade["instrument"] = offer_map[oid]
    return jsonify(trades)


@app.route("/orders")
def orders():
    with _lock:
        rows = _read_table(_fc.ORDERS)
    return jsonify(rows)


@app.route("/debug")
def debug_tables():
    """Returns the first row of each table so column names can be inspected."""
    with _lock:
        result = {}
        for name, table_type in [("OFFERS", _fc.OFFERS), ("TRADES", _fc.TRADES),
                                  ("ACCOUNTS", _fc.ACCOUNTS), ("ORDERS", _fc.ORDERS)]:
            rows = _read_table(table_type)
            result[name] = {"count": len(rows), "keys": list(rows[0].keys()) if rows else [], "first": rows[0] if rows else {}}
    return jsonify(result)


@app.route("/summary")
def summary():
    with _lock:
        rows = _read_table(_fc.SUMMARY)
    return jsonify(rows)


@app.route("/closed_trades")
def closed_trades():
    with _lock:
        rows = _read_table(_fc.CLOSED_TRADES)
    return jsonify(rows)


@app.route("/watchlist")
def watchlist():
    """
    Returns enriched price rows for the default major-pairs watchlist.
    The list is fixed for now; user-customisable watchlists come later.
    """
    with _lock:
        rows = _read_table(_fc.OFFERS)

    with _instruments_lock:
        for row in rows:
            meta = _instruments.get(row.get("instrument"), {})
            if meta:
                row["display_name"] = meta.get("DisplayName")
                row["type"]         = meta.get("Type")
                row["currency"]     = meta.get("Currency")
                row["session"]      = meta.get("Session")
                row["timezone"]     = meta.get("Timezone")
                row["unit"]         = meta.get("UnderlyingUnit")
                row["amount_mode"]  = meta.get("AmountMode")
                row["alternatives"] = meta.get("Alternatives", [])
                row["description"]  = meta.get("Description")

    # filter to watchlist symbols, preserve order
    by_name = {r["instrument"]: r for r in rows}
    result  = [by_name[sym] for sym in DEFAULT_WATCHLIST if sym in by_name]
    return jsonify(result)


@app.route("/instruments")
def instruments():
    """
    Returns all cached instrument metadata.
    Optional ?type=forex|stock|index|commodity|fund|bond|spot to filter.
    Optional ?tradable=true to restrict to instruments currently in the offers table.
    """
    type_filter     = request.args.get("type", "").lower()
    tradable_only   = request.args.get("tradable", "").lower() == "true"

    with _instruments_lock:
        items = list(_instruments.values())

    if type_filter:
        items = [i for i in items if i.get("Type", "").lower() == type_filter]

    if tradable_only:
        with _lock:
            tradable = {r.get("instrument") for r in _read_table(_fc.OFFERS)}
        items = [i for i in items if i.get("Name") in tradable]

    return jsonify(items)


@app.route("/instruments/<path:name>")
def instrument_detail(name):
    """Single instrument lookup by Name (e.g. EUR/USD, SPX500, NGAS)."""
    with _instruments_lock:
        item = _instruments.get(name)
    if item is None:
        return jsonify({"error": f"Instrument not found: {name}"}), 404
    return jsonify(item)


@app.route("/history")
def history():
    """
    ?instrument=EUR/USD&timeframe=m1&from=2026-05-20&to=2026-05-27
    Timeframes: t1 m1 m5 m15 m30 H1 H4 D1 W1 M1
    """
    instrument = request.args.get("instrument", "EUR/USD")
    timeframe  = request.args.get("timeframe", "H1")
    date_from  = request.args.get("from")
    date_to    = request.args.get("to")

    try:
        dt_from = datetime.datetime.strptime(date_from, "%Y-%m-%d") if date_from else datetime.datetime.utcnow() - datetime.timedelta(days=7)
        dt_to   = datetime.datetime.strptime(date_to,   "%Y-%m-%d") if date_to   else datetime.datetime.utcnow()

        with _lock:
            # timeframe must be passed as a plain string e.g. "H1"
            history = _fc.get_history(instrument, timeframe, dt_from, dt_to)

        bars = []
        if history is not None:
            # returns a numpy structured array with fields:
            # Date, BidOpen, BidHigh, BidLow, BidClose,
            # AskOpen, AskHigh, AskLow, AskClose, Volume
            for row in history:
                ts = row['Date'].astype('datetime64[s]').astype(datetime.datetime)
                bars.append({
                    "time":     ts.isoformat(),
                    "open":     float(row['BidOpen']),
                    "high":     float(row['BidHigh']),
                    "low":      float(row['BidLow']),
                    "close":    float(row['BidClose']),
                    "ask_open": float(row['AskOpen']),
                    "volume":   int(row['Volume']),
                })
        return jsonify(bars)

    except Exception as e:
        log.exception("history error")
        return jsonify({"error": str(e)}), 500


@app.route("/order", methods=["POST"])
def place_order():
    """
    POST JSON: { instrument, buy_sell, amount, order_type?, rate?, stop?, limit? }
    buy_sell: "B" or "S"
    order_type: "OM" (market) | "SE" (stop entry) | "LE" (limit entry) — default "OM"
    """
    body = request.get_json(force=True)
    instrument  = body.get("instrument")
    buy_sell    = body.get("buy_sell", "B")       # "B" or "S"
    amount      = int(body.get("amount", 1000))
    order_type  = body.get("order_type", "OM")    # OM = market
    rate        = body.get("rate", 0)
    stop        = body.get("stop", 0)
    limit       = body.get("limit", 0)

    if not instrument:
        return jsonify({"error": "instrument required"}), 400

    try:
        with _lock:
            # Use _read_table so column key names are consistent with the rest of the bridge
            offers = _read_table(_fc.OFFERS)
            offer_row = next((o for o in offers if o.get("instrument") == instrument), None)
            if offer_row is None:
                return jsonify({"error": f"Instrument not found: {instrument}"}), 404
            offer_id = offer_row.get("offer_id")

            # Get account_id
            acct_rows = _read_table(_fc.ACCOUNTS)
            account_id = str(acct_rows[0]["account_id"]) if acct_rows else None

            request_factory = _fc.create_order_request(
                order_type  = order_type,
                offer_id    = offer_id,
                account_id  = account_id,
                buy_sell    = buy_sell,
                amount      = amount,
                rate        = rate,
                stop        = stop,
                limit       = limit,
                order_id    = "",
            )
            resp = _fc.send_request(request_factory)

        return jsonify({"status": "submitted", "order_id": str(resp) if resp else ""})

    except Exception as e:
        log.exception("order error")
        return jsonify({"error": str(e)}), 500


@app.route("/order/<order_id>", methods=["DELETE"])
def cancel_order(order_id):
    try:
        with _lock:
            req = _fc.create_request({"command": "DeleteOrder", "orderId": order_id})
            _fc.send_request(req)
        return jsonify({"status": "cancelled", "order_id": order_id})
    except Exception as e:
        log.exception("cancel error")
        return jsonify({"error": str(e)}), 500


@app.route("/close", methods=["POST"])
def close_position():
    """
    POST JSON: { trade_id, amount? }
    """
    body     = request.get_json(force=True)
    trade_id = body.get("trade_id")
    amount   = int(body.get("amount", 0))

    if not trade_id:
        return jsonify({"error": "trade_id required"}), 400

    try:
        with _lock:
            req = _fc.create_order_request(
                order_type = "CM",   # close market
                offer_id   = "",
                account_id = "",
                buy_sell   = "",
                amount     = amount,
                rate       = 0,
                stop       = 0,
                limit      = 0,
                order_id   = "",
                trade_id   = trade_id,
            )
            _fc.send_request(req)
        return jsonify({"status": "close_submitted", "trade_id": trade_id})
    except Exception as e:
        log.exception("close error")
        return jsonify({"error": str(e)}), 500


# ── Entry point ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    # Load instrument metadata (non-blocking — first request may return empty
    # if the fetch is slow, subsequent ones will be warm)
    t = threading.Thread(target=_load_instruments, daemon=True)
    t.start()

    log.info("Connecting to FXCM...")
    _fc = ForexConnect()
    _fc.__enter__()
    _fc.login(FXCM_USER, FXCM_PASS, FXCM_URL, FXCM_ENV)
    log.info("FXCM connected — account %s", FXCM_USER)

    try:
        app.run(host="127.0.0.1", port=PORT, threaded=True)
    finally:
        _fc.logout()
        _fc.__exit__(None, None, None)
        log.info("FXCM disconnected")
