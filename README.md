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

## Deployment

Two targets, wired via GitHub Actions:

- **Production → Vercel.** Pushing to `main` runs `.github/workflows/deploy-prod.yml`,
  which does a `vercel deploy --prod`. Vercel hosts the prod frontend **and**
  the FastAPI backend (`api/index.py`). No Vercel Git integration, so dev
  branches never create Vercel preview deployments.
- **Dev previews → GitHub Pages.** Pushing to any `claude/**` branch runs
  `.github/workflows/preview-pages.yml`, which builds the frontend and
  publishes it to `gh-pages/<branch>/`. Each preview is static and calls the
  Vercel **production** backend for data.

### One-time setup (all in the browser — no local commands)

The Vercel project is created by the prod workflow. The Alpaca keys live
only in Vercel (never in GitHub).

1. **GitHub repo secret** (Settings → Secrets and variables → Actions →
   *Secrets*): `VERCEL_TOKEN` only.
2. **First prod deploy:** merge to `main` or run "Deploy production
   (Vercel)" from the Actions tab. This creates the Vercel project (the
   backend returns 503 until step 3).
3. **Alpaca env in Vercel:** in the new Vercel project → Settings →
   Environment Variables (Production), add `ALPACA_API_KEY`,
   `ALPACA_SECRET_KEY`, `ALPACA_PAPER=true`, `ALPACA_DATA_FEED=iex`, then
   re-run the prod workflow so it picks them up.
4. **GitHub repo variable** (same page → *Variables*): `VERCEL_PROD_URL` =
   `https://trading-platform.vercel.app` (shown in the deploy job summary).
   Baked into Pages builds so previews know where the backend is.
5. **Enable GitHub Pages:** Settings → Pages → source = `gh-pages` branch,
   root.

Caveat: every dev preview hits the *same* production backend. UI changes
preview perfectly; backend API changes only take effect once merged to
`main` and Vercel redeploys.

## Notes

- Quotes update on a ~2s poll (see `QUOTE_POLL_INTERVAL` in
  `backend/app/main.py`). To get true tick-by-tick streaming later, swap the
  poll loop for `alpaca.data.live.StockDataStream`.
- Keys live only in `backend/.env`, which is gitignored. Never commit it.
- Default watchlist symbols are configurable via `DEFAULT_SYMBOLS` in `.env`.
