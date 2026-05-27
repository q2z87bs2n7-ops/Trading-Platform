# FXCM ForexConnect Integration

Comprehensive reference for the FXCM forex silo POC. Read before touching the
bridge, the backend proxy, or the frontend Forex Discover page. This doc is
intentionally long so another agent can pick up cold.

## Overview

The platform supports three trading silos:

| Silo | Data source | Runtime |
|------|-------------|---------|
| Stocks | Alpaca REST + WebSocket | Vercel + Render |
| Crypto | Alpaca REST + WebSocket | Vercel + Render |
| **Forex** | **FXCM ForexConnect SDK** | **Local sidecar only** |

The Forex silo is a **POC** running against a hardcoded FXCM demo account. It
is **local-only** — the bridge runs on the developer's machine; it is not
deployed to Vercel or Render. The frontend handles the bridge being offline
gracefully (shows an offline notice instead of crashing).

## Architecture

```
Browser
  ↓  /api/fxcm/*  (FastAPI proxy)
backend/app/fxcm.py
  ↓  http://127.0.0.1:3001  (httpx async, TIMEOUT=10s)
fxcm-bridge/bridge.py  (Flask + ForexConnect, Python 3.7)
  ↓  ForexConnect SDK
FXCM demo server  (www.fxcorporate.com)
```

### Why the sidecar?

`forexconnect` is a C++ native extension. The only available PyPI wheel is
`forexconnect==1.6.43` targeting **CPython 3.7** (`cp37-win_amd64`). The
main backend runs Python 3.11 on the developer machine and Python 3.14 on
Vercel — both incompatible. The solution is an **embedded Python 3.7
sidecar** using the Python 3.7 embeddable ZIP extracted to
`fxcm-bridge/python37/`.

## File Locations

| Path | Description |
|------|-------------|
| `fxcm-bridge/bridge.py` | Flask HTTP bridge (ForexConnect session, all routes) |
| `fxcm-bridge/python37/` | Python 3.7 embeddable runtime |
| `fxcm-bridge/python37/python37._pth` | `import site` must be uncommented to activate site-packages |
| `fxcm-bridge/python37/Lib/site-packages/forexconnect/` | ForexConnect SDK (installed via pip) |
| `fxcm-bridge/python37/Lib/site-packages/flask/` | Flask (installed via pip) |
| `backend/app/fxcm.py` | FastAPI proxy router at `/api/fxcm/*` |
| `frontend/src/components/ForexDiscoverPage.tsx` | Forex Discover page |
| `frontend/src/api.ts` | FXCM API functions (bottom of file, `getFxcm*`) |
| `frontend/src/types.ts` | FXCM types (`FxcmAccount`, `FxcmPrice`, `FxcmBar`, `FxcmPosition`) |

## Starting the Bridge

```powershell
# From the repo root (PowerShell):
Start-Process -FilePath "fxcm-bridge\python37\python.exe" `
              -ArgumentList "fxcm-bridge\bridge.py" `
              -WorkingDirectory (Get-Location) `
              -WindowStyle Normal
```

Or in the background:

```powershell
Start-Process -FilePath "fxcm-bridge\python37\python.exe" `
              -ArgumentList "fxcm-bridge\bridge.py" `
              -WorkingDirectory (Get-Location) `
              -WindowStyle Hidden
```

The bridge logs `"FXCM connected — account D161665432"` when ready. It
listens on `http://127.0.0.1:3001`.

**Verify:** `Invoke-RestMethod http://127.0.0.1:3001/health` → `{"status":"ok","account":"D161665432"}`

## Credentials

Hardcoded in `bridge.py` as constants — this is intentional for the POC:

```python
FXCM_USER = "D161665432"   # TSII demo account login
FXCM_PASS = "Qak5i"        # TSII demo account password
FXCM_URL  = "www.fxcorporate.com/Hosts.jsp"
FXCM_ENV  = "Demo"
PORT      = 3001
```

**Why not env vars:** It's a local demo account, not commercial — the POC
deliberately hard-codes so there's no `.env` dependency for the bridge. If
you move to a real/live account, extract these to env vars before committing.

Do not commit real FXCM live credentials to git.

## Bridge Routes

All routes are wrapped by the FastAPI proxy in `backend/app/fxcm.py` and
exposed at `/api/fxcm/*`.

