# Trading Platform

A paper-trading dashboard built on the [Alpaca](https://alpaca.markets/) API.

**Scope:** full **paper** trading — account/portfolio summary, a live-quote
watchlist, candlestick charts, asset search, market clock, and the full
order path (market/limit/stop/stop-limit/trailing, bracket/OCO, replace,
cancel, close positions) with a positions/orders/activities blotter.
Paper account only — there is no live-trading path.

A header toggle switches between three UI modes:
- **Discover** (default) — market overview: indices ticker, holdings pie
  chart, top gainers/losers/most-active, and market/symbol news feed
- **Trading** — custom React dashboard with live-quote watchlist,
  candlestick charts, order ticket, and positions/orders/activities blotter
- **ChartBot** — full TradingView Charting Library terminal with
  built-in drawing tools, 100+ indicators, and an integrated order/position
  panel wired to the same Alpaca backend. Includes an optional **AI chat
  panel** (see *AI chat* below)

## Stack

- **Backend:** FastAPI + `alpaca-py` (REST reads + a real-time quote stream
  over Server-Sent Events, with REST polling as automatic fallback).
- **Frontend:** React + TypeScript (Vite). Three modes — Discover (market
  overview), Trading (custom charts via `lightweight-charts`), and
  ChartBot (full Charting Library at `frontend/public/charting_library/`
  plus an AI chat panel).
- **PWA:** Progressive Web App with service worker, offline support, and
  install capabilities. Smart caching strategies for API calls and charting
  library.

## Setup

### 1. Alpaca keys

Create a **paper trading** account at https://app.alpaca.markets/, then:

```bash
cp backend/.env.example backend/.env
# edit backend/.env and paste your paper API key + secret
```

The free `iex` data feed is the default. `sip` needs a paid Alpaca data plan.

### 1b. AI chat (optional)

The ChartBot mode includes an AI chat panel powered by the Anthropic API.
It is disabled by default — leave it off unless you want to spend Anthropic
credits.

To enable: get an API key at https://console.anthropic.com, then add to
`backend/.env`:

```
AI_CHAT_ENABLED=true
ANTHROPIC_API_KEY=sk-ant-...
```

The panel lets you ask questions about your positions, request price data,
and draw annotations directly on the chart via natural language.

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

Open http://localhost:5173. Vite proxies `/api` to the backend on port
8000, so the real-time stream works locally with no extra config.

> **TradingView Charting Library** — the library is committed to the repo
> at `frontend/public/charting_library/` (this is a private repo; the
> licensed files are never exposed publicly). No extra setup needed — it
> is included in the standard `git clone`.

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

### Real-time streaming (persistent relay)

`/api/stream` is a Server-Sent Events endpoint backed by a single shared
Alpaca WebSocket (`backend/app/stream.py`). It needs an **always-on**
process, which Vercel's serverless functions are not — so the stream runs
as a separate deployment and the frontend falls back to polling whenever it
is unreachable (which is what happens on Vercel/Pages until a relay exists).

1. **Deploy the relay.** Any container host works (Render, Fly, Railway, a
   VM). Build `backend/Dockerfile` and set the same Alpaca env vars used in
   Vercel (`ALPACA_API_KEY`, `ALPACA_SECRET_KEY`, `ALPACA_PAPER=true`,
   `ALPACA_DATA_FEED=iex`). Run a **single** instance — the hub keeps one
   shared upstream stream per process.
2. **Point the frontend at it** with the relay's public URL (e.g.
   `https://trading-relay-xxxx.onrender.com`). It is read at build time, so
   set it in **both** places that build the frontend:
   - **Vercel prod:** project → Settings → Environment Variables →
     `VITE_STREAM_BASE` (Production), then redeploy.
   - **GitHub Pages previews:** repo → Settings → Secrets and variables →
     Actions → *Variables* → `VITE_STREAM_BASE`.

   If unset in a given build, that frontend just polls and nothing breaks.

The free `iex` feed streams in real time but only covers IEX volume
(~2–3% of consolidated tape). `sip` (set `ALPACA_DATA_FEED=sip`) needs a
paid Alpaca data plan for the full consolidated tape.

## Notes

- Quotes stream in real time via `/api/stream` when a relay is reachable,
  otherwise the watchlist polls `/api/quotes` (~2s, `POLL_MS` in
  `frontend/src/components/Watchlist.tsx`). Charts still load a bar snapshot
  per symbol/timeframe change.
- Keys live only in `backend/.env`, which is gitignored. Never commit it.
- Default watchlist symbols are configurable via `DEFAULT_SYMBOLS` in `.env`.
- Platform mode preference is persisted to `localStorage` under the key
  `platform_mode`.
- AI chat drawings are persisted to `localStorage` (`ai_drawings_v1`) and
  replayed per symbol on load. The chat conversation is persisted to
  `chartbot_session` with a 256 KB byte budget — oldest user+assistant
  pairs drop once the budget is exceeded.
