# CLAUDE.md

Guidance for working in this repo. Read in full before changing deploy
config, dependencies, or the streaming path. Companion docs:
`README.md` (setup & deployment), `BACKLOG.md` (deferred work),
`docs/landmines.md` (Vercel-Python / TradingView / streaming details
that took several iterations to land — don't undo them),
`docs/workspace.md` (Workspace mode + module pattern), `docs/ai.md`
(the two AI surfaces), `docs/database.md` (Postgres asset catalogue),
`docs/tipranks.md` (Tipranks research API — endpoint inventory & auth
quirks, not yet wired).

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
  On the **first session only** `AssetClassSplash.tsx` is shown as the
  landing screen, prompting the user to pick **Stocks** or **Crypto**.
  Once a silo is picked, `localStorage('splash_seen_v1')='1'` is set and
  every subsequent load lands straight on the last-used silo's Discover.
  `localStorage('asset_class_mode')` is now **load-bearing** — it
  selects the silo the app boots into (was previously just a last-used
  hint). The header brand button re-opens the splash on demand as the
  **Account Hub**: a whole-account overview (total equity, day P/L,
  buying power, stocks-vs-crypto-vs-cash split) that is intentionally the
  *only* cross-silo balance surface — every other balance view is filtered
  to the active silo. Switching silo also runs through the brand button
  → hub on desktop (the standalone stocks/crypto pill is gone); mobile
  keeps the inline toggle for fast access. Per-silo accent: stocks
  recolours the `--accent` tokens to green (`--pos`), crypto keeps the
  default blue; `--pos`/`--neg` P/L colours are untouched. The header
  pill switches between four modes
  (session-only — not persisted; **Workspace** is desktop-only):
  - **Discover** (default) — one parameterized surface, `DiscoverPage.tsx`
    (`assetClass` prop), sharing the hero / AI summary / watchlist / inline
    chart / news scaffold across both silos and branching only where they
    differ. Silo-specific data hooks are gated with `enabled` so the inactive
    silo never fetches. Watchlist sparkline cards and the crypto ticker render
    the **live stream price** (`useLiveQuotes` quote mid) over the snapshot's
    `prev_close` (the daily-change baseline) — matching the chart and the
    Workspace Watchlist widget; the REST snapshot/ticker calls now seed only
    `prev_close`. The sparkline curve itself is **real recent daily closes**
    fetched once for the whole watchlist via `/api/bars/batch` (`useBarsBatch`,
    5-min refetch) and rendered through a tiny **lightweight-charts** area
    series (`SparkChart` inside `discover/SparkCard.tsx`) for visual parity
    with the Workspace Mini chart's spark tier. While bars are in flight
    the sparkline area is empty (no synthetic-curve fallback — the swap
    onto the LWC chart read as a visible flash); the price + day-% chip
    above the curve still render so cards are never fully blank. Each
    SparkChart overlays a dashed horizontal hairline at `closes[N-2]`
    via LWC's `createPriceLine` — yesterday's daily close, the same
    `prev_close` the day-% chip is measured against — so a sparkline
    trending up against a red day chip (or vice versa) is readable at
    a glance (tip below the line = today is down).
    **Desktop layout is a 2-col grid**: a sticky left **watchlist sidebar**
    (`260px` expanded, collapses to a `32px` chevron strip — state persisted
    in `localStorage('discover_sidebar_collapsed_v1')`) + main column with
    hero / AI summary / inline chart / movers / calendars / news. Clicking
    a sidebar card writes `selected` which drives the inline chart on the
    right. Mobile keeps the linear stacked flow (watchlist as a horizontal
    `CardsRow`, no sidebar).
    - *Stocks*: `DiscoverHero` (single-column silo holdings + ~80px
      area-filled net P/L sparkline from `usePnlHistory` — the allocation
      donut moved to Portfolio as a sibling card), indices marquee ticker,
      watchlist sidebar, inline chart, gainers/losers tabbed card (with
      most-active volume), **earnings calendar**
      (`discover/EarningsCard.tsx`, paginated 10/page; Top / Upcoming
      toggle re-sorts the same rows by market cap desc vs date asc
      client-side, with `sortable` opt-in so the Workspace per-symbol
      view stays chronological), **economic calendar**
      (`discover/EconomicCard.tsx`, US high/medium-impact, day-paginated —
      defaults to today, falls back to the next day with events; rows
      open a Google search for the event name in a new tab — FMP ships
      no per-event URL and the obvious data-publisher search pages
      don't map cleanly to FMP's event strings), market news.
      Both pagers share `discover/CardPager.tsx`.
    - *Crypto*: crypto price marquee ticker (`discover/CryptoTicker.tsx`),
      same single-column `DiscoverHero` (crypto holdings + curve),
      watchlist sidebar, inline chart, BTC news feed. No movers/most-active
      (Alpaca has no crypto screener).
  - **Portfolio** — Unified `PortfolioHero` (siloed: silo holdings on the
    left with the **net P/L curve** from `/api/pnl-history` + day chip,
    plus a 2-col stat grid on the right — stocks show Cash · BP · Net
    equity · Total P/L · Open orders; crypto drops Cash since BP already
    *is* the cash for crypto and shows BP · Total P/L · Open orders) +
    `AllocationDonut` sibling card (donut + legend, sorted biggest slice
    first; rendered via the shared `components/AllocationDonut.tsx`
    extracted from the old DiscoverHero — Portfolio is the spec'd home
    for the donut, Discover is now market discovery only) +
    promoted `Positions` block (`SectionHeading size="lg"`) + a 2-col
    `Orders` + `Activities` row beneath. Clicking a Positions row
    switches to Chart mode for that symbol (was: just repopulated the
    bottom TradeBar). On mobile the hero collapses
    to a single column: holdings number + curve on top, hairline, 3-col
    mini-stats below. The desktop two-row header (chrome row + `TopBar`
    status strip) is gone — its content folded into a single
    grid-`auto 1fr auto` header in `App.tsx` (Identity · Mode · Account
    & actions). `HeaderStatusInline` + `HeaderEquityReadout` live in
    `TopBar.tsx` as exports; `TopBar` itself returns null on every
    viewport, with the mobile chrome + status merged into
    `MobileHeader`. The market clock surfaces stocks-only (Alpaca clock
    is equities-only); crypto shows a static `Open · 24/7`. BP no longer
    surfaces in any header — it lives in the hero (`buying_power` for
    stocks, `non_marginable_buying_power` for crypto).
  - **Chart** — `TVPlatform.tsx` wraps the full TradingView Charting
    Library (`frontend/public/charting_library/`, committed — private
    repo only) using **TV's native chrome**: the native header (symbol
    search, resolutions, chart type, indicators, settings, …) and the
    native **Account Manager** (positions / orders / account blotter —
    enabled but **collapsed by default** via disabling
    `open_account_manager`). Only TV's trade-*initiation* UI is
    suppressed in `disabled_features` (`order_panel`, `buy_sell_buttons`,
    `broker_button`, plus `header_saveload` — no charts-storage backend);
    trade entry runs through the floating `TradeBar` + `OrderSheet`, so
    the crypto constraints and confirm flow are enforced. The broker
    stays wired so price-line overlays for open orders/positions draw.
    On desktop the chart fills the viewport (`.app.app-chart` flex
    column) at the same height as the `ChatPanel`. Datafeed:
    `lib/tv-datafeed.ts`. Broker: `lib/tv-broker.ts`. ChartBot side panel
    mounts here when `AI_CHAT_ENABLED=true`.
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
  branch is additive, never a replacement. The header is a single merged
  sticky `MobileHeader`: row 1 carries ☰ · page name + inline `● Open ·
  until 16:00` micro-status (or `Open · 24/7` for crypto) · equity-pill
  (opens the existing balance sheet); row 2 keeps mode pills + the silo
  toggle. The previous mobile status strip (`MobileStatusStrip` under
  `TopBar`) is gone — its content folded into row 1. ✦ Ask is a
  floating 48 px launcher in the **bottom-left** corner (matches the
  ChartBot violet launcher's position in Chart mode for a consistent
  reach target); it's suppressed in Chart mode itself so the two
  launchers don't pile up. `MobileNavDrawer` (left slide-in,
  hamburger-driven) carries the theme toggle, AI toggles, Account hub
  link, and a Disable-service-worker shortcut. Tabular surfaces
  (`Positions`/`Orders`/`Activities`) render stacked **card lists**
  instead of tables. Chart mode goes full-bleed (`100dvh`-based height)
  using TV's native header, and the ChartBot panel becomes a
  bottom-left **violet launcher + slide-up sheet**. `OrderSheet` and the
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
  UI surfaces in `components/trade/`: `OrderSheet.tsx` (shell +
  desktop body), `OrderSheetMobile.tsx` (mobile body),
  `orderSheetParts.tsx` (shared `Chip`/`Stepper`/`AmountToggle`/
  `DollarInput`/`MobileHalfSheet`/`segStyle`/`TYPE_LABEL`/`TIF_LABEL`).
  The default export of `OrderSheet.tsx` still picks mobile vs desktop
  via `useMobile()`, and it re-exports the parts so legacy
  `from "./OrderSheet"` imports keep working. The mobile and desktop
  bodies share the same `useOrderTicket` instance so business logic is
  not duplicated. Other trade surfaces: `TradeBar` (floating Buy/Sell
  pill, mounted in every mode), `ClosePositionCard`, `ModifyOrderCard`,
  `ConfirmCard`. The Ask anything order intent uses `useOrderTicket`
  with `skipConfirm: true`. **No `window.confirm` in the trade flow.**
  The Orders blotter's cancel-all also runs inline (toolbar row swap)
  rather than via a modal `ConfirmCard`.