| Bridge route | FastAPI route | Description |
|---|---|---|
| `GET /health` | `GET /api/fxcm/health` | Bridge + connection status |
| `GET /account` | `GET /api/fxcm/account` | First row of ForexConnect ACCOUNTS table |
| `GET /prices` | `GET /api/fxcm/prices` | All offers (live bid/ask) + instrument metadata; `?instrument=EUR/USD` or `?type=forex` to filter |
| `GET /watchlist` | `GET /api/fxcm/watchlist` | 8 major pairs, enriched, ordered |
| `GET /positions` | `GET /api/fxcm/positions` | Open trades (ForexConnect TRADES table) |
| `GET /orders` | `GET /api/fxcm/orders` | Pending orders (ORDERS table) |
| `GET /summary` | `GET /api/fxcm/summary` | Summary table (aggregated exposure by instrument) |
| `GET /closed_trades` | `GET /api/fxcm/closed_trades` | Closed trades history |
| `GET /watchlist` | `GET /api/fxcm/watchlist` | Major pairs with enriched metadata |
| `GET /instruments` | `GET /api/fxcm/instruments` | Full instrument cache; `?type=forex` / `?tradable=true` |
| `GET /instruments/{name}` | `GET /api/fxcm/instruments/{name:path}` | Single instrument by name (e.g. `EUR/USD`) |
| `GET /history` | `GET /api/fxcm/history` | OHLCV bars; params: `instrument`, `timeframe`, `date_from`, `date_to` |
| `POST /order` | `POST /api/fxcm/order` | Place order (market/stop/limit) |
| `DELETE /order/{id}` | `DELETE /api/fxcm/order/{id}` | Cancel pending order |
| `POST /close` | `POST /api/fxcm/close` | Close open trade by `trade_id` |

### History timeframes

ForexConnect accepts: `t1 m1 m5 m15 m30 H1 H4 D1 W1 M1`

Example: `GET /api/fxcm/history?instrument=EUR/USD&timeframe=H1&date_from=2026-05-01&date_to=2026-05-27`

Response is an array of `FxcmBar`:
```json
[{"time":"2026-05-27T10:00:00","open":1.08341,"high":1.08412,"low":1.08290,"close":1.08385,"ask_open":1.08360,"volume":1423}]
```

### Order placement body

```json
{
  "instrument": "EUR/USD",
  "buy_sell": "B",
  "amount": 1000,
  "order_type": "OM",
  "rate": 0,
  "stop": 0,
  "limit": 0
}
```

`buy_sell`: `"B"` = buy, `"S"` = sell.
`order_type`: `"OM"` = market, `"SE"` = stop entry, `"LE"` = limit entry.
`rate`: opening rate for non-market orders. `stop`/`limit`: protective stop /
take-profit rates (0 = none).

## Instrument Metadata Cache

The bridge fetches instrument metadata at startup from the FXCM public
endpoint:

```
https://endpoints.fxcorporate.com/symbol/data?type=alt&platform=mobile&locale=enu
```

Response shape: `{"Version": "...", "Symbols": [{...}]}` — parse
`data.get("Symbols", data)` to handle both shapes (the bridge does this).

Key fields per symbol: `Name`, `DisplayName`, `Type` (forex/stock/index/
commodity/fund/bond/spot), `Currency`, `Session`, `Timezone`, `UnderlyingUnit`,
`AmountMode`, `Alternatives`, `Description`.

The cache is an in-memory dict `{name: metadata}`, refreshed every 24 h via
`threading.Timer`. The `GET /prices` and `GET /watchlist` routes merge this
metadata into each price row.

As of May 2026 the endpoint returns **737 instruments**.

## ForexConnect SDK Patterns

The `forexconnect` Python wrapper is thin. Key patterns:

### Connecting

```python
from forexconnect import ForexConnect
fc = ForexConnect()
fc.__enter__()
fc.login(user, password, url, env)   # env="Demo" or "Real"
# ... use fc ...
fc.logout()
fc.__exit__(None, None, None)
```

### Reading a table

```python
reader = fc.get_table_reader(fc.ACCOUNTS)   # or fc.OFFERS, fc.TRADES, fc.ORDERS, fc.SUMMARY, fc.CLOSED_TRADES
for row in reader:
    cols = row.columns        # .size is a PROPERTY not a method
    n = cols.size             # NOT cols.size()
    d = {}
    for i in range(n):
        col = cols.get(i)     # col.id is the column name string
        val = row.get_cell(i) # returns int, float, str, or datetime.datetime
        if isinstance(val, datetime.datetime):
            val = val.isoformat() if val.year > 1900 else None
        d[col.id] = val
```

**Critical:** Empty tables raise `TypeError` when iterated (they iterate as
`None`). Wrap `for row in reader` in `try/except TypeError: pass`.

### get_history (bars)

```python
history = fc.get_history(instrument, timeframe_string, dt_from, dt_to)
# timeframe_string must be a plain string: "m1", "H1", "D1" etc.
# Do NOT use fc.get_timeframe() — it returns a C++ type incompatible with get_history.

# history is a numpy structured array with fields:
# Date, BidOpen, BidHigh, BidLow, BidClose, AskOpen, AskHigh, AskLow, AskClose, Volume
for row in history:
    ts = row['Date'].astype('datetime64[s]').astype(datetime.datetime)
    bar = {
        "time":   ts.isoformat(),
        "open":   float(row['BidOpen']),
        "high":   float(row['BidHigh']),
        "low":    float(row['BidLow']),
        "close":  float(row['BidClose']),
        "volume": int(row['Volume']),
    }
```

