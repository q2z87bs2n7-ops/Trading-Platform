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
   bumped manually only. Version is automatically synced to all targets:
   - Backend reads `VERSION` at startup for FastAPI metadata.
   - Frontend syncs `VERSION` to `package.json` via `npm run sync-version`
     (called automatically before each build).
6. **No rewrites** — never rewrite large sections; targeted edits only.

## Architecture

- **Frontend:** React 18 + TypeScript + Vite. Single-page (no router).
  A three-pill header toggle switches between platform modes (persisted
  to `localStorage('platform_mode')`):
  - **Discover (default):** `Tools.tsx` — `BalanceCard` + monochrome
    teal `AllocationCard` hero row, horizontal-scroll `SparkCard` rows
    for indices (`/api/indices`, 13 Yahoo Finance entries) and the
    user watchlist (sparklines synthesised from snapshot day-change),
    a wide inline chart card (wraps `PriceChart`), two side-by-side
    `MoversCard` (gainers / losers from `/api/movers`), and a flat
    `NewsCard` list from `/api/market-news`.
  - **Portfolio** (`mode="portfolio"`, migrated from legacy `"trading"`):
    `PortfolioHero` (portfolio-value `ValueCard` + 30d `EquityCurveCard`
    area chart from `/api/portfolio-history`), `Positions` in
    `variant="strip"` mode (one card per position), restyled `Orders`
    card, `Activities` feed. `TopBar` status strip mounts only on this
    mode.
  - **Chart** (`mode="chart"`, migrated from legacy `"chartbot"` and
    pre-rename `"tv"`): `TVPlatform.tsx` wraps the full TradingView
    Charting Library terminal (`frontend/public/charting_library/`,
    committed to repo — private repo only) in our own chrome. TV's
    native top header is hidden via `disabled_features`; our
    `ChartTopBar` (TF tabs / chart-type popover / indicator popover /
    ChartBot launch button) + `IndicatorPillsRow` render above the
    widget. The body is a flex row of `ChartWatchlist` (180px narrow
    list), TV's chart canvas + native drawing rail (themed via
    `custom_css_url`), and `OrderTicketRail` (240px persistent
    ticket). `ChartBlotter` (tabbed Positions / Orders / Activity,
    collapsible) sits below. Data + broker wiring is unchanged —
    `frontend/src/lib/tv-datafeed.ts` → `/api/bars`, `/api/stream`,
    `/api/quotes`, `/api/snapshots`, `/api/assets`;
    `frontend/src/lib/tv-broker.ts` → `/api/account`, `/api/orders`,
    `/api/positions`, `/api/activities`. The **ChartBot chat panel**
    (`components/chat/ChatPanel.tsx`, 380px violet right-edge panel)
    mounts here when `AI_CHAT_ENABLED=true`.
- **Order entry surfaces (Calm v2 split).** `OrderTicket.tsx` is gone;
  `hooks/useOrderTicket.ts` owns all form state (symbol/side/type/qty/
  limit/stop/trail/TIF/ext-hours) plus asset lookup, live quote, est
  notional, client-side validate, and a `trySubmit({ skipConfirm? })`
  that surfaces the paper-account confirm. Three surfaces consume it:
  - `components/trade/OrderSheet.tsx` — bottom-sheet modal with the
    two-column form, opened by the `TradeBar`.
  - `components/trade/TradeBar.tsx` — floating Buy/Sell pill bottom-
    center, mounted in Discover + Portfolio. Hidden in Chart mode.
  - `components/chart/OrderTicketRail.tsx` — persistent compact 240px
    ticket in the Chart workspace.
  The ⌘K command bar's order intent uses the same hook with
  `skipConfirm: true` (the modal *is* the confirm UI).
