# Landmines

Hard-won knowledge about the Vercel Python runtime, the TradingView
Charting Library bridge, and the streaming relay. Each item here cost
more than one debugging session. Read before changing the corresponding
area.

## Streaming design

- One shared Alpaca `StockDataStream` per process, fanned to browsers
  over **hand-rolled SSE** (`backend/app/stream.py` → `/api/stream`). No
  `sse-starlette` dep; `alpaca-py` ships the stream client. Don't add
  streaming deps casually.
- Crypto streaming uses a parallel `CryptoQuoteHub` subclass that
  overrides `_make_stream()` to return `CryptoDataStream` instead of
  `StockDataStream`. The `/api/stream` endpoint detects
  `all("/" in s for s in syms)` and routes to the correct hub. Both hubs
  are module-level singletons — never instantiate more than one of each.
  `CryptoDataStream` does **not** take a `feed` parameter; omit it.
- Watchlist **prefers the stream and auto-falls-back to polling
  `/api/quotes`** when the stream is unreachable (Vercel/Pages have no
  relay). Load-bearing — keep it. `EventSource` auto-reconnect is
  deliberately disabled so failure → polling, not a silent reconnect
  loop.
- **`POLL_MS` is intentionally 15 000 ms (not 2 s).** At 2 s the fallback
  generates ~43 k Vercel edge requests/day and burns the free-tier 1 M
  allowance in ~3 weeks. 15 s is still responsive for a degraded path.
  Don't reduce it without considering the edge-request budget.
- **Render relay keepalive.** `quoteStream.ts` pings `STREAM_BASE/api/health`
  every 9 minutes while any symbol is subscribed. This prevents Render
  spindown, which is what triggers stream failures and the expensive
  polling fallback. The ping is a no-op if `VITE_STREAM_BASE` is unset
  (Vercel-only setups). `pingRelayHealth` in `api.ts` is the single call
  site — don't add a second one.
- `useLiveQuotes` fires a one-shot `getQuotes()` REST call on mount to
  seed the cache before the first stream tick arrives — otherwise the
  order sheet's est-cost shows blank until Alpaca pushes a tick.
- Stream ticks are buffered and flushed at most every `STREAM_FLUSH_MS`
  (500ms). The buffer lives in two places — tune both, remove neither:
  `frontend/src/data/useLiveQuotes.ts` (watchlist) and
  `frontend/src/lib/tv-datafeed.ts` `subscribeQuotes` (TV order ticket).
- Stream status surfaces via `lib/stream-status.ts` (module pub/sub) +
  `hooks/useStreamStatus.ts`. `TopBar` renders a yellow "Polling ·
  stream off" chip whenever `useLiveQuotes` has fallen back. Don't
  remove — it's how the user knows real-time ticks aren't coming.
- `VITE_STREAM_BASE` is read at **build time** and must be set in
  **both** build paths or that frontend silently polls:
  - Vercel prod: Vercel project env var (Production).
  - Pages previews: GitHub repo Actions *variable* (passed through in
    `preview-pages.yml`).
  Relay CORS (`CORS_ORIGINS`, defaulted in `render.yaml`) must list the
  exact frontend origin or the browser blocks the stream and falls back.

## Vercel Python runtime

Vercel's serverless Python builder forces **Python 3.14** and ignores
`Pipfile` / `.python-version`. Resolved over commits #4–#8 — do not undo.

- **Do not** re-add `Pipfile` or `.python-version` (they push Vercel
  onto a uv/pipenv path that fails the function build).
- **Do not** pin or downgrade `pydantic` / `pydantic-settings`. They are
  floated (`>=2.11`) so a prebuilt pydantic-core 3.14 wheel is used
  instead of a failing Rust source build.
- Keep the `PYO3_USE_ABI3_FORWARD_COMPATIBILITY=1` build env in
  `vercel.json`.
- Backend deps come from `requirements.txt` only.
- **Dual requirements.txt trap.** `backend/requirements.txt` is for
  local dev and Render. The root `requirements.txt` is what Vercel's
  Python builder reads for `api/`. Any new dep must land in **both**
  or prod 500s on the first import. CI (`check-requirements-sync` in
  `lint-backend.yml`) diffs the two files and fails the build on
  divergence; `uvicorn` is intentionally backend-only and excluded.

## Render relay (Docker image)

