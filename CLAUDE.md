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
  P/L colours are untouched. The header pill switches between four modes
  (session-only — not persisted; **Workspace** is desktop-only):
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
  - **Workspace** (desktop only — hidden on mobile) — a dockable
    widget canvas (`components/Workspace.tsx` + `lib/workspace/registry.tsx`
    + `lib/workspace/presets.tsx`) built on Dockview (`dockview-react`,
    lazy-loaded): drag-to-dock, tab-stack, float and pop-out panels, per-silo
    layout persistence (`workspace_layouts_{stocks,crypto}_v2` —
    `{ active: { name, layout }, saved: {} }`; a transparent migration from
    the old `workspace_layout_{silo}_v1` runs on first load after upgrade).
    Toolbar: a primary **＋ Add widget** menu (320px `<body>`-portaled popover
    with a search input, grouped sections — Charts / Trade / Market data /
    Activity — and inline single-stroke icons; ↑/↓/Enter/Esc), a live
    **Channels strip** (one chip per symbol channel showing the channel
    symbol + a count of widgets bound to it; click opens `AssetSearch` to
    retarget the channel everywhere), a **Layouts ▾** picker that opens a
    480px popover of named presets (Trader / Researcher / Watcher / Focus —
    see `presets.tsx`; Trader = the old default, applied on first run; Apply
    confirms then clobbers the canvas), a **Tab bars** toggle (per-group
    header via Dockview), and a **Focus** toggle (hides the app header for a
    near-full-screen canvas; `Esc` exits unless a `[role=dialog]` is focused).
    When the canvas has zero panels an empty-state overlay shows ＋ Add
    widget / Browse layouts CTAs that imperatively open the toolbar menus.
    The mode also goes **full-bleed** (`.app.bleed` in `index.css` — no
    max-width/gutters, a full-height flex column so the dock fills the
    viewport) and **drops the `TopBar` equity strip** (account figures live
    in the Account widget).
    Widgets reuse existing surfaces — the primary **Chart** is a **bare**
    TradingView chart (`components/TVChartWidget.tsx`: TV's native chrome only,
    *none* of the `TVPlatform` chrome; account manager off + object tree
    collapsed; a ResizeObserver hides the legend + shrinks the scale font on
    small panels, layering on TV's own autosize); an opt-in **Mini chart**
    offers the lighter lightweight-charts
    `PriceChart` (no iframe, `responsive` prop — sheds chrome + chart axes to
    fit its panel via ResizeObserver, and at the smallest **spark** tier swaps
    the candles for a bare close-price area sparkline) as an extra — the
    "bare-TV-only" rule governs the primary Chart, not this explicit add-on.
    Plus an inline trade
    ticket (`components/trade/OrderTicketInline.tsx` — reuses `useOrderTicket` +
    the OrderSheet inputs; always symbol-linked, no None channel), an **Account**
    widget (`components/AccountPanel.tsx` — curated whole-account overview:
    equity, day P/L, buying power, cash, positions value, portfolio value,
    margin (initial/maintenance), and short value when non-zero), a **Watchlist**
    (`components/Watchlist.tsx` — silo watchlist spark cards; a click writes to
    the widget's channel), positions, orders, activity, news, and an asset
    **Profile** (`components/AssetProfile.tsx` — symbol-linked catalogue
    enrichment off `/api/asset-profile`: fundamentals for stocks (sector,
    market cap, beta, CEO, employees, HQ, IPO, description) and tokenomics for
    crypto (circulating/max supply bar, market-cap rank, ATH/ATL with live
    distance, categories, whitepaper/GitHub links); always symbol-linked like
    Trade — default Main, no None).
    Each widget carries a **link channel** (None + Main/blue/green/amber,
    persisted in the panel's Dockview params): a symbol channel filters the
    widget to that one instrument (Positions/Orders/Activities take a `symbol`
    filter prop, news uses instrument-specific `useNews`); **None** shows
    whole-account info (Trade is symbol-only, no None; the chart widgets allow
    **None as a standalone mode** — the panel owns its symbol via
    `params.symbol` rather than following a shared channel, so a custom layout
    can show many distinct charts beyond the four colour channels; the Account
    widget is `lockedChannel` — always None, picker hidden).
    "Main" proxies the app's selected symbol. The widget header (`LinkHeader`)
    carries a 2px channel-coloured accent bar across the top, a primary mono
    symbol label that doubles as a click-to-search picker (`AssetSearch`),
    and a quiet `kind` label (e.g. `AAPL · Chart`); each panel tab also
    renders a small channel-coloured dot via a custom Dockview
    `tabComponents.default` (`TabWithChannel`, reads `params.channel` —
    seeded on mount by `useChannel`). `useChannel` also reports up to the
    Workspace context so the toolbar Channels strip can count widgets per
    channel (Dockview emits no params-changed event). Live
    quotes and bars are deduped across all widgets through shared ref-counted
    streams (`data/quoteStream.ts`,
    `data/barStream.ts`); `useLiveQuotes` and `lib/tv-datafeed.ts` ride them.
    **Panel-size fit:** charts shed chrome/axes as their panel shrinks (see the
    chart widgets above); Positions/Orders/Activities flip to their stacked
    card layout (and Profile drops its stat grid 2→1 column) in narrow panels
    via `hooks/useContainerNarrow` + an additive
    `dense` prop (panel-width, since `useMobile` is viewport-only and never
    trips in this desktop-only mode; the flip width is tuned per widget by
    column count — Orders 560, Positions 480, Activities 360, Profile 340); the header
    `AssetSearch` portals its
    dropdown to `<body>` so it isn't clipped by the panel. Data widgets render
    **bare** (the `bare` prop on `Orders`/`Activities`/`NewsCard` + the
    `Positions` strip rows) — no per-component card border/shadow, since the
    panel is already a closed-off module; rows separate with a hairline in both
    the table and the narrow stacked-card layouts. Account stays clean by
    construction.
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
  portfolio/history, pnl-history, activities, clock, calendar, assets,
  asset-profile, news, watchlist, movers, most-active, indices,
  market-news, crypto/tickers, ai/chat, ai/ask (last two gated by
  `AI_CHAT_ENABLED`; require `ANTHROPIC_API_KEY`). `/api/indices` and
  `/api/market-news` hit Yahoo Finance directly via `requests` (no yfinance,
  no C extensions — Python 3.14 safe). `/api/news` and `/api/most-active` are
  served but only consumed by the AI tool loop — don't delete them. `/api/assets`
  (search) and `/api/assets/{symbol}` are **DB-backed** off the catalogue (clean
  enum values, sector/logo/market_cap; Alpaca fallback) and power the watchlist
  autocomplete, chart search, and the bot's `find_symbol`. `/api/asset-profile/
  {symbol}` (sibling path — *not* the removed `/api/assets/{symbol}/profile`)
  returns the full enrichment row (`db.get_asset_profile`, NULLs dropped) that
  powers the Workspace **Profile** widget. The Postgres **asset
  catalogue** is filled by two Render-only dev seeders — `POST
  /api/_dev/seed-assets` (Alpaca base + CoinGecko crypto) and `POST
  /api/_dev/enrich-stocks` (FMP stock enrichment) — see "Asset catalogue" below
  and `docs/database.md`.
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

Adding surfaces — Workspace widgets, or anything that may live in more than one
place — follows a strict three-layer split so a module built for one surface is
reusable elsewhere for free:

1. **Engine** — hooks + data + types (`use*`, `data/`, `api`, `types.ts`). Pure
   logic, no UI; shared platform-wide.
2. **Feature component** — presentational and *location-agnostic*: takes
   `symbol` / `assetClass` / callbacks as props and knows **nothing** about the
   Workspace. Lives in `components/`. Examples: `PriceChart`, `TVChartWidget`,
   `OrderTicketInline`, `Positions`, `Orders`, `Activities`, `NewsCard`,
   `AssetProfile`, `AssetSearch`.
3. **Workspace adapter** — `lib/workspace/registry.tsx` (+ `Workspace.tsx`): the
   *only* layer that knows Dockview, link channels, the `LinkHeader`, and
   `useWorkspace`. It wraps a feature component and injects the cross-cutting
   Workspace behaviours (channel symbol, header symbol picker, shared streams).

Rules:

- **Never put Workspace concerns inside a feature component** — no
  `useWorkspace()`, Dockview params, channel logic, or `LinkHeader`. If a feature
  component reaches for `useWorkspace()`, lift that into the adapter. A feature
  component importing from `lib/workspace/` is a smell.
- **Build new modules as a layer-2 component first** (props in, callbacks out)
  even when the Workspace is the only consumer today, then add a ~15-line
  registry wrapper — reuse elsewhere is then just rendering it with props.
  `OrderTicketInline` is the precedent (built for the Workspace, lives in
  `components/trade/`, takes only `{ symbol }`).
- **Evolve shared components with additive, default-off props** — never change a
  shared component's default behaviour for a new surface. Precedents:
  `PriceChart`'s `responsive` (default `false` keeps Discover unchanged), the
  optional `symbol` filter on `Positions`/`Orders`/`Activities`, and the `bare`
  flag on `Orders`/`Activities`/`NewsCard` (+ the `Positions` strip rows) that
  drops the component's own card border/shadow inside a Workspace panel — the
  panel already supplies the chrome, so widgets render borderless with hairline
  row dividers instead. Default `false` keeps Discover/Portfolio boxed.
- **File location signals reusability:** reusable cores live in `components/`;
  anything under `lib/workspace/` is Workspace-coupled by definition — don't park
  a reusable core there.
- The registry is the single catalogue (`widgetId → component`); expose or retire
  a Workspace module there.

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
| `workspace_layouts_stocks_v2` / `workspace_layouts_crypto_v2` | `components/Workspace.tsx` | `components/Workspace.tsx` | Per-silo Workspace layouts — `{ active: { name, layout }, saved: {} }`. `active.layout` is the live Dockview `api.toJSON()`; `active.name` records the last-applied preset (Trader / Researcher / Watcher / Focus). `saved` is reserved for the future "Save current as…" UI. Migrates transparently from the old `workspace_layout_{silo}_v1` (raw layout) on first load after upgrade; the v1 key is then removed. Cleared by applying a preset from the in-canvas Layouts menu. |
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

Accent colour is the tell: **teal = local intent parser** (free,
instant); **violet = real Claude API call** (Anthropic credits, slow).

- **Ask anything module** (`components/ask/`, all modes). Opened by the
  "Ask anything" pill or a global `Cmd+K` / `Ctrl+K` listener in
  `App.tsx`. `lib/ask-intent.ts` runs a regex/keyword chain and
  returns one of 9 typed intents (`order`, `close`, `portfolio`,
  `movers`, `news`, `orders`, `chart`, `market_summary`, `fallback`);
  each renders a `AskResultCard` composing existing hooks. **Silo-aware:**
  `AskBar` takes the active `assetClass`; `parseIntent(text, assetClass)`
  recognises crypto pairs (`BTC/USD`) and normalises bare coins → `COIN/USD`
  in the crypto silo, and the cards behave per silo (portfolio/news/movers
  filter to the silo; crypto movers are derived client-side from the crypto
  tickers since Alpaca has no crypto screener). `fallback` intents
  optionally POST to `/api/ai/ask` (gated by `askAiEnabled` in
  `app_settings_v1`, default off — off renders the `AiDisabledNotice`; trimmed tool set —
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
  CSVs are built in `backend/app/ai/reports.py`. It also has **Workspace control
  tools** (`ai/tools_workspace.py`: `set_workspace_layout`,
  `set_channel_instrument`, `add_workspace_widget`, `remove_workspace_widget`,
  `build_workspace_layout`): these don't run server-side — each *queues a client
  directive* into `AskResponse.workspace_actions` (same deferred-artifact pattern
  as `reports`) which the frontend `FallbackCard` replays against the lazy
  Workspace via the `lib/workspace/controller.ts` singleton (App registers
  mode/silo hooks; Workspace registers an imperative handle on `onReady`). The
  bot can resolve symbols (`find_symbol`/`screen_assets`) then
  `build_workspace_layout` a responsive custom grid ("watch the 7 best tech
  names"); the request carries a `viewport` hint and the app auto-switches into
  Workspace mode (desktop-only). A widget given both a `symbol` and a `channel`
  points that channel at the symbol, so every panel on the channel (chart +
  profile + data) follows — that's how the bot pins distinct instruments (≤4
  channels); channel-linked panels can't take a per-panel symbol otherwise. The same directive shapes back a deterministic
  local `workspace` intent in `lib/ask-intent.ts` (e.g. "watch AAPL NVDA TSLA",
  "trader layout", "set blue to NVDA") — no AI round-trip. These live in
  `ask_tools()`,
  not `TOOLS`. **Tool schemas are split across `ai/tools_read.py` (backend),
  `ai/tools_draw.py` (frontend), `ai/tools_action.py` (Ask-anything
  write/report) and `ai/tools_workspace.py` (Ask-anything Workspace control);
  `ai/tools.py` is the assembler that builds `TOOLS` (read then
  draw — order is load-bearing for prefix-cache hits) and re-exports the public
  API (`TOOLS`/`read_only_tools`/`ask_tools`/…). Edit schemas in the split
  files; never reorder `TOOLS`.** Multi-turn within a session:
  `AskBar` keeps a running `apiHistory` and sends prior fallback Q&A as
  `history` so follow-ups have context; it's session-only (reset on close).
- **AI market summary** (`hooks/useMarketSummary.ts` + `MarketSummaryCard`,
  Discover hero). Auto-generates a per-window summary via `/api/ai/ask`
  (real Claude call; gated by its own `marketSummaryAiEnabled` toggle — off
  shows the `AiDisabledNotice`, no generation). Per silo: **stocks** uses US
  market windows (open/midday/close EST) and US headlines; **crypto** uses
  four 6-hour UTC windows (00–06 / 06–12 / 12–18 / 18–24 UTC) and
  BTC/crypto news; labels show the UTC range explicitly so they are
  unambiguous for users in any timezone. Cached per silo
  (`market_summary_v1` / `crypto_market_summary_v1`); the `market_summary`
  intent card reads the matching cache.
- **ChartBot side panel** (`components/chat/`, Chart mode only, gated
  by `AI_CHAT_ENABLED` operator-side **and** the user `chartbotEnabled`
  toggle — when the user toggle is off the panel renders the
  `AiDisabledNotice` in its body instead of the transcript/composer).
  380px violet right-edge panel. Hybrid
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