- **Backend:** FastAPI + `alpaca-py`. `backend/app/` is the real code;
  `api/index.py` is a thin shim that puts it on Vercel's import path.
  Endpoints: `/api/health`, `/api/config`, `/api/account`, `/api/bars`,
  `/api/quotes`, `/api/snapshots`, `/api/stream`, `/api/orders`,
  `/api/positions`, `/api/activities`, `/api/assets`, `/api/news`,
  `/api/calendar`, `/api/watchlist`, `/api/movers`, `/api/most-active`,
  `/api/indices`, `/api/market-news`, `/api/ai/chat` (gated by
  `AI_CHAT_ENABLED`; requires `ANTHROPIC_API_KEY`).
  `/api/indices` and `/api/market-news` use direct Yahoo Finance HTTP
  (`requests`, a transitive dep) — no yfinance, no C extensions, safe
  on Vercel Python 3.14. `/api/news`, `/api/most-active`, and `/api/
  assets` (asset search) are still served by the backend and consumed
  by the AI tool loop (`get_news`, `find_symbol`), but no frontend
  surface calls them directly any more — that's intentional, don't
  delete them.
- **Data feed:** IEX (free, real-time but ~2-3% of volume). `sip` needs a
  paid Alpaca plan; switch via `ALPACA_DATA_FEED` env — no code change.
- **Frontend stack:** Tailwind CSS + a Calm v2 token set in oklch
  (light + dark via `html[data-theme="dark"]`, switched by
  `hooks/useTheme.ts` with a synchronous bootstrap in `index.html` to
  avoid flash). Fonts are Inter + IBM Plex Mono (Google Fonts).
  Tailwind config exposes the tokens as utility classes (`bg-panel`,
  `text-mute`, `border-hairline`, `rounded-card-lg`, `shadow-elev`,
  `bg-cb-accent`, …). TradingView `lightweight-charts` retained for
  the Discover inline chart and `PriceChart`. `index.css` is now down
  to tokens + 4 legacy classes (`.app`, `.btn`, `.btn-mini`, input
  defaults) plus `:focus-visible` — everything else is utilities or
  inline `style={{ var(--…) }}`.
- **PWA:** Progressive Web App via `vite-plugin-pwa`. Service worker
  auto-registers on load with smart caching: API calls use NetworkFirst
  (network with cache fallback), charting library uses CacheFirst (5MB
  max precache, excludes charting_library to avoid size bloat). Enables
  offline access and installation on mobile/desktop.
- **Persistence:** Postgres (free tier, e.g. Supabase/Neon) is the
  intended layer for trade journaling, server-side watchlists, and
  analytics history — **backlogged** (see `BACKLOG.md`). For now Alpaca is
  queried directly as source of truth; UI prefs live in browser
  `localStorage`.
- **Auth:** shared-token middleware guards write endpoints.

## Design tokens (Calm v2)

- **Single token block in `frontend/src/index.css`.** Light is the
  default; dark lives under `html[data-theme="dark"]`. Surfaces (`--bg`,
  `--panel`, `--panel-2`, `--panel-3`, `--border`, `--border-2`,
  `--hairline`), text (`--text`, `--text-2`, `--mute`), accent
  (`--accent`, `--accent-2`, `--accent-bg`, `--accent-soft` — teal),
  semantic (`--pos`, `--neg`, `--pos-bg`, `--neg-bg`), elevation
  (`--shadow-sm`, `--shadow`, `--shadow-lg`), radii (`--r`, `--r-lg`,
  `--r-xl`), and a violet ChartBot accent family (`--cb-accent*`).
- **Theme switch** runs through `hooks/useTheme.ts`, which sets
  `document.documentElement.dataset.theme` and persists to
  `localStorage.theme`. A synchronous bootstrap in `index.html`
  applies the saved value before first paint — don't delete that
  script or every load will flash.
- **Tailwind config exposes the tokens** as utility names (`bg-panel`,
  `text-mute`, `border-hairline`, `bg-accent-bg`, `text-cb-accent`,
  `rounded-card`, `rounded-card-lg`, `shadow-elev`, `font-mono`, …).
  Adding a new token: declare it in `index.css` AND map it in
  `tailwind.config.js` if you want a utility class for it.
