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
- Watchlist **prefers the stream and auto-falls-back to polling
  `/api/quotes`** when the stream is unreachable (Vercel/Pages have no
  relay). Load-bearing — keep it. `EventSource` auto-reconnect is
  deliberately disabled so failure → polling, not a silent reconnect
  loop.
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
- **Themed left toolbar via `custom_css_url`.** TV's drawing rail
  stays TV-native; `frontend/public/tv-themed.css` re-tunes its CSS
  variables against the Calm palette. Don't hand-roll a React drawing
  rail.
- **Theme switch causes widget remount.** This bundled TV build has
  no reliable `changeTheme()`; `TVPlatform` re-keys its mount effect
  on the `useTheme()` value and recreates the widget. The unmount
  path clears the drawing entity-ID map (`clearEntityIds`) so the
  next mount cleanly replays from `ai_drawings_v1`.
- **`IndicatorPillsRow` polls `getAllStudies()`** every 1.2s. This
  build's `IChartWidgetApi` doesn't expose `onStudyAdded` /
  `onStudyRemoved`; polling is the only reliable way to keep the
  pills in sync (including studies added via right-click). Cheap;
  bounded by Chart-mode mounts.

## AI chat — wiring notes

- System prompt + tool schemas in `backend/app/ai/prompt.py` and
  `backend/app/ai/tools.py` are **cache-marked** (`cache_control`) so
  multi-turn chats hit the Anthropic prefix cache on every turn. Keep
  the markers.
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