The relay image is built from `backend/Dockerfile`. Two things bit us:

- **Build context is the repo ROOT, not `backend/`.** `app/main.py` reads the
  repo-root `VERSION` at import. With `dockerContext: ./backend` the file was
  never in the build context, so it never entered the image — inside the
  container `main.py` lives at `/app/app/main.py`, resolved `/VERSION`, and
  crashed every boot with `FileNotFoundError`. Fix: `render.yaml` sets
  `dockerContext: .`, the Dockerfile `COPY`s `backend/...` + `VERSION`, and a
  root `.dockerignore` keeps the (now whole-repo) context lean — it MUST
  exclude `frontend/` (the committed 37 MB charting library) and `**/.env*`.
- **VERSION read is layout-tolerant + crash-proof.** `_read_version()` tries
  the repo-root layout (local/Vercel: three levels up) and the flattened
  container layout (`/app/VERSION`), then falls back to `$APP_VERSION` and
  finally `"0.0.0"`. Don't reduce it back to a single hard-coded path — the
  three deploy layouts (local, Vercel, Render) put the file in different
  places, and the relay must boot even if it can't be read.

## Asset catalogue / Postgres (Supabase)

The `assets` table (`backend/app/db.py`, enriched via `coingecko.py` + `fmp.py`,
seeded through the `/api/_dev/seed-assets` and `/api/_dev/enrich-stocks` dev
tools). Each item cost a round of debugging:

- **Postgres :5432/:6543 is unreachable except from prod.** The sandbox blocks
  raw TCP (only :443 is open even on a loosened egress policy) and the owner's
  laptop is behind a corporate firewall that blocks 5432. So the DB write path
  **cannot be tested locally or in a cloud agent — only on Vercel/Render.**
  Don't burn time connecting from a dev machine; verify via the Supabase SQL
  editor or by hitting the deployed seeders.
- **The table is created by `002_assets.sql`, not auto-created.** Run it once in
  the Supabase SQL editor (the old `company_profiles` auto-create was removed).
- **Alpaca SDK enums stringify to the member NAME, not the value.**
  `str(AssetClass.CRYPTO)` → `"AssetClass.CRYPTO"`, not `"crypto"` — same for
  `AssetExchange`/`AssetStatus`, and it holds even on a pydantic model field.
  Persist `.value` (`_enum_value` in `alpaca/trading.py`) or every
  `asset_class`/`exchange`/`status` is polluted and `WHERE asset_class='crypto'`
  matches nothing. (The position/order paths survive `str()` only because the
  frontend falls back to the `/` in crypto symbols.)
- **FMP free tier: single-symbol only, 250 calls/day.** Comma-separated
  `symbol=A,B,C` returns `[]` (treated as one bad ticker); `profile-bulk` and
  `sp500-constituent` are **402 (paid)**. So a backfill is single-symbol +
  budgeted. Use the **stable** endpoint (`/stable/profile?symbol=`) — legacy
  `/api/v3/profile` 403s for keys issued after Aug 2025. `dcf`/`dcf_diff` aren't
  in the stable response (separate endpoint) and are left null.
- **CoinGecko keyless tier rate-limits hard.** Under load it drops to ~5/min and
  429s, silently failing enrichment (a 33-min run with 21 failures). Set a free
  **Demo key** (`COINGECKO_API_KEY` → `x-cg-demo-api-key` header) for ~30/min.
  The symbol→id map is keyed on the **base ticker** (BTC/USD, BTC/USDT … all →
  `bitcoin`) because CoinGecko's `symbol` field isn't unique across 17k coins;
  ids are hardcoded + verified against the live API.
- **Yahoo quoteSummary is dead from datacenters.** `getcrumb` returns **406**
  (anti-scraping, IP-reputation based) from the sandbox, the owner's laptop, and
  any Render/Vercel IP. It was an early profile provider and was removed —
  don't re-add it server-side expecting it to work.
- **`pg8000`, not `psycopg`.** Pure-Python, no C extension (Python 3.14 /
  Vercel safe), and in **both** requirements files (dual-requirements trap).
- **`DATABASE_URL` = Supabase Session pooler (IPv4), not Direct/IPv6 or the
  Transaction pooler.** Alphanumeric password to avoid URL-encoding; if it has
  special chars, URL-encode them. `DATABASE_SSL_INSECURE=true` only if the
  pooler trips cert verification (TLS stays on regardless).
