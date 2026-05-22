# CLAUDE.md

Guidance for working in this repo. Read in full before changing deploy
config, dependencies, or the streaming path. See `README.md` for setup
and deployment, `BACKLOG.md` for deferred work, and `docs/landmines.md`
for the Vercel-Python / TradingView / streaming details that took
several iterations to land — don't undo them.

## What this is

A serious hobby-grade paper-trading platform on the
[Alpaca](https://alpaca.markets/) API. Full paper trading: orders
(market/limit/stop/stop-limit/trailing, bracket/OCO), cancel/replace,
close positions, portfolio & P/L, persisted watchlists, asset search,
real-time streaming. Supports both **US equities** and **crypto** in
separate silos behind a shared account.

**Hard rules — do not cross without an explicit, deliberate decision:**

1. **Paper account ONLY.** Alpaca client is always `paper=True`; there
   is no live path.
2. **Single user; keys server-side only.** Alpaca credentials never
   reach the browser.
3. **Auth gate on writes.** Trade-mutating endpoints sit behind a
   shared token — currently a no-op seam (`require_write_auth` in
   `backend/app/main.py`). Flip before any non-paper exposure.
4. **Free / very-low-cost infra only.**

## Workflow rules (strict — override default behavior)

1. **Never assume** — always ask before proposing or touching code.
2. **Surgical edits only** — smallest possible change; don't reformat
   or reorganise surrounding code.
3. **No changes to `main` without explicit user approval.**
4. **Git branching** — all changes go to a `claude/` branch first; only
   merge to `main` when explicitly asked, and only as a fast-forward.
5. **Version every change** — root `VERSION` is the single source of
   truth (`X.Y.Z`). Each commit on a `claude/` branch bumps **Z**.
   Each promotion to `main` bumps **Y** and resets **Z** to 0, unless
   the user explicitly asks otherwise. Minor hotfix commits made
   directly on `main` (e.g. a one-line bug fix) bump **Z** by 1.
   **X** is bumped manually.
   Backend reads `VERSION` at startup (layout-tolerant + crash-proof —
   see `docs/landmines.md`); frontend syncs to `package.json` via
   `npm run sync-version` (auto-run pre-build).
6. **No rewrites** — targeted edits only.

## Architecture (high level)

- **Frontend:** React 18 + TypeScript + Vite, single-page (no router).
  On **every load** `AssetClassSplash.tsx` is shown as the landing screen,
  prompting the user to pick **Stocks** or **Crypto** (the app never
  restores a last page/silo — `App.tsx` always lands here). The chosen
  silo persists to `localStorage('asset_class_mode')` only to highlight the
  last-used card and seed the header toggle; it is switchable at any time.
  That same component doubles as the **Account Hub** (re-opened by clicking
  the header brand mark): a whole-account overview (total equity, day P/L,
  buying power, stocks-vs-crypto-vs-cash split) that is intentionally the
  *only* cross-silo balance surface — every other balance view is filtered
  to the active silo. Per-silo accent: stocks recolours the `--accent`
  tokens to green (`--pos`), crypto keeps the default blue; `--pos`/`--neg`
  P/L colours are untouched. The header pill switches between three modes
  (session-only — not persisted):
  - **Discover** (default) — one parameterized surface, `DiscoverPage.tsx`
    (`assetClass` prop), sharing the hero / AI summary / watchlist / inline
    chart / news scaffold across both silos and branching only where they
    differ. Silo-specific data hooks are gated with `enabled` so the inactive
    silo never fetches.
    - *Stocks*: holdings + allocation hero (stock positions
      only; `BalanceCard` headline is silo holdings, with silo day P/L and
      stock buying power — no shared cash), indices marquee ticker,
      watchlist sparkline cards, inline chart, gainers/losers tabbed card
      (with most-active volume), market news.
    - *Crypto*: crypto price marquee ticker (`discover/CryptoTicker.tsx`),
      holdings + allocation hero (crypto positions only;
      `non_marginable_buying_power`), crypto watchlist sparkline cards,
      inline chart, BTC news feed. No movers/most-active (Alpaca has no
      crypto screener).
  - **Portfolio** — `PortfolioHero` (siloed: silo holdings + day P/L +
    unrealized + a reconstructed **net P/L curve** from `/api/pnl-history`)
    + `Positions` (strip variant, filtered by asset class) + `Orders`
    (filtered) + `Activities`. `TopBar` status strip mounts here and in
    Chart mode.
  - **Chart** — `TVPlatform.tsx` wraps the full TradingView Charting
    Library (`frontend/public/charting_library/`, committed — private
    repo only) in our own chrome: `ChartTopBar`, `IndicatorPillsRow`,
    `ChartBlotter` (filtered by asset class), floating `TradeBar`. TV's
    native top header and trading UI are suppressed via
    `disabled_features`; the broker stays wired so price-line overlays
    for open orders/positions draw. Datafeed: `lib/tv-datafeed.ts`.
    Broker: `lib/tv-broker.ts`. ChartBot side panel mounts here when
    `AI_CHAT_ENABLED=true`.
- **Order entry.** `hooks/useOrderTicket.ts` owns all form state
  (symbol/side/type/qty/limit/stop/trail/TIF/ext-hours) plus asset
  lookup, live quote, est notional, validation, and submission.
  Crypto constraints are enforced here: TIF limited to `gtc`/`ioc`;
  no `trailing_stop`; no extended hours; `non_marginable_buying_power`
  used (not `buying_power`) since Alpaca doesn't extend margin for crypto.
  `isCrypto` is detected synchronously via `symbol.includes("/")` so
  constraints apply before the async asset fetch resolves.
  UI surfaces in `components/trade/`: `OrderSheet` (bottom-sheet
  form), `TradeBar` (floating Buy/Sell pill, mounted in every mode),
  `ClosePositionCard`, `ModifyOrderCard`, `ConfirmCard`. The Ask
  anything order intent uses `useOrderTicket` with `skipConfirm: true`.
  **No `window.confirm` in the trade flow.**
- **Backend:** FastAPI + `alpaca-py`. Real code in `backend/app/`;
  `api/index.py` is the Vercel shim. Endpoints under `/api/`: health,
  config, account, bars, quotes, snapshots, stream, orders, positions,
  portfolio/history, pnl-history, activities, clock, calendar, assets, news,
  watchlist, movers, most-active, indices, market-news, crypto/tickers,
  ai/chat, ai/ask (last two gated by `AI_CHAT_ENABLED`; require
  `ANTHROPIC_API_KEY`). `/api/indices` and `/api/market-news` hit
  Yahoo Finance directly via `requests` (no yfinance, no C extensions
  — Python 3.14 safe). `/api/news`, `/api/most-active`, `/api/assets`
  are still served but only consumed by the AI tool loop — don't
  delete them.
  **Path params with slashes:** `/api/assets/{symbol:path}`,
  `/api/positions/{symbol:path}`, and `/api/watchlist/{symbol:path}`
  use FastAPI's `:path` converter so `BTC/USD` passes through without
  breaking routing. Frontend never calls `encodeURIComponent` on symbol
  path segments (symbols are `[A-Z0-9/.]` only).
  **Account fields:** `get_account()` returns `buying_power` (may
  include margin) and `non_marginable_buying_power` (cash-only; correct
  figure for crypto trades). Use the latter in crypto contexts.
  **Crypto symbol/silo helpers (single source of truth):** `alpaca/client.py`
  owns `is_crypto`, `normalize_crypto_symbol` (re-slash `BTCUSD`→`BTC/USD`,
  longest-first `USDT`/`USDC`/`USD`), and `coerce_silo` (anything ≠ `"crypto"`
  → `"stocks"`). Re-slashing and silo coercion happen *only* here — don't
  re-implement them inline. Frontend mirror: `lib/asset-class.ts`
  (`isCryptoSymbol`/`isCryptoPosition`/`isCryptoOrder`).
  **Positions:** `_position_dict` normalises crypto symbols via
  `normalize_crypto_symbol` (Alpaca strips the slash in its positions
  endpoint) and includes `asset_class`. Use `asset_class === "crypto"`
  — not `symbol.includes("/")` — to filter positions. `_position_dict`
  also exposes `unrealized_intraday_pl` (silo day-P/L source); `PositionOut`
  and `OrderOut` both carry `asset_class` (they used to strip it, so the
  per-silo filters had been quietly surviving on the `/` fallback).
  **Per-silo P/L curve:** Alpaca has no per-asset-class portfolio history,
  so `alpaca/pnl.py` (`/api/pnl-history`) rebuilds it from FILL activities
  (FIFO lots → realized P/L) valued against historical daily closes; the
  curve is anchored on open-position cost (deposits ignored) and its live
  tip uses current position market value.
- **Data feed:** IEX (free, ~2-3% of volume). `sip` (paid) via
  `ALPACA_DATA_FEED` env — no code change.
- **Streaming:** `backend/app/stream.py` holds two hub singletons:
  `hub` (`QuoteHub` — Alpaca `StockDataStream`) and `crypto_hub`
  (`CryptoQuoteHub` — Alpaca `CryptoDataStream`). Both follow the same
  fan-out SSE pattern. `/api/stream` detects `all("/" in s for s in syms)`
  and routes to the appropriate hub. The watchlist **auto-falls-back to
  polling `/api/quotes`** when the stream is unreachable — load-bearing.
  See `docs/landmines.md` for buffering, `VITE_STREAM_BASE`, and CORS
  details.
- **Watchlists:** Two named Alpaca watchlists per account — `"primary"`
  (stocks) and `"primary-crypto"` (crypto, seeded with BTC/ETH/SOL).
  All three `/api/watchlist` routes accept `?asset_class=crypto` to
  target the crypto list (run through `coerce_silo`). `/api/pnl-history`
  uses the same two-state silo param and echoes the resolved
  `asset_class` in `PnlHistoryOut`. **`/api/assets` is different** — a
  three-state asset-universe filter (`""`=all / `us_equity` / `crypto`)
  the AI `find_symbol` path relies on; don't fold it into `coerce_silo`.
- **PWA:** `vite-plugin-pwa`. NetworkFirst for API, CacheFirst for
  static; charting library excluded from precache.
- **Persistence:** Backlogged Postgres (Supabase/Neon). Today Alpaca
  is queried directly; UI prefs in `localStorage`.
- **Styling:** Tailwind + a Calm v2 oklch token set in
  `frontend/src/index.css` (light default, dark under
  `html[data-theme="dark"]`, switched by `hooks/useTheme.ts` with a
  synchronous bootstrap in `index.html` — don't delete that script or
  every load flashes). Tokens exposed as utilities in
  `tailwind.config.js`. Fonts: Inter + IBM Plex Mono.

## localStorage keys (single-user app)

| Key | Writer | Read by | Notes |
| --- | ------ | ------- | ----- |
| `asset_class_mode` | `App.tsx` | `App.tsx` | `"stocks" \| "crypto"`. Last-used silo, used only to highlight the landing card / seed the toggle. The landing picker shows on every load regardless. |
| `theme` | `hooks/useTheme.ts` + `index.html` bootstrap | both | `"light" \| "dark"`. Defaults to OS preference. |
| `chartbot_session` | `useChatSession` | `useChatSession` | Serialised turns + apiHistory, capped at 256 KB. |
| `ai_drawings_v1` | `tv-drawings.ts` | `tv-drawings.ts` | Per-symbol drawing UUIDs replayed on chart load. |
| `chart_blotter_collapsed` | `ChartBlotter` | `ChartBlotter` | `"1"` collapsed. |
| `market_summary_v1` / `crypto_market_summary_v1` | `useMarketSummary` | `useMarketSummary` + Ask-anything summary card | Per-silo cached AI market summary (window, date, content). |
| `app_settings_v1` | `lib/settings.ts` | `useSettings` + `SettingsMenu` | JSON-encoded `AppSettings`. Today: `cmdbarAiEnabled` (default `true`). |

Watchlists are not in localStorage — server-side via `/api/watchlist`.

## Three deploy targets (do not conflate)

1. **Vercel — production**, from `main` only, via
   `.github/workflows/deploy-prod.yml` (`vercel deploy --prod`).
   Serves frontend **and** serverless REST API. Vercel's Git
   integration is intentionally disabled (`vercel.json`
   `git.deploymentEnabled=false`) — do not re-enable.
2. **Render — always-on relay**, from `render.yaml` (Blueprint),
   single Docker instance from `backend/Dockerfile`. Built from the
   **repo-root context** (`dockerContext: .`) so the image ships the
   root `VERSION` file the backend reads at startup; a root
   `.dockerignore` keeps that context lean (must exclude `frontend/`).
   The *only* host that can hold the Alpaca WebSocket open for
   `/api/stream`. Never run >1 instance — `QuoteHub` and
   `CryptoQuoteHub` are process-local with no external pub/sub. See
   `docs/landmines.md`.
3. **GitHub Pages — dev previews**, via `preview-pages.yml`. Static
   frontend only; talks to the Vercel prod backend. Auto-publishes to
   `gh-pages` on every `claude/**` push. Cannot trigger a Vercel
   deploy.

## Two AI surfaces (teal Ask anything vs violet ChartBot)

Accent colour is the tell: **teal = local intent parser** (free,
instant); **violet = real Claude API call** (Anthropic credits, slow).

- **Ask anything module** (`components/cmd/`, all modes). Opened by the
  "Ask anything" pill or a global `Cmd+K` / `Ctrl+K` listener in
  `App.tsx`. `lib/cmd-intent.ts` runs a regex/keyword chain and
  returns one of 9 typed intents (`order`, `close`, `portfolio`,
  `movers`, `news`, `orders`, `chart`, `market_summary`, `fallback`);
  each renders a `CmdResultCard` composing existing hooks. **Silo-aware:**
  `CmdBar` takes the active `assetClass`; `parseIntent(text, assetClass)`
  recognises crypto pairs (`BTC/USD`) and normalises bare coins → `COIN/USD`
  in the crypto silo, and the cards behave per silo (portfolio/news/movers
  filter to the silo; crypto movers are derived client-side from the crypto
  tickers since Alpaca has no crypto screener). `fallback` intents
  optionally POST to `/api/ai/ask` (gated by `cmdbarAiEnabled` in
  `app_settings_v1`, default on; trimmed tool set —
  `read_only_tools()` in `backend/app/ai/tools.py`; the active `asset_class`
  is sent so the model steers to the right symbols/news). The fallback bot
  defaults to the active silo but **can** answer cross-silo / whole-account
  questions on request — `get_positions`/`get_orders`/`get_account` are
  whole-account, and `get_watchlist`/`find_symbol` take an `asset_class`
  arg to target the other silo; the system context tells it not to pull the
  other silo proactively. It also has **action tools** (Ask-anything only,
  not ChartBot): `add_to_watchlist`/`remove_from_watchlist` (bulk, validate
  tradability first — themed lists like "top 10 pharma" come from model
  knowledge, with `web_search` for current/ranked lists) and
  `generate_report` (positions/orders/activities/pnl → CSV) and `export_csv`
  (any other readable data — bars/quotes/news/custom tables — the model fetches
  then passes as rows). Both surface as a download via `AskResponse.reports`;
  CSVs are built in `backend/app/ai/reports.py`. These live in `ask_tools()`,
  not `TOOLS`. **Tool schemas are split across `ai/tools_read.py` (backend),
  `ai/tools_draw.py` (frontend), and `ai/tools_action.py` (Ask-anything
  write/report); `ai/tools.py` is the assembler that builds `TOOLS` (read then
  draw — order is load-bearing for prefix-cache hits) and re-exports the public
  API (`TOOLS`/`read_only_tools`/`ask_tools`/…). Edit schemas in the split
  files; never reorder `TOOLS`.** Multi-turn within a session:
  `CmdBar` keeps a running `apiHistory` and sends prior fallback Q&A as
  `history` so follow-ups have context; it's session-only (reset on close).
- **AI market summary** (`hooks/useMarketSummary.ts` + `MarketSummaryCard`,
  Discover hero). Auto-generates a per-window summary via `/api/ai/ask`
  (real Claude call; same gating as above). Per silo: **stocks** uses US
  market windows (open/midday/close EST) and US headlines; **crypto** uses
  four 6-hour UTC windows and BTC/crypto news. Cached per silo
  (`market_summary_v1` / `crypto_market_summary_v1`); the `market_summary`
  intent card reads the matching cache.
- **ChartBot side panel** (`components/chat/`, Chart mode only, gated
  by `AI_CHAT_ENABLED`). 380px violet right-edge panel. Hybrid
  tool-use loop in `backend/app/ai/router.py`: backend-executed read
  tools run server-side; frontend-executed chart tools (drawings,
  studies, symbol/resolution, screenshots, order viz) declared in the
  same `tools.py` schema but dispatched in `lib/ai-client.ts` against
  `lib/tv-drawings.ts`, with results folded into the next round (up
  to 10 outer rounds). Session persists to `chartbot_session` under a
  256 KB budget. System prompt + tool schemas are cache-marked for
  Anthropic prefix cache hits — keep the markers.

Tunables: `AI_CHAT_ENABLED`, `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`
(default `claude-sonnet-4-6`), `AI_MAX_TOKENS` (4096),
`AI_MAX_TOOL_ITERATIONS` (16), `AI_WEB_SEARCH_ENABLED` (default `false` —
Anthropic hosted web_search for the Ask anything bot; requires the org to
have web search enabled or the API 400s. The bot is internal-first and
self-heals: if web search is on but unsupported it drops the tool and
retries from its own tools/knowledge). 60s Anthropic client timeout;
auth/config errors surface as 503.

## Dual requirements.txt trap

`backend/requirements.txt` is for local dev and Render. **Root
`requirements.txt`** is what Vercel's Python builder reads for `api/`.
Any new dep must land in **both** or prod 500s on first import. CI
(`check-requirements-sync` in `lint-backend.yml`) fails on divergence;
`uvicorn` is intentionally backend-only and excluded.

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

Vite proxies `/api` → `:8000`. Typecheck the frontend with
`npx tsc -b` before committing UI changes.

## Code conventions

- Minimal comments — explain *why*, never *what*. No new abstractions
  or backwards-compat shims beyond what a task needs.
- Keep the polling fallback and graceful 503s (unconfigured Alpaca
  keys) intact across all data endpoints.
- Don't put model identifiers in commits/PRs/code.
- Don't open PRs unless explicitly asked. `gh-pages` is auto-generated
  by the preview workflow — never hand-edit.
