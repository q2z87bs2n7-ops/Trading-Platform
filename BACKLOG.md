# Backlog

Outstanding work only — shipped / historic notes are intentionally not kept
here; use `git log` for that.

## Forex (FXCM)

POC is live (see `docs/fxcm.md` for full reference). The bridge, proxy router,
and ForexDiscoverPage (account hero + live watchlist) are shipped. What remains:

- **Order entry UI** — `fxcm-bridge/bridge.py` has `POST /order` and `POST /close`
  wired. Need a new `FxcmOrderSheet` component (the Alpaca `OrderSheet` is not
  reusable — it hardwires Alpaca schemas). Fields: instrument, buy/sell, amount
  in lots, order type (market / stop / limit), rate, stop, limit.
- **Positions panel** — `GET /api/fxcm/positions` returns open trades from the
  ForexConnect TRADES table. Add a `FxcmPositions` table or card list to
  ForexDiscoverPage. Columns: instrument, direction (B/S), lots, open rate,
  current rate, P&L. A "Close" button per row calls `POST /api/fxcm/close`.
- **Closed trades / P&L history** — `GET /api/fxcm/closed_trades` is wired.
  Add a history table (instrument, direction, amount, open/close rates, P&L,
  date range). A mini P&L curve is possible if you aggregate `pl` by date.
- **Chart mode (History → TradingView)** — `GET /api/fxcm/history` returns
  OHLCV bars that match the TV bar format. The TV datafeed (`lib/tv-datafeed.ts`)
  needs a branch: when `assetClass === "forex"`, call `getFxcmHistory(instrument,
  timeframe)` instead of `/api/bars`. The `isCryptoSymbol` slash conflict must
  be resolved first (see landmines → FXCM bridge).
- **`isCryptoSymbol` slash conflict resolution** — `lib/asset-class.ts` uses
  `symbol.includes("/")` for crypto fast-detection; forex pairs also contain
  slashes. Fix: add an `assetClass` parameter to `isCryptoSymbol`, or rename it
  to `isSlashSymbol` and gate the crypto constraint in `useOrderTicket` behind
  an explicit `assetClass === "crypto"` check instead.
- **Real-time price push** — current 3 s polling works but the bridge could use
  ForexConnect's subscription model (`fc.subscribe_rate`) and SSE-push to the
  frontend. The bridge already has `threading.Lock` around session use; a
  subscriber callback can push into an `asyncio.Queue` bridged via a FastAPI SSE
  route at `/api/fxcm/stream`.
- **Bridge process management** — no auto-start, no health-restart, no PID
  tracking. Options: a PowerShell startup script, a Windows Task Scheduler
  entry, or a simple watchdog loop in the bridge itself. The frontend offline
  notice already handles the bridge being down gracefully.
- **Credentials in environment** — currently hardcoded constants in `bridge.py`.
  Extract to env vars (`FXCM_USER`, `FXCM_PASS`, `FXCM_URL`, `FXCM_ENV`) via
  `python-dotenv` before committing any live/real account details.
- **Spread pip denominator from OFFERS table** — the `digits` field in the
  ForexConnect OFFERS row gives the correct precision per instrument (typically
  5 for most forex pairs, 3 for JPY). `ForexDiscoverPage` currently hardcodes
  the JPY / non-JPY split; use `price.digits` from the enriched price row instead.
- **Watchlist customisation** — the bridge's `DEFAULT_WATCHLIST` is a hardcoded
  constant. Options: store user watchlist symbols in localStorage (simple) or
  persist them via a new `/api/fxcm/watchlist-prefs` endpoint backed by the
  bridge's in-memory state.
- **DB seeding of FXCM instruments** — 737 instruments are cache-only in the
  bridge. If we want the asset catalogue to cover forex (for the AI `find_symbol`
  tool, Chart search, etc.), add a `POST /api/_dev/seed-fxcm` routine that reads
  the bridge's `/instruments` endpoint and upserts into the Supabase `assets`
  table with `asset_class='forex'` (a new value — schema migration needed).
- **Account hub metrics** — the FXCM account card in `AssetClassSplash`
  currently shows placeholder zeros (no positions, zero equity). Wire it to
  `getFxcmAccount()` + `getFxcmPositions()` so the splash shows real FXCM
  balance and open position count alongside the Alpaca silo cards.

## Data / persistence