- **Legacy aliases kept** so unmigrated code keeps working: `--green`,
  `--red`, `--muted`, `--bg-elev`, `--border-strong`, `--text-3`,
  `--warn*`. Map to the new tokens; safe to remove once nothing
  references them.

## localStorage keys (browser state)

Single-user app, so all of these live in `localStorage`. Listed here
so future work doesn't accidentally collide.

| Key | Writer | Read by | Notes |
| --- | ------ | ------- | ----- |
| `platform_mode` | `App.tsx` | `App.tsx` | `"discover" \| "portfolio" \| "chart"`. Migrates legacy `"trading"` → `"portfolio"` and `"chartbot"` / `"tv"` → `"chart"` on first load. |
| `theme` | `hooks/useTheme.ts` + index.html bootstrap | both | `"light" \| "dark"`. Defaults to OS preference. |
| `chartbot_collapsed` | `ChatPanel` | `ChatPanel` | `"1"` only when explicitly collapsed. Default-open in Chart mode. |
| `chartbot_session` | `useChatSession` | `useChatSession` | Serialised turns + apiHistory, capped at 256 KB. |
| `ai_drawings_v1` | `tv-drawings.ts` | `tv-drawings.ts` | Per-symbol drawing UUIDs replayed on chart load. |
| `chart_blotter_collapsed` | `ChartBlotter` | `ChartBlotter` | `"1"` collapsed. |
| `watchlist` (Alpaca) | server | server | Note: not in localStorage — watchlist is server-side via `/api/watchlist`. |

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
  (500ms) to cap re-renders. The buffer lives in two places — tune both,
  remove neither: `frontend/src/data/useLiveQuotes.ts` (watchlist) and
  `frontend/src/lib/tv-datafeed.ts` `subscribeQuotes` (TV order ticket).
- Stream status surfaces in the UI via `lib/stream-status.ts` (module
  pub/sub) + `hooks/useStreamStatus.ts`. `TopBar` renders a yellow
  "Polling · stream off" chip whenever `useLiveQuotes` has fallen back
  to polling. Don't remove this — it's how the user knows real-time
  ticks aren't coming.
- `VITE_STREAM_BASE` is read at **build time** and must be set in **both**
  build paths or that frontend silently polls:
  - Vercel prod: Vercel project env var (Production).
  - Pages previews: GitHub repo Actions *variable* (`preview-pages.yml`
    passes it through).
  Relay CORS (`CORS_ORIGINS`, defaulted in `render.yaml`) must list the
  exact frontend origin or the browser blocks the stream and falls back.

## Two AI surfaces (teal ⌘K vs violet ChartBot)

The app has **two distinct AI-flavoured front doors**. The accent colour
is the tell: teal = local intent parser (free, instant); violet = real
Claude API call (Anthropic credits, slow).

### ⌘K command bar (teal · all modes · `components/cmd/`)

- **No LLM. No Anthropic calls. Free.** Centered modal, 680px max,
  10vh top anchor, frosted backdrop.
- Opened by the "Ask anything · ⌘K" pill in the top nav OR a global
  `⌘K` / `Ctrl+K` listener registered in `App.tsx`.
- `lib/cmd-intent.ts` runs each submitted phrase through a chain of
  regex/keyword checks and returns one of 8 typed intents: `order`,
  `close`, `portfolio`, `movers` (gainers/losers/both), `news`,
  `orders`, `chart`, `fallback`. Stopword filter keeps common English
  ("OPEN", "NEWS", "ALL") from getting misread as tickers.
- Each intent renders a `CmdResultCard` from `components/cmd/cards.tsx`
  that composes existing React Query hooks (`usePositions`,
  `useMovers`, `useMarketNews`, `useSnapshots`, `useBars`, `useOrders`)
  for reads and existing mutation hooks (`useSubmitOrder`,
  `useClosePosition`) for writes. The order card drives
  `useOrderTicket` with `skipConfirm: true` — the card itself is the
  confirm UI.
