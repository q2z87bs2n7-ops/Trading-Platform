# Trading Platform

A paper-trading dashboard built on the [Alpaca](https://alpaca.markets/) API.

**v1 scope:** account summary, a live-quote watchlist, and candlestick charts.
No order placement yet — it is read-only against your **paper** account.

## Stack

- **Backend:** FastAPI + `alpaca-py` (REST reads + a WebSocket that polls
  latest quotes every couple of seconds).
- **Frontend:** React + TypeScript (Vite), charts via TradingView
  `lightweight-charts`.

## Setup

### 1. Alpaca keys

Create a **paper trading** account at https://app.alpaca.markets/, then:

```bash
cp backend/.env.example backend/.env
# edit backend/.env and paste your paper API key + secret
```

The free `iex` data feed is the default. `sip` needs a paid Alpaca data plan.

### 2. Backend

```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

### 3. Frontend

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:5173. Vite proxies `/api` and `/ws` to the backend
on port 8000.

## Notes

- Quotes update on a ~2s poll (see `QUOTE_POLL_INTERVAL` in
  `backend/app/main.py`). To get true tick-by-tick streaming later, swap the
  poll loop for `alpaca.data.live.StockDataStream`.
- Keys live only in `backend/.env`, which is gitignored. Never commit it.
- Default watchlist symbols are configurable via `DEFAULT_SYMBOLS` in `.env`.
