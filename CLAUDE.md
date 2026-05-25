# CLAUDE.md

Guidance for working in this repo. Read in full before changing deploy
config, dependencies, or the streaming path. Companion docs:
`README.md` (setup & deployment), `BACKLOG.md` (deferred work),
`docs/landmines.md` (Vercel-Python / TradingView / streaming details
that took several iterations to land — don't undo them),
`docs/workspace.md` (Workspace mode + module pattern), `docs/ai.md`
(the two AI surfaces), `docs/database.md` (Postgres asset catalogue).

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
  P/L colours are untouched. The header pill switches between four modes
  (session-only — not persisted; **Workspace** is desktop-only):
  - **Discover** (default) — one parameterized surface, `DiscoverPage.tsx`
    (`assetClass` prop), sharing the hero / AI summary / watchlist / inline
    chart / news scaffold across both silos and branching only where they
    differ. Silo-specific data hooks are gated with `enabled` so the inactive
    silo never fetches. Watchlist sparkline cards and the crypto ticker render
    the **live stream price** (`useLiveQuotes` quote mid) over the snapshot's
    `prev_close` (the daily-change baseline) — matching the chart and the
    Workspace Watchlist widget; the REST snapshot/ticker calls now seed only
    `prev_close`.
    - *Stocks*: holdings + allocation hero (stock positions
      only; `BalanceCard` headline is silo holdings, with silo day P/L and
      stock buying power — no shared cash), indices marquee ticker,
      watchlist sparkline cards, inline chart, gainers/losers tabbed card
      (with most-active volume), **earnings calendar**
      (`discover/EarningsCard.tsx`, paginated 10/page), **economic calendar**
      (`discover/EconomicCard.tsx`, US high/medium-impact, day-paginated —
      defaults to today, falls back to the next day with events), market news.
      Both pagers share `discover/CardPager.tsx`.
    - *Crypto*: crypto price marquee ticker (`discover/CryptoTicker.tsx`),
      holdings + allocation hero (crypto positions only;
      `non_marginable_buying_power`), crypto watchlist sparkline cards,
      inline chart, BTC news feed. No movers/most-active (Alpaca has no
      crypto screener).
  - **Portfolio** — `PortfolioHero` (siloed: silo holdings + day P/L +
    unrealized + a reconstructed **net P/L curve** from `/api/pnl-history`)
    + `Positions` (strip variant, filtered by asset class) + `Orders`
    (filtered) + `Activities`. `TopBar` status strip mounts in every mode
    (Discover, Portfolio, Chart). `TopBar` is silo-aware (`assetClass` prop
    from `App.tsx`): in **stocks** mode it shows the Alpaca market clock
    (OPEN/CLOSED + next-edge time) and `buying_power`; in **crypto** mode it
    shows a static `OPEN · 24/7` indicator (the Alpaca clock is equities-only)
    and BP shows `non_marginable_buying_power`.
  - **Chart** — `TVPlatform.tsx` wraps the full TradingView Charting
    Library (`frontend/public/charting_library/`, committed — private
    repo only) in our own chrome: `ChartTopBar`, `IndicatorPillsRow`,
    `ChartBlotter` (filtered by asset class), floating `TradeBar`. TV's
    native top header and trading UI are suppressed via
    `disabled_features`; the broker stays wired so price-line overlays
    for open orders/positions draw. Datafeed: `lib/tv-datafeed.ts`.
    Broker: `lib/tv-broker.ts`. ChartBot side panel mounts here when
    `AI_CHAT_ENABLED=true`.
  - **Workspace** (desktop only — hidden on mobile) — a dockable widget
    canvas on Dockview (`components/Workspace.tsx` + `lib/workspace/`):
    per-silo layout persistence, link-channel widgets (None +
    Main/blue/green/amber), named layout presets plus user-saved layouts
    ("Save current as…"), and an Ask-anything
    control path. Goes full-bleed and drops the `TopBar` equity strip
    (account figures live in the Account widget). **Full detail — widget
    catalogue, channels, toolbar, panel-size fit, and the module-reuse
    pattern — is in `docs/workspace.md`.**
- **Mobile / responsive (≤ 640px).** A single `useMobile()` hook
  (`hooks/useMobile.ts`, `matchMedia("(max-width: 640px)")`) gates the
  phone layouts; it mirrors the CSS `@media (max-width: 640px)` breakpoint
  exactly. **Desktop / iPad (> 640px) render unchanged** — every mobile
  branch is additive, never a replacement. The header swaps to a slim
  sticky `MobileHeader` (☰ + mode title + `✦` Ask, second row of mode
  pills + asset toggle) with a left slide-in `MobileNavDrawer` (theme +
  AI toggle + Account hub); `TopBar` collapses to a one-row status strip
  whose equity chip opens a balance bottom sheet. Tabular surfaces
  (`Positions`/`Orders`/`Activities` and the chart blotter) render stacked
  **card lists** instead of tables. Chart mode goes full-bleed
  (`100dvh`-based height) with a horizontally-scrolling `ChartTopBar`
  (`⋯` overflow popover for type/indicators), and the ChartBot panel
  becomes a floating **violet launcher + slide-up sheet** (the header `✦`
  stays Ask-anything — teal — in every mode). `OrderSheet` and the
  Ask-anything `AskBar` go full-screen with safe-area-padded sticky
  footers; `TradeBar` and the watchlist add-sheet clear the home
  indicator. Mobile tokens (`--mob-*`, `--safe-*`) live in `index.css`;
  `--mob-hero-value` is deliberately scoped to the media query, not
  `:root` (see `docs/landmines.md`).
- **Order entry.** `hooks/useOrderTicket.ts` owns all form state
  (symbol/side/type/qty/limit/stop/trail/TIF/ext-hours, plus a
  shares-vs-dollars `amountMode` → `notional`) plus asset lookup, live
  quote, est notional, validation, and submission.
  Crypto constraints are enforced here: order types limited to
  `market`/`limit`/`stop_limit` (no plain `stop`, no `trailing_stop`);
  TIF limited to `gtc`/`ioc`; no extended hours;
  `non_marginable_buying_power` used (not `buying_power`) since Alpaca
  doesn't extend margin for crypto. **Dollar (notional) entry** is offered
  on market/limit orders for **fractionable** assets only — equities force
  TIF=`day` (Alpaca caps notional/fractional at day, no ext-hours), crypto
  keeps `gtc`/`ioc`; the toggle reads "Units" in the crypto silo.
  **Extended hours** is allowed on limit + `day`/`gtc`. All of these are
  **frontend-only guards** — the backend write path applies no asset-class
  gating, so direct API callers can bypass them.
  `isCrypto` is detected synchronously via `symbol.includes("/")` so
  constraints apply before the async asset fetch resolves. Notional orders
  come back with `qty: null` (executed size lands in `filled_qty`); the
  Orders blotter falls back to `filled_qty`/`notional` for its Qty/Value
  columns.
  UI surfaces in `components/trade/`: `OrderSheet` (bottom-sheet
  form), `TradeBar` (floating Buy/Sell pill, mounted in every mode),
  `ClosePositionCard`, `ModifyOrderCard`, `ConfirmCard`. The Ask
  anything order intent uses `useOrderTicket` with `skipConfirm: true`.
  **No `window.confirm` in the trade flow.**
- **Backend:** FastAPI + `alpaca-py`. Real code in `backend/app/`;
  `api/index.py` is the Vercel shim. Endpoints under `/api/`: health,
  config, account, bars, quotes, snapshots, stream, orders, positions,
  portfolio/history, pnl-history, activities, clock, calendar,
  calendar/earnings, calendar/earnings/{symbol}, calendar/economic, assets,
  asset-profile, news, watchlist, movers, most-active, indices,
  market-news, crypto/tickers, ai/chat, ai/ask (last two gated by
  `AI_CHAT_ENABLED`; require `ANTHROPIC_API_KEY`). `/api/indices` and
  `/api/market-news` hit Yahoo Finance directly via `requests` (no yfinance,
  no C extensions — Python 3.14 safe). `/api/calendar/{earnings,economic}`
  are **FMP-backed**, live-proxied with an in-process cache (`calendar_fmp.py`,
  the indices/market-news pattern — never persisted, no scheduler); they need
  no Alpaca keys and return `[]` when `FMP_API_KEY` is unset. The earnings
  calendar curates the noisy whole-market feed by **market cap**
  (`db.market_cap_map()`) but always unions the user's positions / open orders /
  watchlist symbols (passed as `?include=`); when the DB is unreachable it
  degrades to those `include` symbols only. FMP economic times are **UTC**. `/api/news` and `/api/most-active` are
  served but only consumed by the AI tool loop — don't delete them. `/api/assets`
  (search) and `/api/assets/{symbol}` are **DB-backed** off the catalogue (clean
  enum values, sector/logo/market_cap; Alpaca fallback) and power the watchlist
  autocomplete, chart search, and the bot's `find_symbol`. `/api/asset-profile/
  {symbol}` (sibling path — *not* the removed `/api/assets/{symbol}/profile`)
  returns the full enrichment row (`db.get_asset_profile`, NULLs dropped — now
  including the FMP **annual-fundamentals** columns) that powers the Workspace
  **Profile** and **Fundamentals** widgets. The Postgres **asset
  catalogue** is filled by three Render-only dev seeders — `POST
  /api/_dev/seed-assets` (Alpaca base + CoinGecko crypto), `POST
  /api/_dev/enrich-stocks` (FMP stock profile), and `POST
  /api/_dev/enrich-fundamentals` (FMP annual statements → P/E, margins, ROE,
  dividend, 5yr revenue/net-income trend; small `?limit=` chunks — 3 calls/symbol)
  — see "Asset catalogue" below and `docs/database.md`.
  **Path params with slashes:** `/api/assets/{symbol:path}`,
  `/api/asset-profile/{symbol:path}`, `/api/positions/{symbol:path}`, and
  `/api/watchlist/{symbol:path}`
  use FastAPI's `:path` converter so `BTC/USD` passes through without
  breaking routing. Frontend never calls `encodeURIComponent` on symbol
  path segments (symbols are `[A-Z0-9/.]` only).
  **Account fields:** `get_account()` returns `buying_power` (may
  include margin) and `non_marginable_buying_power` (cash-only; correct
  figure for crypto trades). Use the latter in crypto contexts. It also
  exposes `short_market_value`, `initial_margin`, `maintenance_margin`,
  `daytrading_buying_power`, and `regt_buying_power` (all `float(x or 0)`
  -guarded; mostly ~0 in a paper account).
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
  the watchlist/chart search and the AI `find_symbol` path rely on; don't fold
  it into `coerce_silo`. It's DB-backed (`db.search_assets`) and applies the
  **visibility rule** — only `tradable` + enriched rows show in search (see
  "Asset catalogue").
- **PWA:** `vite-plugin-pwa`. NetworkFirst for API, CacheFirst for
  static; charting library excluded from precache.
- **Persistence:** Postgres (Supabase) backs the **asset catalogue** — a
  single `assets` table holding the full Alpaca universe (~13.8k us_equity +
  crypto rows) plus per-source enrichment. Pure-Python `pg8000`
  (3.14/Vercel-safe), per-op connections from `DATABASE_URL`, graceful
  `DbUnavailable` → 503-style fallback when unset. The table is created by
  `backend/sql/002_assets.sql`, run **once** in the Supabase SQL editor (no
  auto-create). Writes only run from prod/Render (Postgres :5432 is firewalled
  from the sandbox + the owner's laptop). Everything else (trade journal,
  server-side watchlists, finer P/L history) is still direct-Alpaca +
  `localStorage` — backlogged. See `docs/landmines.md` → "Asset catalogue"
  and `docs/database.md`.
- **Asset catalogue:** one `assets` table; each row's `asset_class` drives its
  enrichment source (no mixing). Base identity comes from Alpaca
  (`get_all_assets_for_seed` → `db.bulk_upsert_assets`); crypto enrichment from
  CoinGecko (`coingecko.py` — keyless or the `COINGECKO_API_KEY` Demo key,
  static base-ticker→id map); stock enrichment from FMP's **stable** profile
  endpoint (`fmp.py` — single-symbol on the paid **Starter** tier, 300/min, same
  key; no 250/day free cap. `profile-bulk` + the constituent lists need a higher
  tier still — 402 on Starter). Both seeders are resumable (skip already-enriched);
  `enrich-stocks` takes an explicit `?symbols=` list or `?limit=N` to backfill
  the next N un-enriched stocks (options-listed first). **Visibility rule:**
  `db.search_assets` only returns `tradable` + enriched rows, so the un-enriched
  long tail (SPAC shells, warrants, dead OTC) stays out of discovery and
  enrichment status doubles as the curation filter — enrich a symbol and it
  becomes searchable. Search-only; direct resolution (`get_asset`, Alpaca
  fallback) and user-referenced data (positions/watchlist/charts) are never
  filtered. See `docs/database.md`.
- **Styling:** Tailwind + a Calm v2 oklch token set in
  `frontend/src/index.css` (light default, dark under
  `html[data-theme="dark"]`, switched by `hooks/useTheme.ts` with a
  synchronous bootstrap in `index.html` — don't delete that script or
  every load flashes). Tokens exposed as utilities in
  `tailwind.config.js`. Fonts: Inter + IBM Plex Mono. Mobile layout
  tokens (`--mob-*`) and safe-area insets (`--safe-*`) are appended in the
  same file; `index.html` sets `viewport-fit=cover` so the insets resolve.
- **Number formatting** (`frontend/src/lib/format.ts`): `money(n)` is
  the stock/dollar formatter (2 decimal places, USD locale). Crypto
  prices must use `fmtCryptoPrice(n)` — a magnitude ladder (≥$1 → 2 dec,
  ≥$0.01 → 4 dec, ≥$0.0001 → 6 dec, else 8 dec). Alpaca sets
  `price_increment=1e-9` uniformly across all crypto pairs so per-asset
  precision is not available; the ladder is the correct approach.
  `fmtCryptoPrice` is used in `CryptoTicker`, `SparkCard` (via
  `isCrypto` prop), and `Positions` price/avg columns.

## Workspace module pattern (reuse strategy)

Surfaces that may live in more than one place follow a strict three-layer
split: **engine** (hooks/data/types, no UI) → **feature component**
(presentational, location-agnostic, props in / callbacks out, lives in
`components/`, knows **nothing** about the Workspace) → **Workspace adapter**
(`lib/workspace/registry.tsx`, the only layer that knows Dockview, link
channels, and `LinkHeader`). A feature component importing from
`lib/workspace/` or calling `useWorkspace()` is a smell. Evolve shared
components with **additive, default-off props** — never change a default for a
new surface. Full rules, precedents, and examples: `docs/workspace.md` →
"Module pattern".

## localStorage keys (single-user app)

| Key | Writer | Read by | Notes |
| --- | ------ | ------- | ----- |
| `asset_class_mode` | `App.tsx` | `App.tsx` | `"stocks" \| "crypto"`. Last-used silo, used only to highlight the landing card / seed the toggle. The landing picker shows on every load regardless. |
| `theme` | `hooks/useTheme.ts` + `index.html` bootstrap | both | `"light" \| "dark"`. Defaults to OS preference. |
| `chartbot_session` | `useChatSession` | `useChatSession` | Serialised turns + apiHistory, capped at 256 KB. |
| `ai_drawings_v1` | `tv-drawings.ts` | `tv-drawings.ts` | Per-symbol drawing UUIDs replayed on chart load. |
| `chart_blotter_collapsed` | `ChartBlotter` | `ChartBlotter` | `"1"` collapsed. With no stored value, defaults collapsed on mobile (≤640px) and expanded on desktop. |
| `market_summary_v1` / `crypto_market_summary_v1` | `useMarketSummary` | `useMarketSummary` + Ask-anything summary card | Per-silo cached AI market summary (window, date, content). |
| `app_settings_v1` | `lib/settings.ts` | `useSettings` + `SettingsMenu` + `MobileNavDrawer` | JSON-encoded `AppSettings`. Three per-surface AI toggles, each default `false` (opt-in — no Anthropic credits until enabled): `marketSummaryAiEnabled` / `askAiEnabled` / `chartbotEnabled`. When a surface is off it renders a shared `AiDisabledNotice` ("…enable in Settings") instead of calling Claude. |
| `workspace_layouts_stocks_v2` / `workspace_layouts_crypto_v2` | `components/Workspace.tsx` | `components/Workspace.tsx` | Per-silo Workspace layouts — `{ active: { name, layout }, saved: {} }`. `active.layout` is the live Dockview `api.toJSON()`; `active.name` records the last-applied preset (Trader / Researcher / Watcher / Focus). `saved` holds the user's named layouts (the "My layouts" section of the in-canvas Layouts menu — Save current as… / Apply / Rename / Delete); each entry is `{ layout, channels }`, snapshotting both the Dockview JSON and that silo's colour-channel symbols, so Apply restores the arrangement *and* the per-channel tickers. Migrates transparently from the old `workspace_layout_{silo}_v1` (raw layout) on first load after upgrade; the v1 key is then removed. Applying a preset/custom layout clears only `active` (the `saved` map survives). |
| `workspace_channels_v1` | `components/Workspace.tsx` | `components/Workspace.tsx` | Per-silo colour-channel symbols (`{stocks,crypto}` → channel → symbol). Seeded from `CHANNEL_DEFAULTS`; persists header-search picks across reloads. "main" is not stored here (it proxies the app's selected symbol). |

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

Accent colour is the tell: **teal = local intent parser** (free, instant) —
the Ask anything module (`components/ask/` + `lib/ask-intent/`), available in
all modes, with an optional `/api/ai/ask` fallback that adds watchlist/report
and Workspace-control tools. **violet = real Claude API call** (Anthropic
credits, slow) — the Discover AI market summary and the Chart-mode ChartBot
side panel (`backend/app/ai/router.py` hybrid tool loop). All three surfaces
are opt-in via per-surface toggles in `app_settings_v1` (default off; off
renders a shared `AiDisabledNotice`). Tunables: `AI_CHAT_ENABLED`,
`ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`, `AI_MAX_TOKENS`,
`AI_MAX_TOOL_ITERATIONS`, `AI_WEB_SEARCH_ENABLED` (default off). **Full wiring
— tools, the schema split, prefix-cache markers, multi-turn, and per-surface
gating — is in `docs/ai.md`.**

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