- **Postgres-backed app data** — trade journal, server-side watchlists, and
  finer analytics / P&L history still live in direct-Alpaca + `localStorage`;
  move them onto the Supabase layer.
- **Catalogue refresh policy** — no automated re-enrich / new-listing refresh
  (no TTL; `enriched_at` is visibility-only). Feasible on the paid FMP Starter
  tier (~1.5–2.5 h full re-enrich, under 300/min). Parked by choice — slow-moving
  fields, low-stakes staleness.
- **Catalogue / screener UI + company card** — a Discover/Chart surface over the
  enriched universe; the backend (`get_asset_profile` / `screen_assets`) exists,
  this is the frontend piece.
- **"Similar to X"** — a cheap structured-peers SQL tool (sector/industry +
  market-cap/beta proximity), or full pgvector RAG over stored descriptions;
  prefer the structured version first.
- **Calendar follow-ups** — the FMP earnings/economic calendars
  (`calendar_fmp.py`) shipped Discover-only-ish (stocks Discover cards + a
  symbol-linked Workspace earnings widget). Deferred by choice: an **economic
  Workspace widget** (whole-market, locked-channel — skipped for now), a
  **crypto-silo economic card** (macro affects crypto too), **AI read tools** so
  the bot can *answer* earnings/economic questions in text (today it can only
  *place* the earnings widget), and **user-configurable windows / impact / region**
  (currently fixed: earnings +14d, economic +7d US high+medium).
- **Per-silo P/L curve granularity** — `/api/pnl-history` (`alpaca/pnl.py`)
  rebuilds the curve from FILL activities (FIFO) at *daily* closes with a cost
  anchor + live tip. Intraday shape between trades isn't captured, FIFO is
  assumed, and fees fold into the fill price. A finer, snapshotted curve (and
  realized/fee separation) would ride on the Postgres layer.

## Orders

- **Complex order classes (bracket / OCO / OTO) — order-entry UI.** Backend is
  fully plumbed (`SubmitOrderRequest.order_class` + TP/SL legs in `schemas.py` /
  `alpaca/trading.py`; `SubmitOrderInput` mirrors it), but `useOrderTicket` has
  no `order_class` state and `OrderSheet` never sets it, so every order submits
  `simple`. Equities support bracket/oco/oto; **crypto does not** — gate the UI
  on `!isCrypto`. The same `useOrderTicket` + `OrderSheet` extension serves the
  chart-mode bracket item below.
- **Bracket / OCO from the TV order dialog** — `tv-broker.ts` `placeOrder()`
  maps to simple market/limit/stop only; wire `order_class=bracket` with
  `take_profit` / `stop_loss` legs.