- The chart card renders a real 60-bar sparkline from `useBars` + day
  H/L + volume, plus an "Open in Chart workspace →" CTA that switches
  platform mode and pushes the symbol into the TV widget.
- Transcript clears on close (no persistence). Esc closes; Enter
  submits (Shift+Enter inserts a newline).

### ChartBot side panel (violet · Chart mode only · `components/chat/`)

- **Gated by `AI_CHAT_ENABLED`.** Off by default — calls cost real
  Anthropic credits. Set `AI_CHAT_ENABLED=true` and `ANTHROPIC_API_KEY`
  in the Vercel env (and locally in `backend/.env`) to enable. Other
  tunables: `ANTHROPIC_MODEL` (default `claude-sonnet-4-6`),
  `AI_MAX_TOKENS` (default 4096), `AI_MAX_TOOL_ITERATIONS` (default 16).
- **Hybrid tool-use loop.** The model sees one unified tool list
  declared in `backend/app/ai/tools.py`, split into two halves by who
  executes them:
  - *Backend-executed read tools* (`get_bars`, `get_quote`,
    `get_snapshot`, `get_positions`, `get_position`, `get_orders`,
    `get_account`, `get_news`, `get_movers`, `find_symbol`) run inside
    `POST /api/ai/chat` (`backend/app/ai/router.py`). The loop runs up
    to `AI_MAX_TOOL_ITERATIONS` rounds; once there are no more
    backend-tool calls, it returns to the client.
  - *Frontend-executed chart tools* are declared in the backend schema
    but dispatched on the client by `frontend/src/lib/ai-client.ts`
    against `frontend/src/lib/tv-drawings.ts`. Results are folded into
    the next message and re-POSTed (up to 10 outer rounds):
    - *Drawing:* `draw_horizontal_line`, `draw_vertical_line`,
      `draw_trend_line`, `draw_rectangle`, `draw_fib_retracement`,
      `draw_text`, `draw_arrow`, `list_drawings`, `remove_drawing`,
      `modify_drawing`, `get_drawing_properties`,
      `set_drawing_properties`.
    - *Studies & chart state:* `add_indicator`, `set_symbol`,
      `set_resolution`, `set_chart_type`, `set_visible_range`,
      `set_timezone`, `get_chart_state`, `inspect_chart`,
      `compare_symbol`.
    - *Trading viz:* `propose_order` (opens TV's order dialog —
      `staged=false` must NOT await `showOrderDialog`, see
      `ai-client.ts`), `show_position_line`, `mark_bar`,
      `mark_execution`.
    - *Capture:* `take_screenshot` (returns an image block the model
      consumes directly), `export_chart_data` (series + optional
      study columns; row-major — `data[i][c]`, see
      `tv-drawings.ts:exportChartData`).
- **Backend timeout.** The Anthropic call uses a 60 s client timeout
  (`backend/app/ai/router.py`); auth/config errors surface as 503 so
  the panel can show a useful message rather than a generic 500.
- **Drawing persistence.** `tv-drawings.ts` tags each drawing with a
  UUID and writes records to `ai_drawings_v1` in `localStorage`. On
  symbol or resolution change `TVPlatform.tsx` calls
  `recreateDrawingsForChart`, replaying only the drawings for that
  symbol. Symbol-mismatch draws are saved with `entityId=null` and
  replayed the next time that symbol is loaded.
- **Widget singleton.** `frontend/src/lib/tv-widget-handle.ts` holds a
  module-level reference to the TV widget so `ChatPanel` (and the
  toolbar / pills / context-chip components) can call TV APIs without
  being children of `TVPlatform`. `subscribeTVWidget(cb)` lets
  consumers react to mount/unmount.
- **System prompt + tool schemas are cache-marked** so multi-turn
  chats hit the Anthropic prefix cache on every turn — keep the
  `cache_control` markers in `backend/app/ai/prompt.py` and
  `backend/app/ai/tools.py`. The "Common shortcuts" section in
  `prompt.py` (mark entry, suggest stop, 50/200 SMA, clear) teaches
  the model the natural-language shortcuts the empty-state suggests;
  none of them are new tools, just compositions.