### Placing an order

```python
# Look up offer_id first (required, must match the live OFFERS table)
reader = fc.get_table_reader(fc.OFFERS)
for row in reader:
    d = {cols.get(i).id: row.get_cell(i) for i in range(cols.size)}
    if d.get("instrument") == target_instrument:
        offer_id = d["offer_id"]
        break

acct_rows = _read_table(fc.ACCOUNTS)
account_id = str(acct_rows[0]["account_id"])

request_factory = fc.create_order_request(
    order_type="OM",    # OM=market, SE=stop entry, LE=limit entry, CM=close market
    offer_id=offer_id,
    account_id=account_id,
    buy_sell="B",       # "B" or "S"
    amount=1000,
    rate=0,
    stop=0,
    limit=0,
    order_id="",
)
resp = fc.send_request(request_factory)
```

### Closing a trade

```python
req = fc.create_order_request(
    order_type="CM",   # close market
    offer_id="", account_id="", buy_sell="", amount=0,
    rate=0, stop=0, limit=0, order_id="",
    trade_id=trade_id,
)
fc.send_request(req)
```

## Instrument Type Values

The FXCM instrument metadata endpoint uses these `Type` strings (case-insensitive
filter via `?type=` on the `/instruments` route):

`forex`, `stock`, `index`, `commodity`, `fund`, `bond`, `spot`

## Frontend Integration

### Silo routing

`App.tsx`:
- `AssetClassMode` is now `"stocks" | "crypto" | "forex"` (all three files that
  define it locally: `App.tsx`, `AssetClassSplash.tsx`, `SettingsMenu.tsx`).
- When `activeClass === "forex"`, `mode === "discover"` renders
  `<ForexDiscoverPage />` instead of `<DiscoverPage>`.
- `TradeBar` is suppressed in forex mode (no Alpaca order entry).
- Forex accent: `oklch(72% 0.18 55)` (orange/amber).

### ForexDiscoverPage

`frontend/src/components/ForexDiscoverPage.tsx`

- Checks bridge health on mount (`getFxcmHealth()`). If offline, shows the
  offline notice + bridge startup command.
- Polls `/api/fxcm/watchlist` every 3 s for live bid/ask.
- Price rows colour bid green/red on uptick/downtick (prev vs current comparison
  held in `prevPrices` Map).
- Spread displayed in pips (multiplied by 100,000 for most pairs, 1,000 for JPY).
- Account hero shows equity, balance, used margin, free margin.

### `isCryptoSymbol` conflict

`lib/asset-class.ts` uses `symbol.includes("/")` to fast-detect crypto. Forex
pairs (EUR/USD, GBP/USD …) also contain a slash. **This is not a bug in the
current POC** because forex symbols never enter the Alpaca flows (no Alpaca
order tickets, no Alpaca position fetches). If forex symbols ever reach
`useOrderTicket` or the TradingView datafeed, the slash detection will
misclassify them as crypto and apply wrong constraints. Track this before
deepening the Chart-mode integration.

## Known Gotchas and Landmines

See also `docs/landmines.md` → "FXCM bridge" section.

### Python 3.7 embeddable on Windows

- Group policy blocks `pip.exe` directly — always use `python -m pip`.
- Corporate SSL interception breaks pip's certificate check — add:
  `--trusted-host pypi.org --trusted-host files.pythonhosted.org --trusted-host bootstrap.pypa.io`
- Group policy blocks running `uvicorn.exe` etc — run as a python module:
  `python.exe -c "import uvicorn; uvicorn.run(...)"`
- The Python 3.7 embeddable ZIP has `import site` commented out in
  `python37._pth` by default — **must be uncommented** to activate
  site-packages (and thus the installed wheels). Already done in this repo.
- `forexconnect` package: only `from forexconnect import ForexConnect` works.
  There is no `LoginParams` class, no `get_accounts()` method — read tables via
  `get_table_reader(fc.ACCOUNTS)`.

### Corporate network (Fiserv / TRADU environment)

- `api-demo.fxcm.com` and `api.fxcm.com` DNS does **not** resolve on this
  network — this is why the FXCM REST API approach was ruled out.
- `www.fxcorporate.com` (ForexConnect protocol) **does** resolve.
- SSL certificate verification fails through the corporate proxy — the bridge
  disables SSL verification for the instrument metadata fetch via
  `ctx.check_hostname = False; ctx.verify_mode = ssl.CERT_NONE`.

