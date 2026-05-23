# Trading Platform

A paper-trading dashboard built on the [Alpaca](https://alpaca.markets/) API.

**Scope:** full **paper** trading — account/portfolio summary, a live-quote
watchlist, candlestick charts, asset search, market clock, and the full
order path (market/limit/stop/stop-limit/trailing, bracket/OCO, replace,
cancel, close positions) with a positions/orders/activities blotter.
Supports **US equities** and **crypto** in separate silos. Paper account
only — there is no live-trading path.

On **every load** an **asset class splash** is shown as the landing screen —
pick Stocks or Crypto to enter (the app never restores a last page/silo). It
doubles as an **Account Hub** (re-opened from the header brand mark) showing a
whole-account overview: total equity, day P/L, buying power, and a
stocks-vs-crypto-vs-cash split. The last-used silo is remembered only to
highlight its card. The active silo also tints the accent (green for Stocks,
blue for Crypto). Both sides share the same three-pill mode toggle:

- **Discover** (default)
  - *Stocks* — silo holdings + allocation donut (green), indices marquee
    ticker, watchlist sparkline cards, inline chart, tabbed gainers / losers +
    most-active volume, market news feed.
  - *Crypto* — live crypto price marquee, holdings + allocation hero (crypto
    positions only, blue), crypto watchlist sparkline cards, inline chart, BTC
    news. No movers/most-active (Alpaca has no crypto screener).
- **Portfolio** — siloed value + day P/L hero with a reconstructed per-silo
  **net P/L curve** (from `/api/pnl-history`), positions strip (one card per
  position, filtered to the active asset class), open-orders table, and
  account activity. Order entry is the floating bottom-centre **TradeBar**
  pill that opens a bottom-sheet order ticket.
- **Chart** — full TradingView Charting Library terminal wrapped in a
  custom Calm chrome: own top toolbar with TF / chart-type / indicator
  popovers, TV's native drawing rail on the left (themed), and a tabbed
  Positions / Orders / Activity blotter below (filtered by asset class).
  Order entry is the same floating **TradeBar** pill. Includes an optional
  **ChartBot side panel** (violet · AI chat — see *AI chat* below).

The **Ask anything** bar (centred modal, teal accent) is available from every
mode — press `⌘K` (or `Ctrl+K`), or click the "Ask anything" pill in the
top nav. It is a local regex-based intent parser (no LLM, no Anthropic
credits) that handles orders ("buy 50 AMD at market"), portfolio queries,
movers, news, open orders, and inline symbol previews. It is **silo-aware**
(stocks vs crypto). When the optional AI fallback is enabled (see *AI chat*
below), free-text questions also reach a Claude-backed bot that can read your
account, edit watchlists in bulk ("add the top 10 pharma stocks"), and export
data to downloadable CSVs (positions/orders/activities/P&L, plus price history
and other readable data); it keeps context across follow-ups within a session.

Theme switches between light and dark via the moon / sun toggle in the
top nav; preference persists in `localStorage`.

## Stack

- **Backend:** FastAPI + `alpaca-py` (REST reads + a real-time quote stream
  over Server-Sent Events, with REST polling as automatic fallback).
  Separate `StockDataStream` and `CryptoDataStream` hubs; the SSE endpoint
  auto-routes based on symbol format.
- **Frontend:** React + TypeScript (Vite) + Tailwind on the Calm v2 token
  set (light + dark in oklch, Inter + IBM Plex Mono). Three modes —
  Discover, Portfolio, and Chart (the full Charting Library at
  `frontend/public/charting_library/` plus the violet ChartBot panel).
  Cross-mode Ask anything bar runs locally without any LLM call. Layouts
  are responsive down to phones (≤640px): a slim header + slide-in nav
  drawer, card lists in place of tables, a full-bleed chart, and
  full-screen / slide-up sheets for the order ticket and Ask anything,
  with iOS safe-area handling for installed-PWA use.
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

The Chart mode includes a **ChartBot side panel** (violet accent)
powered by the Anthropic API. It is disabled by default — leave it off
unless you want to spend Anthropic credits.

To enable: get an API key at https://console.anthropic.com, then add to
`backend/.env`:

```
AI_CHAT_ENABLED=true
ANTHROPIC_API_KEY=sk-ant-...
```

The panel lets you ask questions about your positions, request price data,
and draw annotations directly on the chart via natural language.

The **Ask anything** bar (teal accent, all modes) is a separate, purely
local intent parser — orders, portfolio queries, movers, news, charts.
It works without any Anthropic key and costs nothing to run.

### 1c. Asset catalogue (optional)

A Postgres (Supabase) `assets` table holds the full Alpaca universe
(~13.8k us_equity + crypto rows) plus per-source enrichment: crypto from
[CoinGecko](https://www.coingecko.com/) and stocks from
[Financial Modeling Prep](https://financialmodelingprep.com/). It's optional —
nothing in the app requires it yet, and DB-backed code degrades gracefully
(503) when unconfigured. To enable, create the table once by running
`backend/sql/002_assets.sql` in the Supabase SQL editor, then add to
`backend/.env`:

```
DATABASE_URL=postgresql://...@...pooler.supabase.com:5432/postgres
FMP_API_KEY=...          # stock enrichment (free tier: single-symbol, 250/day)
COINGECKO_API_KEY=...    # optional Demo key; unset = keyless (rate-limited)
```

Populate it with the Render-only dev seeders: `POST /api/_dev/seed-assets`
(Alpaca base + CoinGecko crypto) and `POST /api/_dev/enrich-stocks` (FMP
stocks — `?symbols=AAPL,…` or `?limit=N` to backfill the next N un-enriched).
Search only surfaces enriched + tradable rows (the visibility rule), so the
catalogue is whatever you've chosen to enrich. **Note:** the DB write path
needs outbound TCP to Postgres :5432, which many local/corporate networks
block — so seeding only runs from prod/Render. See `docs/database.md` and
`docs/landmines.md` for the full story.

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
   re-run the prod workflow so it picks them up. *(Optional: add
   `DATABASE_URL` + `FMP_API_KEY` + `COINGECKO_API_KEY` here too — and on the
   relay host — to enable the asset catalogue. Paste only the value, no
   trailing newline.)*
4. **GitHub repo variable** (same page → *Variables*): `VERCEL_PROD_URL` =
   `https://trading-platform.vercel.app` (shown in the deploy job summary).
   Baked into Pages builds so previews know where the backend is.
5. **Enable GitHub Pages:** Settings → Pages → source = `gh-pages` branch,
   root.

Caveat: every dev preview hits the *same* production backend. UI changes
preview perfectly; backend API changes only take effect once merged to
`main` and Vercel redeploys.

### Real-time streaming (persistent relay)

`/api/stream` is a Server-Sent Events endpoint backed by shared Alpaca
WebSocket hubs (`backend/app/stream.py`). It needs an **always-on**
process, which Vercel's serverless functions are not — so the stream runs
as a separate deployment and the frontend falls back to polling whenever it
is unreachable.

1. **Deploy the relay.** Any container host works (Render, Fly, Railway, a
   VM). Build `backend/Dockerfile` **from the repo root** (so the image can
   `COPY` the root `VERSION` file the backend reads at startup — `render.yaml`
   sets `dockerContext: .`) and set the same Alpaca env vars used in Vercel
   (`ALPACA_API_KEY`, `ALPACA_SECRET_KEY`, `ALPACA_PAPER=true`,
   `ALPACA_DATA_FEED=iex`). Run a **single** instance — the hubs keep one
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
  `frontend/src/data/useLiveQuotes.ts`). Charts still load a bar snapshot
  per symbol/timeframe change. A yellow "Polling · stream off" chip in
  the Portfolio mode `TopBar` indicates when the stream is unavailable.
- Keys live only in `backend/.env`, which is gitignored. Never commit it.
- Default watchlist symbols are configurable via `DEFAULT_SYMBOLS` in `.env`.
- Browser state is in `localStorage`: `asset_class_mode` (stocks / crypto,
  the last-used silo used only to highlight the landing card — the splash
  shows on every load), `theme` (light / dark), `chartbot_session` (256 KB
  byte budget —
  oldest user+assistant pairs drop once the budget is exceeded),
  `ai_drawings_v1` (per-symbol drawing UUIDs replayed on chart load),
  `chart_blotter_collapsed`, `app_settings_v1`.