- **Backend:** FastAPI + `alpaca-py`. Real code in `backend/app/`;
  `api/index.py` is the Vercel shim. Endpoints under `/api/`: health,
  config, status, account, bars, bars/batch, quotes, snapshots, stream, orders, positions,
  portfolio/history, pnl-history, activities, clock, calendar,
  calendar/earnings, calendar/earnings/{symbol}, calendar/economic,
  research/trending, research/smart-score/{symbol},
  research/sentiment/{symbol}, research/analysts/{symbol},
  research/hedge-funds/{symbol}, research/insiders/{symbol},
  research/related-tickers/{symbol},
  research/holder-demographics/{symbol}, assets, asset-profile, news,
  watchlist, movers,
  most-active, indices, market-news, crypto/tickers, ai/chat, ai/ask (last two gated by
  `AI_CHAT_ENABLED`; require `ANTHROPIC_API_KEY`). `/api/indices` and
  `/api/market-news` hit Yahoo Finance directly via `requests` (no yfinance,
  no C extensions — Python 3.14 safe). `/api/calendar/{earnings,economic}`
  are **FMP-backed**, live-proxied with an in-process cache (`calendar_fmp.py`,
  the indices/market-news pattern — never persisted, no scheduler); they need
  no Alpaca keys and return `[]` when `FMP_API_KEY` is unset. The earnings
  calendar curates the noisy whole-market feed by **market cap**
  (`db.market_cap_map()`) but always unions the user's positions / open orders /
  watchlist symbols (passed as `?include=`); rows arrive sorted by market cap
  desc (the frontend's "Top" mode — "Upcoming" re-sorts by date asc client-side
  off the same array). When the DB is unreachable it degrades to those `include`
  symbols only. FMP economic times are **UTC**. `/api/news` and `/api/most-active` are
  served but only consumed by the AI tool loop — don't delete them. `/api/assets`
  (search) and `/api/assets/{symbol}` are **DB-backed** off the catalogue (clean
  enum values, sector/logo/market_cap; Alpaca fallback) and power the watchlist
  autocomplete, chart search, and the bot's `find_symbol`. `/api/asset-profile/
  {symbol}` (sibling path — *not* the removed `/api/assets/{symbol}/profile`)
  returns the full enrichment row (`db.get_asset_profile`, NULLs dropped — now
  including the FMP **annual-fundamentals** columns) that powers the Workspace
  **Profile** and **Fundamentals** widgets. The Postgres **asset
  catalogue** is **onboarded** by the Render-only `POST /api/_dev/seed-assets`
  (Alpaca base + CoinGecko crypto), then kept fresh by three Render-only,
  background, per-widget **refresh routines** — `POST
  /api/_dev/refresh-profile-stocks` (FMP `/profile`), `POST
  /api/_dev/refresh-profile-crypto` (CoinGecko), and `POST
  /api/_dev/refresh-fundamentals` (FMP annual statements), plus aggregate flows
  `POST /api/_dev/refresh-all-stocks` (Profile + Fundamentals) and `POST
  /api/_dev/refresh-all-crypto`. Each re-pulls every DB value its card shows for
  already-enriched rows (`?include_missing=true` also onboards new ones);
  fire-and-forget, sensible monthly. Alpaca base/trading-status (tradable,
  active/inactive, options, increments) is refreshed by `POST
  /api/_dev/refresh-alpaca` (background; the only routine touching the
  Alpaca-sourced fields, also onboards new listings); `GET /api/_dev/new-symbols`
  is a fast read-only check for new listings/IPOs not yet in the catalogue. See
  "Asset catalogue" below and
  `docs/database.md`.
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
- **Persistence:** Postgres (Supabase) backs the **asset catalogue** — the
  `assets` table holding the full Alpaca universe (~13.8k us_equity +
  crypto rows) plus per-source enrichment — and a small `app_settings`
  key/value table (the maintenance switch). Pure-Python `pg8000`
  (3.14/Vercel-safe), per-op connections from `DATABASE_URL`, graceful
  `DbUnavailable` → 503-style fallback when unset. Tables are created by
  `backend/sql/002_assets.sql` and `backend/sql/003_app_settings.sql`, each run
  **once** in the Supabase SQL editor (no auto-create). Writes only run from prod/Render (Postgres :5432 is firewalled
  from the sandbox + the owner's laptop). Everything else (trade journal,
  server-side watchlists, finer P/L history) is still direct-Alpaca +
  `localStorage` — backlogged. See `docs/landmines.md` → "Asset catalogue"
  and `docs/database.md`.
- **Maintenance / force-stop switches + version gate:** `/api/status` returns
  `{version, maintenance, message, force_stop, force_stop_message}` (read from
  `app_settings`; fail-open if the DB is unreachable so a blip can't strand
  everyone). The frontend polls it (`useAppStatus` — on mount, on window focus,
  a slow 5-min interval that tightens to 30s while in maintenance). Two switches,
  both gated in `App.tsx`:
  - **`maintenance`** (graceful) → renders `MaintenancePage` and tears down the
    data layer; the status heartbeat keeps polling so clients **auto-return**
    within ~30s when flipped off.
  - **`force_stop`** (terminal boot) → renders the **terminal** `MaintenancePage`
    *and* latches `booted` so `useAppStatus` is disabled — the tab stops **all**
    polling (incl. `/api/status`) and makes zero further requests. It **never
    auto-recovers**; only a manual browser reload returns. Use to truly silence
    misbehaving/lingering clients.

  App.tsx also **self-reloads once** when `status.version` ≠ built
  `__APP_VERSION__` (sessionStorage-guarded), except while `force_stop` is on
  (the boot page must not reload itself). Nothing pushes: clients learn on their
  next poll (≤5 min, instant on focus); both switches only reach clients running
  this gated code. Toggle in the **Supabase SQL editor** (one-time table setup +
  full command reference in `backend/sql/003_app_settings.sql`):
  ```sql
  -- Graceful maintenance (auto-recovers):
  update app_settings set value='on'  where key='maintenance';   -- boot to page
  update app_settings set value='off' where key='maintenance';   -- bring back

  -- Force-stop / terminal boot (manual reload to return):
  update app_settings set value='on'  where key='force_stop';    -- silence clients
  update app_settings set value='off' where key='force_stop';    -- stop re-booting fresh loads
  -- Optional messages: keys 'maintenance_message' / 'force_stop_message'.
  ```
- **Asset catalogue:** one `assets` table; each row's `asset_class` drives its
  enrichment source (no mixing). Base identity comes from Alpaca
  (`get_all_assets_for_seed` → `db.bulk_upsert_assets`); crypto enrichment from
  CoinGecko (`coingecko.py` — keyless or the `COINGECKO_API_KEY` Demo key,
  static base-ticker→id map); stock enrichment from FMP's **stable** profile
  endpoint (`fmp.py` — single-symbol on the paid **Starter** tier, 300/min, same
  key; no 250/day free cap. `profile-bulk` + the constituent lists need a higher
  tier still — 402 on Starter); fundamentals from FMP statements
  (`income-statement`+`cash-flow-statement`+`ratios`, annual). Refresh of any
  card is the background routine for that card (`refresh-profile-stocks` /
  `-crypto` / `refresh-fundamentals`); `?include_missing=true` onboards new rows.
  **Visibility rule:**
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
  `tailwind.config.js`. Tailwind preflight stays **off**
  (`corePlugins.preflight: false`); `frontend/src/app-reset.css` (imported
  after `index.css` in `main.tsx`) carries a minimal element reset —
  zeroes `button`, `ul`/`ol`, `fieldset`, and `h1`-`h6` defaults — so a
  stray bare element doesn't drag in browser chrome next to the
  utility-styled surfaces. A full preflight enable is a deliberate
  post-demo follow-up (would regress hand-styled surfaces that never
  finished the utility migration). Fonts: Inter + IBM Plex Mono. Mobile
  layout tokens (`--mob-*`) and safe-area insets (`--safe-*`) are
  appended in the same file; `index.html` sets `viewport-fit=cover` so
  the insets resolve.
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
| `asset_class_mode` | `App.tsx` | `App.tsx` | `"stocks" \| "crypto"`. **Load-bearing** — the silo the app boots into on subsequent loads (post-splash). Also highlights the active card in the Account Hub. |
| `splash_seen_v1` | `App.tsx` | `App.tsx` | `"1"` once the user has picked a silo from the splash. Subsequent loads skip the splash and land on the `asset_class_mode` silo. Clearing this key restores the first-time landing. |
| `theme` | `hooks/useTheme.ts` + `index.html` bootstrap | both | `"light" \| "dark"`. Defaults to OS preference. |
| `chartbot_session` | `useChatSession` | `useChatSession` | Serialised turns + apiHistory, capped at 256 KB. |
| `ask_session_v1` | `components/ask/AskBar.tsx` | `components/ask/AskBar.tsx` | Ask-anything transcript + apiHistory, capped at 256 KB. Each fallback turn stores its `cachedResp` so a reopen / reload replays the answer without re-billing Anthropic; workspace_actions and watchlist invalidations are **not** re-replayed from cache. Header **Clear** button (visible only when there are turns) wipes the key. Eviction drops the oldest turn (and matching user+assistant pair) when over budget. |
| `ai_drawings_v1` | `tv-drawings.ts` | `tv-drawings.ts` | Per-symbol drawing UUIDs replayed on chart load. |
| `market_summary_v1` / `crypto_market_summary_v1` | `useMarketSummary` | `useMarketSummary` + Ask-anything summary card | Per-silo cached AI market summary (window, date, content). |
| `app_settings_v1` | `lib/settings.ts` | `useSettings` + `SettingsMenu` + `MobileNavDrawer` | JSON-encoded `AppSettings`. Three per-surface AI toggles, each default `false` (opt-in — no Anthropic credits until enabled): `marketSummaryAiEnabled` / `askAiEnabled` / `chartbotEnabled`. When a surface is off it renders a shared `AiDisabledNotice` ("…enable in Settings") instead of calling Claude — except the Discover market summary, which still surfaces its last cached briefing (with an "AI off" hint) when one exists and only falls back to the notice when nothing is cached. |
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
