# CLAUDE.md

Guidance for working in this repo. Read before changing deploy config,
dependencies, or the streaming path.

## What this is

A serious hobby-grade, professionally-built **paper-trading platform** on
the [Alpaca](https://alpaca.markets/) API. Full paper trading: read **and**
write — order placement (market/limit/stop/stop-limit/trailing,
bracket/OCO), cancel/replace, close positions — plus full portfolio & P/L,
persisted watchlists, asset search, and real-time streaming.

**Hard rules — do not cross without an explicit, deliberate decision:**

1. **Paper account ONLY.** Never wire live-trading keys or endpoints. The
   Alpaca client is always `paper=True`; there is no live path.
2. **Single user; keys server-side only.** Alpaca credentials never reach
   the browser.
3. **Auth gate on writes.** Every trade-mutating endpoint (and ideally the
   whole app) sits behind a single shared token/password. No
   unauthenticated trade actions on public deploys.
4. **Free / very-low-cost infra only.**

## Workflow rules (strict — these override default behavior)

1. **Never assume** — always ask before proposing or touching any code.
2. **Surgical edits only** — smallest possible change; do not reformat or
   reorganise surrounding code.
3. **No changes to `main` without explicit user approval.**
4. **Git branching** — all changes go to a `claude/` branch first; only
   merge to `main` when explicitly asked.
5. **Version every change** — the root `VERSION` file is the single
   source of truth (`X.Y.Z`). Each commit on a `claude/` branch bumps
   **Z** (patch). Each promotion to `main` bumps **Y** (minor) and resets
   `Z` to 0, *unless the user explicitly asks for `Z` to stay*. `X` is
   bumped manually only. `frontend/package.json` and the FastAPI
   `version=` are **not** canonical — do not rely on them.
6. **No rewrites** — never rewrite large sections; targeted edits only.

## Architecture

- **Frontend:** React 18 + TypeScript + Vite. Single-page (no router).
  A header toggle switches between two platform modes (persisted to
  `localStorage('platform_mode')`):
  - **Our Platform (default):** `App.tsx` lays out three zones — a
    glanceable status strip (`MarketClock`, `AccountSummary`,
    `PortfolioSummary`), a pick/analyse/trade workspace (`AssetSearch`,
    `Watchlist`, `PriceChart`, `OrderTicket`), and a review blotter
    (`Positions`, `Orders`, `Activities`). Charts use TradingView
    `lightweight-charts` (npm lib — data from our backend).
  - **TradingView mode:** `TVPlatform.tsx` mounts the full TradingView
    Charting Library terminal (`frontend/public/charting_library/`,
    committed to repo — private repo only). Data and broker wired via
    `frontend/src/lib/tv-datafeed.ts` (→ `/api/bars`, `/api/stream`,
    `/api/quotes`, `/api/snapshots`, `/api/assets`) and
    `frontend/src/lib/tv-broker.ts` (→ `/api/account`, `/api/orders`,
    `/api/positions`, `/api/activities`). No backend changes — same
    FastAPI endpoints.
- **Backend:** FastAPI + `alpaca-py`. `backend/app/` is the real code;
  `api/index.py` is a thin shim that puts it on Vercel's import path.
  Endpoints: `/api/health`, `/api/config`, `/api/account`, `/api/bars`,
  `/api/quotes`, `/api/stream`, `/api/orders`, `/api/positions`,
  `/api/activities`, `/api/assets`, `/api/news`, `/api/calendar`.
- **Data feed:** IEX (free, real-time but ~2-3% of volume). `sip` needs a
  paid Alpaca plan; switch via `ALPACA_DATA_FEED` env — no code change.
- **Frontend stack:** Tailwind CSS + headless (shadcn-style) component
  primitives; TradingView `lightweight-charts` retained for custom mode.
  `index.css` is migrated to Tailwind progressively — no new bespoke CSS
  files.
- **Persistence:** Postgres (free tier, e.g. Supabase/Neon) is the
  intended layer for trade journaling, server-side watchlists, and
  analytics history — **backlogged** (see `BACKLOG.md`). For now Alpaca is
  queried directly as source of truth; UI prefs live in browser
  `localStorage`.
- **Auth:** shared-token middleware guards write endpoints.

## Three deploy targets (do not conflate)

1. **Vercel — production**, from `main` only, via
   `.github/workflows/deploy-prod.yml` (`vercel deploy --prod`). Serves the
   frontend **and** the serverless REST API. Vercel's own Git integration
   is intentionally disabled (`vercel.json` `git.deploymentEnabled=false`,
   commit #9) — do not re-enable it; it caused preview spam.
2. **Render — the always-on relay**, from `render.yaml` (Blueprint),
   single Docker instance from `backend/Dockerfile`. This is the *only*
   host that can hold the Alpaca WebSocket open for `/api/stream`. Vercel
   serverless cannot. Never run >1 instance: `QuoteHub` keeps one shared
   upstream stream per process with no external pub/sub.
3. **GitHub Pages — dev previews**, via `preview-pages.yml`. Static
   frontend only; talks to the Vercel prod backend. Auto-publishes to
   `gh-pages` on every `claude/**` push (also manually dispatchable).
   This is **GitHub Pages only** — it runs no `vercel` command and
   cannot trigger a Vercel deploy; Vercel git deploys stay disabled
   repo-wide (`vercel.json` `git.deploymentEnabled=false`), so only
   `main` → `deploy-prod.yml` ever reaches Vercel.

## Streaming design (don't regress)

- One shared Alpaca `StockDataStream` per process, fanned out to browsers
  over **SSE** (`backend/app/stream.py` → `/api/stream`). SSE is
  hand-rolled (no `sse-starlette` dep); `alpaca-py` already ships the
  stream client — no new backend deps were needed and none should be added
  casually.
- The watchlist **prefers the stream and auto-falls-back to polling
  `/api/quotes`** when the stream is unreachable (Vercel/Pages have no
  relay). This fallback is load-bearing — keep it. `EventSource`
  auto-reconnect is deliberately disabled so failure → polling, not a
  silent reconnect loop.
- Stream ticks are buffered and flushed at most every `STREAM_FLUSH_MS`
  (500ms) in `Watchlist.tsx` to cap re-renders. Tune the constant, don't
  remove the buffer.
- `VITE_STREAM_BASE` is read at **build time** and must be set in **both**
  build paths or that frontend silently polls:
  - Vercel prod: Vercel project env var (Production).
  - Pages previews: GitHub repo Actions *variable* (`preview-pages.yml`
    passes it through).
  Relay CORS (`CORS_ORIGINS`, defaulted in `render.yaml`) must list the
  exact frontend origin or the browser blocks the stream and falls back.

## Vercel Python runtime — landmines (commits #4–#8)

Vercel's serverless Python builder forces **Python 3.14** and ignores
`Pipfile` / `.python-version`. Hard-won resolution — do not undo:

- **Do not** re-add `Pipfile` or `.python-version` (they push Vercel onto
  a uv/pipenv path that fails the function build).
- **Do not** pin or downgrade `pydantic` / `pydantic-settings`. They are
  floated (`>=2.11`) so a prebuilt pydantic-core 3.14 wheel is used
  instead of a failing Rust source build.
- Keep the `PYO3_USE_ABI3_FORWARD_COMPATIBILITY=1` build env in
  `vercel.json`.
- Backend deps come from `requirements.txt` only.

## TradingView mode — landmines (don't regress)

The broker adapter (`frontend/src/lib/tv-broker.ts`) and datafeed
(`frontend/src/lib/tv-datafeed.ts`) bridge a strict, undocumented-in-
places TV interface. Specifics that took several iterations to land:

- **`OrderType` enum is `Limit=1, Market=2, Stop=3, StopLimit=4`.** TV's
  order ticket sends the *integer*, not the string — flipping market and
  limit silently sends limit orders without `limit_price` and the
  backend rejects with 422. Same enum is used both ways (`toTVOrder` and
  `placeOrder`).
- **`AccountManagerInfo` shape is rigid.** Summary rows use
  `{ text, wValue, formatter }` (not `label`+`property`); each column
  needs `id`+`label`+`formatter`+`dataFields`; `pages: []` is required.
  Wrong keys throw `Cannot read properties of undefined ('length')` deep
  inside TV's template renderer.
- **Reactive summary values must come from `host.factory.createWatchedValue()`.**
  Plain numbers don't update the panel — TV subscribes to the
  `WatchedValue` and only re-renders on `setValue()`.
- **TV does NOT re-poll `orders()` / `positions()`.** After the initial
  call it expects push updates via `host.orderUpdate()` /
  `host.positionUpdate()` / `host.executionUpdate()`. Our broker polls
  the REST endpoints every 5s and pushes diffs, plus an immediate push
  after `placeOrder` / `cancelOrder` / `closePosition`.
- **Diff before pushing.** Calling `host.orderUpdate` for every
  historical order on every poll triggers a toast notification per
  order. Keep the per-id signature cache and skip notifications on the
  very first poll (TV's own `orders()` already populated the panel).
- **Order ticket needs `IDatafeedQuotesApi`.** Without
  `getQuotes` / `subscribeQuotes` / `unsubscribeQuotes` and
  `supports_quotes: true` in `onReady`, the ticket aborts with
  "quotesSnapshot / formatter / spreadFormatter not received".

## Dev workflow

- Develop on the designated `claude/**` branch. **Only when explicitly
  asked**, promote with a **fast-forward** merge into `main` (no
  divergence so far — keep it that way), then push **both** branches so
  the stop-hook git check is happy. See Workflow rules #3 and #4.
- Commits: short imperative subject + a body explaining the *why*. Don't
  put model identifiers in commits/PRs/code.
- Don't open PRs unless explicitly asked.
- `gh-pages` branch is auto-generated by the preview workflow — never hand-edit.

## Run locally

```bash
# backend (terminal 1)
cd backend && python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # add paper ALPACA_API_KEY / ALPACA_SECRET_KEY
uvicorn app.main:app --reload --port 8000

# frontend (terminal 2)
cd frontend && npm install && npm run dev   # http://localhost:5173
```

Vite proxies `/api` → `:8000`, so the stream works locally with no extra
config. Typecheck the frontend with `npx tsc -b` before committing UI
changes.

## Code conventions

- Minimal comments — explain *why*, never *what*. No new abstractions or
  backwards-compat shims beyond what a task needs.
- Keep the polling fallback and graceful 503s (unconfigured Alpaca keys)
  intact across all data endpoints.