- **`components/chat/`** is a 380 px collapsible right-edge panel
  (Calm v2 violet accent throughout — `--cb-accent` and friends),
  split into `ChatPanel` (shell + collapse state, default OPEN),
  `ChatHeader` (gradient brand mark + tagline), `ChatContextPills`
  (sym · TF · price + Indicators+N, polled from the TV widget on the
  same 1.2 s cadence as `IndicatorPillsRow`), `ChatTranscript`,
  `ChatMessage` (user bubble right-aligned with violet bg +
  asymmetric corner; assistant turns with violet eyebrow and
  border-left tool-result chips), `ChatComposer` (pill textarea +
  circular violet send button), `ChatEmptyState` (chart-specialised
  prompt chips). Conversation state lives in `hooks/useChatSession.ts`
  (turns/apiHistory/busy/send/cancel/clear/retryLast). Session is
  persisted to `localStorage` under `chartbot_session` with a 256 KB
  byte budget (screenshot tool_results blow message-count caps fast —
  oldest user+assistant pairs drop until under). API history is
  trimmed to the trailing `HISTORY_CAP` (80, exported from
  `ai-client.ts`) on send **and** on save. The backend re-trims
  defensively (overwriting oldest entries to preserve tool_use pairs)
  so an over-cap request never 400s. `runAITurn` accepts
  `{ onEvent, signal }`: events stream live into the in-flight
  assistant turn, and the composer's **Stop** button aborts via the
  signal. Errors render as a banner on the failed turn with a
  **Retry** button that drops the failed user turn and re-sends.

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
- **Dual requirements.txt trap.** `backend/requirements.txt` is for
  local dev and Render. The **root** `requirements.txt` is what
  Vercel's Python builder actually reads for `api/`. Any new dep must
  land in **both** files or prod 500s on the first import. A CI check
  (`check-requirements-sync` in `lint-backend.yml`) diffs the two
  files and fails the build if they diverge (uvicorn is intentionally
  backend-only and is excluded from the diff).

## Chart mode — landmines (don't regress)

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
- **`charting_library.standalone.js` loads async chunks.** The standalone
  script is a loader — it kicks off further async chunk fetches before
  `TradingView.widget` becomes callable. If Chart mode is the persisted
  default, `TVPlatform` mounts before those chunks resolve and the chart
  stays blank. The fix: poll `typeof TradingView.widget === "function"`
  at 100ms intervals before constructing the widget (see `TVPlatform.tsx`).
- **TV's native top header is hidden** via `disabled_features:
  ["header_widget", "header_resolutions", "header_chart_type",
  "header_indicators", "header_compare", "header_settings",
  "header_screenshot", "header_fullscreen_button", "header_undo_redo",
  "header_symbol_search", "use_localstorage_for_settings"]`. Our
  `ChartTopBar` replaces every removed control. Don't re-enable any
  of those features — they'd produce a doubled toolbar.
- **Themed left toolbar via `custom_css_url`.** TV's drawing rail stays
  TV-native; `frontend/public/tv-themed.css` re-tunes its CSS variables
  (`--tv-color-platform-background`, `--tv-color-toolbar-button-*`,
  etc.) against the Calm palette. Don't try to hand-roll a React
  drawing rail.
- **Theme switch causes widget remount.** This bundled TV build has no
  reliable `changeTheme()`; `TVPlatform` re-keys its mount effect on
  the `useTheme()` value and recreates the widget. The unmount path
  clears the drawing entity-ID map (`clearEntityIds`) so the next mount
  cleanly replays from `ai_drawings_v1`.
- **Pill row + context pills poll `getAllStudies()`** every 1.2 s.
  This build's `IChartWidgetApi` doesn't expose `onStudyAdded` /
  `onStudyRemoved`; polling is the only reliable way to keep the
  user-facing pills in sync with TV's internal study list (including
  studies added via right-click). Cheap; bounded by Chart-mode mounts.

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