- **Replace / modify order from a TV price-line drag** — `ModifyOrderCard` ships
  for the blotter (`PATCH /api/orders/{id}`), but TV's `modifyOrder(orderId,
  data)` (fired when dragging an open-order line) isn't wired in `tv-broker.ts`.

## Ask anything

- **Modify / cancel-order intents** — `lib/ask-intent/` returns `fallback` for
  "move my AAPL limit to 195" / "cancel order abc123". Blocker is fuzzy order
  matching from a phrase; needs a disambiguator when multiple working orders
  share a symbol.
- **"Open Chart mode and continue in ChartBot →" fallback** — when the bot gets a
  chart-ish prompt out of its lane (e.g. "draw a trendline" from Discover),
  suggest opening Chart mode and pre-seed the ChartBot panel with the phrase.

## Workspace

- **Split `components/Workspace.tsx` (~1780 lines)** — the container holds six
  self-contained toolbar sub-components (`AddWidgetMenu`, `LayoutsMenu`,
  `SavedLayoutRow`, `ChannelChip`, `EmptyState`, `ChannelsStrip` — ~1190 lines
  together) plus the layout/channel persistence helpers. Extracting the toolbar
  into `components/workspace/` would leave the container ~520 lines. Deferred
  because it's desktop-only Dockview UI that can't be exercised in the cloud
  sandbox, so the split needs local verification before it ships.
- **AI-saved named layouts** — named user layouts now ship (the Layouts menu's
  "My layouts": Save current as… / Apply / Rename / Delete, persisted in the v2
  `saved` map as `{ layout, channels }`). The AI builder still writes its custom
  grid into `active` (named `"custom"`), not `saved`; wiring it to save a named
  layout is the remaining gap.

## Chart mode

- **Multi-pane chart layouts** — TV's `setLayout()` / `chartsCount()` give 2×1 /
  2×2 splits, but broker, datafeed, drawings replay and AI `chart_context` all
  assume `widget.activeChart()`. Safe support needs per-chart routing through all
  of them — a dedicated branch when there's a real use case.
- **AI saveChart / loadChart** — TV can persist whole chart layouts (symbol,
  drawings, studies, view state); needs the Postgres storage layer.
- **Discover-mode ChartBot** — the ChartBot panel is Chart-mode-only; extending
  to Discover needs a mode-aware prompt, a trimmed tool set, and a UI surface.
- **`createAlert` integration** — TV has a native alert API but no notification
  path exists yet; defer until alerts have somewhere to go.
- **Real `onStudyAdded` / `onStudyRemoved` events** — the bundled TV build
  doesn't expose them, so `ChatContextPills` polls
  `getAllStudies()` every 1.2 s; replace with subscriptions if a future build
  ships them.
- **Positions strip narrow-desktop band** — the 641–720px band (large-phone
  landscape / small windows) still renders the compressed desktop grid; a fluid
  grid or a lower card breakpoint would tidy it.

## Crypto

- **Crypto movers / screener** — Alpaca has no gainers/losers/most-active for
  crypto. The Ask bar derives movers client-side from ticker snapshots, but the
  crypto Discover surface has none; a Yahoo or CoinGecko fallback could fill it.
- **Crypto streaming on the Render relay** — `CryptoQuoteHub` is wired but only
  tested locally; verify Render holds both `StockDataStream` and
  `CryptoDataStream` simultaneously without OOM.

## Mobile

- **Combined Discover hero + merged movers card (≤640px)** — build the combined
  `HeroCardMobile` (donut → horizontal allocation bar) and a merged
  Gainers/Losers/Active tabbed card (currently two stacked cards each).
- **On-device verification** — the mobile layer is typechecked + prod-built but
  not validated on real devices / simulators (iPhone 12 / SE, iPad portrait) or
  as an installed PWA.

## Security

- **Write-auth gate (Charter Hard Rule #3)** — `require_write_auth` in
  `backend/app/main.py` is a no-op seam; flip it to a shared-token check before
  any non-paper / non-private exposure. Deferred by decision (paper account).

## Misc

- **Calendar exceptions chip** — the "Cal · N exceptions" popover (holidays +
  half-days, next 21 days) was removed from `TopBar.tsx`; `useCalendar` +
  `/api/calendar` are still wired. Restore as a dedicated surface (a Discover
  calendar widget or Markets item) rather than back in the (now-deleted)
  status strip.

## V1 UX-sweep follow-ups

- **PnL window switcher (1D / 1W / YTD).** `DiscoverHero` + `PortfolioHero`
  designs called for a 1D/1W/1M/YTD/ALL segmented control above the curve.
  Backend `/api/pnl-history` (`backend/app/alpaca/pnl.py`) currently supports
  only `1M`/`3M`/`1Y`/`ALL`. Adding 1D needs intraday-bar valuation; 1W needs
  the same; YTD is trivial. Switcher waits on the backend periods.
- **Realised-today stat in `PortfolioHero`.** Spec wanted a 2×2 grid with
  Cash · BP · Total P/L · Realised today. No per-day realised field on
  `/api/account`. Could derive from `pnl[len-1] - pnl[len-2]` of the
  net-P/L curve, but the curve is anchored on open-position cost so the
  derivation is fiddly. Currently substituted with "Open orders".
- **Activities "View all" footer / pagination.** Spec wanted Activities
  capped at 8 with a "View all →" link. No full-page Activity route exists;
  the existing 25–50 fills list stays. Add a `/activity` route (or a modal)
  and the footer link.
- **Real-token-median calibration for AI cost estimates.** `lib/ai-cost.ts`
  uses eyeballed per-surface token medians (input + output) keyed off the
  prompt sizes in `backend/app/ai/router.py`. Log actual `/api/ai/ask`
  usage_metadata and update the `USAGE` table from real medians; multiply
  ChartBot by the observed tool-loop iteration distribution rather than the
  current static `iterMultiplier: 2`.
- **Full Tailwind preflight enable** (a.k.a. priority #12 Option A from the
  V1 sweep handoff). `app-reset.css` covers the most-visible defaults today.
  Enabling preflight properly will regress hand-styled surfaces that never
  finished the utility migration — audit + fix surface-by-surface before
  flipping `corePlugins.preflight: true`.