- **Env-var value gotcha:** paste only the *value* into Vercel/Render — pasting
  the whole `NAME = value` line (or a trailing newline) gets sent verbatim as
  the apikey and 401s. Bit us once in prod.
- **The base upsert is slow (~14 min for ~13.8k rows)** — row-by-row over the
  pooler. `seed-assets?base=false` skips it to (re)enrich crypto only (~45s);
  both seeders are resumable (skip already-enriched).
- **Stock enrich is sequential, not rate-limit-bound.** Each symbol is one FMP
  fetch + pacing + a fresh DB connection, so real throughput is ~100/min even on
  a paid 300/min tier — the whole universe is ~1.5–2.5 hr. Run `enrich-stocks
  ?limit=N` in chunks (resumable); don't expect the rate ceiling.
- **Crypto's "exchange" is the pseudo-value `CRYPTO`.** `_asset_dict`/`get_asset`
  return `exchange="CRYPTO"` for crypto, which duplicates the asset-class label
  in UI (we hide the exchange span when it's `CRYPTO` — see `PriceChart.tsx`).
- **Search hides un-enriched rows by design** (the visibility rule in
  `db.search_assets`: `tradable` + `enrichment_source IS NOT NULL`). "Why isn't
  symbol X in search?" → it isn't enriched yet. Direct resolution (`get_asset`)
  and positions/watchlist are *not* filtered, so existing holdings still render.

## Earnings / economic calendars (FMP)

`backend/app/calendar_fmp.py` serves `/api/calendar/{earnings,economic}` (+
`/api/calendar/earnings/{symbol}`) off Financial Modeling Prep. Things that took
a beat to get right — don't undo them:

- **Not DB data.** Calendars are small, time-windowed and roll forward daily, so
  they are **live-proxied + in-process cached** (the `indices.py` /
  `market_news.py` pattern — TTL ~1h), never persisted. There is intentionally
  **no scheduler / cron**; the cache self-refreshes on the next request. Don't
  "promote" calendars into the `assets` table.
- **The DB is only a market-cap lookup.** The raw whole-market earnings feed
  leads with OTC/microcap junk, so the list is filtered to the catalogue's
  visible US-equity universe and ranked by `db.market_cap_map()`. The user's
  positions / open orders / watchlist symbols are **always unioned in** (passed
  as `?include=`, gathered client-side in `useEarningsCalendar`) regardless of
  cap. When Postgres is unreachable (sandbox/laptop — :5432 is firewalled) the
  cap map is empty and the list **degrades to `include`-only** — clean, but it
  shows only your own names until prod fills the caps. That's expected, not a bug.
- **Stocks-only on Discover.** Earnings has no crypto equivalent and the economic
  card lives in the equities silo; both Discover cards are gated `{!isCrypto}`.
- **FMP economic times are UTC** ("YYYY-MM-DD HH:MM:SS", no zone). `EconomicCard`
  appends `Z` before parsing so they render in the user's local time — don't drop
  that or every release shows in the wrong hour. The card also **day-paginates by
  the local date** (group + "today" default computed from the converted
  timestamp, not the raw UTC date) so the day boundaries match the times shown.
- **No new dependency / no DB write.** `requests` is transitive via `alpaca-py`;
  calendars are read-only. Endpoints need no Alpaca keys and return `[]` when
  `FMP_API_KEY` is unset (graceful, like the other proxy endpoints).
- **Calendar coverage is on the paid FMP Starter plan** the catalogue already
  uses — both endpoints 200 on it (the public docs ambiguously imply Premium;
  the live key proves otherwise).

## Symbols with slashes (crypto path params)

Alpaca crypto symbols contain a slash (`BTC/USD`). This breaks standard
FastAPI path parameters:

- **Backend:** any route whose `{symbol}` might be a crypto pair must
  use `{symbol:path}` (FastAPI's path converter). Currently applied to
  `/api/assets/{symbol:path}`, `/api/asset-profile/{symbol:path}`,
  `/api/positions/{symbol:path}`, and `/api/watchlist/{symbol:path}`.
- **Frontend:** never call `encodeURIComponent` on a symbol used in a
  path segment. Alpaca symbols are `[A-Z0-9/.]` only — pass them
  literally. `encodeURIComponent("BTC/USD")` → `BTC%2FUSD` which the
  server receives as two path segments → 404.
- **Positions endpoint:** Alpaca's REST API strips the slash from crypto
  position symbols (`BTC/USD` → `BTCUSD`). `_position_dict` in
  `backend/app/alpaca/account.py` re-inserts it. Never rely on
  `position.symbol.includes("/")` in the frontend to detect crypto —
  use `position.asset_class === "crypto"` instead (the field is
  included in the position response).

## Crypto order constraints

Alpaca paper crypto has narrower order support than equities:

- **TIF:** only `gtc` and `ioc` are valid. `day`, `opg`, `cls`, `fok`
  all 422. `useOrderTicket` detects crypto synchronously via
  `symbol.includes("/")` (before the async asset fetch) and defaults
  TIF to `gtc`.
- **Order types:** `trailing_stop` is not supported for crypto.
- **Margin:** Alpaca does not extend margin for crypto. Use
  `non_marginable_buying_power` (not `buying_power`) for buying-power
  display and after-order estimates in crypto contexts.

## Chart mode (TradingView bridge)

The broker (`frontend/src/lib/tv-broker.ts`) and datafeed
(`frontend/src/lib/tv-datafeed.ts`) bridge a strict, undocumented-in-
places TV interface.

- **`OrderType` enum is `Limit=1, Market=2, Stop=3, StopLimit=4`.** TV's
  order ticket sends the *integer*, not the string — flipping market
  and limit silently sends limit orders without `limit_price` and the
  backend 422s. Same enum is used both ways (`toTVOrder` + `placeOrder`).
- **`AccountManagerInfo` shape is rigid.** Summary rows use
  `{ text, wValue, formatter }` (not `label`+`property`); each column
  needs `id`+`label`+`formatter`+`dataFields`; `pages: []` is required.
  Wrong keys throw `Cannot read properties of undefined ('length')`
  deep inside TV's template renderer.
- **Reactive summary values must come from
  `host.factory.createWatchedValue()`.** Plain numbers don't update the
  panel — TV subscribes to the `WatchedValue` and only re-renders on
  `setValue()`.
- **TV does NOT re-poll `orders()` / `positions()`.** After the initial
  call it expects push updates via `host.orderUpdate()` /
  `host.positionUpdate()` / `host.executionUpdate()`. Our broker polls
  REST every 5s and pushes diffs, plus an immediate push after
  `placeOrder` / `cancelOrder` / `closePosition`. Diff before pushing:
  calling `host.orderUpdate` for every historical order on every poll
  triggers a toast notification per order. Keep the per-id signature
  cache and skip notifications on the first poll.
- **Order ticket needs `IDatafeedQuotesApi`.** Without
  `getQuotes` / `subscribeQuotes` / `unsubscribeQuotes` and
  `supports_quotes: true` in `onReady`, the ticket aborts with
  "quotesSnapshot / formatter / spreadFormatter not received".
- **`charting_library.standalone.js` loads async chunks.** The
  standalone script is a loader — it kicks off further async chunk
  fetches before `TradingView.widget` becomes callable. If Chart mode
  is the persisted default, `TVPlatform` mounts before those chunks
  resolve and the chart stays blank. Fix: poll
  `typeof TradingView.widget === "function"` at 100ms intervals before
  constructing the widget (see `TVPlatform.tsx`).
- **TV's native top header + trading UI are hidden** via
  `DISABLED_FEATURES` in `TVPlatform.tsx`: every `header_*` item,
  `trading_account_manager`, `open_account_manager`, `order_panel`,
  `show_order_panel_on_start`, `trading_notifications`,
  `show_trading_notifications_history`, `buy_sell_buttons`,
  `broker_button`, plus `show_right_widgets_panel_by_default` and
  `create_volume_indicator_by_default`. The broker is still wired
  (`broker_factory`) because that's how TV's price-line overlays work
  — trade initiation is ours via `TradeBar` → `OrderSheet`. Don't
  re-enable any of these features; you'll get doubled UI on top of our
  cards.
- **In-TV symbol changes propagate back to App.** `TVPlatform`
  subscribes to `widget.activeChart().onSymbolChanged()`, normalises
  (strips `EXCHANGE:` prefix), and calls `onSymbolChange(next)` so
  `ChartTopBar`, `TradeBar`, and `ChatPanel` follow. The reverse-
  direction prop → `setSymbol` effect has an equality guard so an
  in-TV change round-tripping through App doesn't refire `setSymbol`
  and rebuild drawings pointlessly.
- **Crypto symbols in the TV datafeed.** `resolveSymbol` sets
  `session: "24x7"`, `timezone: "UTC"`, `type: "crypto"`, and
  `exchange: "CRYPTO"` when `asset_class === "crypto"`. These differ
  from equity defaults and are required for TV to render the chart
  correctly. Detection uses `data.asset_class` from the asset API
  response (not the symbol slash) to avoid any normalisation mismatch.
- **Themed left toolbar via `custom_css_url`.** TV's drawing rail
  stays TV-native; `frontend/public/tv-themed.css` re-tunes its CSS
  variables against the Calm palette. Don't hand-roll a React drawing
  rail.
- **Theme switch re-skins TV in place.** `TVPlatform` builds the
  widget once and re-themes via `changeTheme()` plus a re-applied
  `paneProperties.background` override (TT v31.2.0 supports it; the
  older bundle didn't, hence the previous remount). No remount, so
  drawings / studies / zoom / active symbol / broker connection all
  survive a toggle. This relies on `useTheme()` being a **shared
  module store** (`useSyncExternalStore`): every consumer must observe
  the same value, or non-CSS consumers like the chart silently miss
  toggles. Don't revert it to per-instance `useState`.
- **`IndicatorPillsRow` polls `getAllStudies()`** every 1.2s. This
  build's `IChartWidgetApi` doesn't expose `onStudyAdded` /
  `onStudyRemoved`; polling is the only reliable way to keep the
  pills in sync (including studies added via right-click). Cheap;
  bounded by Chart-mode mounts.

## Mobile / responsive layer (≤ 640px)

The phone layouts are **additive** — every mobile branch is gated so
desktop / iPad (> 640px) render byte-identical. A few things bite:

- **`useMobile()` must mirror the CSS breakpoint.** `hooks/useMobile.ts`
  uses `matchMedia("(max-width: 640px)")`; the same 640px is hard-coded in
  the `@media` rules in `index.css`. Change one, change both — otherwise
  JS-driven branches desync from the style rules.
- **`--mob-hero-value` lives in the `@media (max-width: 640px)` block, NOT
  `:root`.** `discover/BalanceCard.tsx` reads it as
  `var(--mob-hero-value, clamp(34px, 5.4vw, 48px))` — the desktop clamp is
  the *fallback*, which only fires when the var is undefined. Define the
  token in `:root` and desktop silently inherits the smaller mobile hero
  size. The other `--mob-*` / `--safe-*` tokens are fine in `:root` because
  they're only ever read inside mobile-gated code.
- **Mobile overlays render `position: fixed`.** The nav drawer, the ChartBot
  slide-up + its launcher, the OrderSheet / EquitySheet / watchlist-add
  sheets, and the full-screen AskBar are all fixed. That's why `App.tsx`'s
  chart-mode flex row needs no mobile branch — on mobile `ChatPanel` is out
  of flow, so the chart's `flex:1` wrapper already takes the full width.
  Don't "fix" it by adding a mobile ternary there.
- **Safe-area + `dvh` are load-bearing on iOS.** Bottom-pinned UI (TradeBar,
  sheet footers, composer) pads with `var(--safe-bottom)` and full-screen
  surfaces size to `100dvh`. Swap back to plain `vh` / zero insets and the
  notch / home-indicator / collapsing URL bar clip the CTA on a real phone.
- **ChartBot launches from its own violet launcher on mobile, not the
  header `✦`.** The header `✦` is Ask-anything (teal) in every mode; the
  separate violet launcher preserves the teal-vs-violet AI-surface
  convention. Don't overload the header button by mode.

## AI chat — wiring notes

- System prompt + tool schemas in `backend/app/ai/prompt.py` and
  `backend/app/ai/tools.py` are **cache-marked** (`cache_control`) so
  multi-turn chats hit the Anthropic prefix cache on every turn. Keep
  the markers. The schemas live in `ai/tools_read.py` / `tools_draw.py` /
  `tools_action.py` / `tools_workspace.py`; `tools.py` assembles `TOOLS` as
  `READ_TOOLS + DRAW_TOOLS` (ChartBot) and `ask_tools()` as read + action +
  workspace (Ask anything). **Never reorder `TOOLS` or edit schema text
  gratuitously** — both shift the cached prefix and cost every subsequent cache
  hit. Workspace tools are append-only in `ask_tools()` and never in `TOOLS`.
- The ChartBot frontend-executed tool catalog is declared server-side
  in `tools.py` but dispatched client-side in `lib/ai-client.ts`
  against `lib/tv-drawings.ts`. Results are folded into the next
  message and re-POSTed (up to 10 outer rounds).
- `propose_order` with `staged=false` must NOT await
  `showOrderDialog` — see `ai-client.ts`.
- `export_chart_data` is row-major: `data[i][c]`.
- API history is trimmed to the trailing `HISTORY_CAP` (80, exported
  from `ai-client.ts`) on send **and** on save. Backend re-trims
  defensively (overwriting oldest entries to preserve `tool_use` pairs)
  so over-cap requests don't 400.
- Drawing persistence: `tv-drawings.ts` tags each drawing with a UUID
  and writes to `ai_drawings_v1`. On symbol/resolution change
  `TVPlatform` calls `recreateDrawingsForChart`, replaying only the
  drawings for that symbol. Symbol-mismatch draws are saved with
  `entityId=null` and replayed the next time that symbol loads.
- Widget singleton: `lib/tv-widget-handle.ts` holds a module-level ref
  to the TV widget so `ChatPanel` and friends can call TV APIs without
  being children of `TVPlatform`. `subscribeTVWidget(cb)` lets
  consumers react to mount/unmount.
- **Ask-anything Workspace control** is *not* a frontend tool loop (the
  `/api/ai/ask` path is one-shot). The workspace tools in `tools_workspace.py`
  queue client directives into `AskResponse.workspace_actions` (mirroring the
  `reports` artifact channel); the frontend replays them via the
  `lib/workspace/controller.ts` module singleton — App registers mode/silo
  hooks, `Workspace` registers an imperative handle on `onReady`. **Remount
  race:** switching silo bumps `<DockviewReact key={assetClass}>`, so the
  controller nulls its handle on a silo switch and `awaitHandle()` blocks for
  the *fresh* `onReady` — don't grab the handle before the switch settles. The
  `"main"` channel must be written through `workspaceCtx.setSymbol` (App's
  `onSelect`), never the colour-channel map, because `switchAssetClass` resets
  `selected` to `""`.
- **Standalone charts (`params.symbol`):** chart/minichart accept the `none`
  channel as a standalone mode that owns its symbol in `params.symbol` (so an
  AI grid can show N>4 distinct symbols beyond the four colour channels).
  Dockview *merges* `updateParameters`, so writing `{ symbol }` leaves the
  channel intact; a local mirror in `useChartSymbol` forces the re-render.
- The three AI surfaces (market summary / Ask anything / ChartBot) each gate on
  their own `app_settings_v1` flag (`marketSummaryAiEnabled` / `askAiEnabled` /
  `chartbotEnabled`), **all default off**; a disabled surface renders the shared
  `AiDisabledNotice` instead of calling Claude.

## AI web search (Ask anything)

Hosted Anthropic `web_search` has **two independent switches** that are easy
to get out of sync:

- **Our flag `AI_WEB_SEARCH_ENABLED`** (`backend/app/config.py`, default
  `false`) — whether the backend even offers the tool to the model. This is
  the deterministic off switch: with it off, `web_search` isn't in the tool
  list, so it physically cannot run regardless of the org.
- **The Anthropic org toggle** — whether web search is allowed for the
  organization. **Enablement follows the org that owns the
  `ANTHROPIC_API_KEY` in the deployment env, NOT whatever Console you happen
  to be looking at.** If the key in Vercel belongs to a different org/workspace
  than the toggle you flipped, your change has no effect. Symptom: web search
  keeps working (live results + a `✓ web_search` chip) even though you
  "disabled" it — you disabled the wrong org.

The bot is **internal-first** and **self-heals**: if the flag is on but the org
hasn't enabled web search, the `messages.create` call 400s the moment the model
invokes web search; `ai_ask` catches that, strips `web_search`, and retries so
the user gets a normal internal answer. Consequence: an org-off failure is
**silent** — there's no error and no `web_search` chip — so don't rely on the
app to surface it. To truly confirm org state, test in the Anthropic Workbench
with a key from that org (it shows the raw 400).