### ForexConnect API quirks

- `cols.size` is a **property**, not a method. Calling it as `cols.size()` raises
  `TypeError: 'int' object is not callable`.
- `get_history()` accepts a **plain string** timeframe (`"H1"`, `"m1"`) — do NOT
  pass the result of `fc.get_timeframe()` (returns a C++ type that causes a
  second TypeError inside `get_history`).
- `get_history()` returns a **numpy structured array** — access fields as
  `row['Date']`, `row['BidOpen']` etc., not as attributes.
- Date conversion: `row['Date'].astype('datetime64[s]').astype(datetime.datetime)`
- Empty tables (Trades, Orders, ClosedTrades) raise `TypeError` when iterated
  (they return `None` from the iterator). Wrap in `try/except TypeError: pass`.
- The public instrument endpoint returns `{"Version": "...", "Symbols": [...]}`,
  not a bare list — parse via `data.get("Symbols", data)`.

## What's Implemented (POC)

- [x] Python 3.7 Flask bridge with persistent ForexConnect session
- [x] Instrument metadata cache (737 instruments, 24h refresh)
- [x] All read routes (account, prices, positions, orders, summary, closed trades, watchlist, instruments, history)
- [x] Order placement (market) and cancellation
- [x] Trade close
- [x] FastAPI proxy router (`/api/fxcm/*`)
- [x] Frontend Forex silo: `AssetClassMode` extended, orange accent, splash card, settings switcher
- [x] ForexDiscoverPage: account hero + live watchlist (3s polling, tick colouring)

## What's NOT Implemented (Next Steps)

See also `BACKLOG.md` → "Forex (FXCM)" for the prioritised list. High-level:

1. **Order entry UI** — the bridge has `/order` + `/close`; no frontend order
   ticket exists yet. The Alpaca `OrderSheet` is not reusable (it hardwires
   Alpaca schemas). A new `FxcmOrderSheet` is needed.

2. **Positions panel** — `/api/fxcm/positions` returns open trades; no frontend
   table or card list yet. Could reuse the existing Positions component with an
   adapter layer.

3. **Chart integration** — `/api/fxcm/history` returns OHLCV bars compatible
   with TradingView's bar format. The TV datafeed (`lib/tv-datafeed.ts`) needs a
   branch for forex symbols that calls `getFxcmHistory` instead of `/api/bars`.
   The `isCryptoSymbol` slash conflict must be resolved first.

4. **Closed trades / P&L** — `/api/fxcm/closed_trades` is wired; no frontend
   history table yet.

5. **Real-time price updates** — currently polling every 3 s. ForexConnect
   supports a subscriber / callback model for push updates; the bridge could use
   `fc.subscribe_rate(offer_id, callback)` and SSE-push to the frontend for
   genuine real-time quotes.

6. **Bridge process management** — no auto-start / health restart. The frontend
   shows the offline notice when it's not running; a startup script or task
   scheduler entry would improve DX.

7. **Credentials in env** — currently hardcoded constants. Extract to environment
   variables if moving to a live account.

8. **Spread-to-pip denominator** — currently hardcoded (100,000 for non-JPY,
   1,000 for JPY). Use the `digits` field from the OFFERS table instead (the
   bridge exposes it; the frontend ignores it today).

9. **Account metrics** — the ACCOUNTS table columns vary by account type; field
   names like `balance`, `equity`, `usedmargin`, `day_pl` may differ or be absent.
   Map these defensively in the frontend hero (already done with `?? 0` guards).

10. **DB seeding of FXCM instruments** — 737 instruments are currently cache-only.
    If the asset-catalogue approach (Supabase `assets` table) should extend to
    forex, a `seed-fxcm-instruments` routine is needed in `backend/app/seed.py`.

## Running the Full Stack Locally (with Forex)

```bash
# Terminal 1 — FXCM bridge
# (From repo root, PowerShell)
& "fxcm-bridge\python37\python.exe" "fxcm-bridge\bridge.py"

# Terminal 2 — FastAPI backend
cd backend
python -m uvicorn app.main:app --reload --port 8000

# Terminal 3 — Frontend
cd frontend
npm run dev
```

Open http://localhost:5173, pick **Forex** from the splash or Settings → Market.

## Relation to Other Docs

- `CLAUDE.md` — Workflow rules, architecture overview, hard rules; updated to
  include Forex silo.
- `docs/landmines.md` — Hard-won runtime gotchas; FXCM section added.
- `BACKLOG.md` — Deferred Forex work, prioritised.
- `README.md` — Setup instructions; FXCM step added.
- `BACKEND_REVIEW.md` / `FRONTEND_REVIEW.md` — Historical code-quality reviews
  predating the FXCM integration; not re-reviewed.
