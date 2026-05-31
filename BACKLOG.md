# Backlog

Outstanding work only — shipped / historic notes are intentionally not kept
here; use `git log` for that.

## CFDs (FXCM)

Bridge live on Render alongside the relay; Discover, order entry, positions,
chart, the FXCM-aware classifier, and the full **Workspace** integration (CFD
is a first-class silo across every widget) are all shipped (see `docs/fxcm.md`
and `docs/workspace.md` for the full reference). Outstanding:

- **CFD Scalp mode — productionise the MOCK.** `CfdScalpPage.tsx` is a
  deliberate foundation for design to redo the front end; the intent is a
  traditional forex-broker rapid-trade surface (bid/ask one-click rate
  tiles, flashing ticks, deal ticket, small-frame chart). *Done since the
  first cut:* lot presets are now **per-instrument-type** (FX units vs
  non-FX `×base_unit_size` contracts), the big-figure split + tick flashes
  read the bridge **instrument metadata** (`point_size`-located pip,
  per-side ½-point dead-band so sides don't strobe in lockstep), close-all
  is sequential (single JVM session), a **1-click/confirm toggle** gates
  execution (OFF arms the button for a second "Confirm" click), every
  execution path raises a **success toast**, and the focus-column chart now
  leads with a **scalping preset** (`CfdPriceChart` opens on m1 zoomed to
  the recent bars via additive `defaultTimeframe`/`barsToShow` props).
  Remaining gaps to close once design lands: (1) **real ticks — DONE** —
  prices now ride the FCLite-push SSE feed (`useFxcmPriceStream` →
  `/api/fxcm/stream`), 1 s `/prices` poll kept as fallback; the chart tip /
  CfdDiscoverPage watchlist are the only CFD surfaces still polling. (2) **SL/TP** — the
  deal-ticket inputs are a visual stub; wire `stop`/`limit` into
  `submitFxcmOrder` (the `FxcmOrderRequest` fields exist but are untested
  from the UI — the proven path only sends OM market orders). (3) **true
  tick / sub-minute chart** — the m1 preset is the closest available; a real
  tick chart needs the push feed. (4) **mobile** — scalp is desktop-only
  (guard bounces mobile to Discover); design a phone layout if wanted. (5)
  entry is the splash CFD card's "⚡ Scalp" affordance — revisit
  discoverability (a header indicator while on scalp, etc.). (6) the
  `cfdDigits()` fallback heuristic disagrees with the bridge for gold
  (returns 4dp; FXCM quotes XAU/USD at 2dp) — harmless while subscribed
  (bridge `digits` wins) but worth reconciling app-wide. (7) persist the
  1-click toggle preference (currently resets each mount).
- **Price alerts — server-side + delivery (future).** Shipped now:
  client-side rate-cross alerts (`lib/alerts.ts`, `CfdAlertEngine`,
  `CfdAlertsPanel`) that fire a toast + Web-Audio chime *while the app is
  open*, persisted to `localStorage('cfd_alerts_v1')`. Deliberately scoped:
  no server watcher, no push (out of scope for the build). To make alerts
  fire when the tab is closed, move monitoring server-side — there's a
  natural home (Render is always-on, already polls the FXCM bridge; rules
  could move to Postgres behind the same `lib/alerts.ts` seam) — and add a
  delivery channel (Web Push/VAPID or a Telegram bot are the free,
  single-user-friendly options; SMS/Twilio is per-message cost). Cheap
  extra alert types if wanted: **spread-widen** (alert when spread > X pts —
  genuinely useful to a scalper) and **% / daily-change** thresholds; the
  alert model is typed for `direction`/`source` so a `type` discriminator
  slots in without a rewrite.
- **CFD Workspace Watchlist — Cards view** — the CFD Watchlist widget is
  **List-only** (mid price + live spread). The SparkCard grid + Cards/List/Auto
  toggle (as in stocks/crypto) need per-instrument daily bars; wire `useFxcmBars`
  per row (or a batch FXCM history endpoint) and render through `SparkCard` with
  CFD `digits` precision.
- **Local Ask-intent — CFD trade/close intents** — the parser is otherwise
  CFD-aware (FXCM instruments validate via the classifier cache, chart /
  set-channel / watch / build resolve to the cfd silo, capability chips are
  CFD-specific). The one gap left: a CFD "buy/sell/close" defers to the AI
  fallback rather than driving a local FXCM trade flow, because ask-intent has
  no FXCM order/close intent type. Add one (open `FxcmOrderSheet` /
  `FxcmClosePositionCard`) to handle those locally; the post-answer follow-up
  chips for those turns are also still stock-flavoured.
- **Non-US stock-CFD research** — Profile/Fundamentals work for any FMP-enriched
  stock CFD, but the Tipranks widgets (SmartScore/Sentiment/Analysts/HedgeFunds/
  Insiders/RelatedTickers/HolderDemographics) only resolve US stock CFDs —
  `.us` (regular) and `.ext` (24-hour US shares) — to a US ticker
  (`cfdUsUnderlying`). Non-US listings (`.de`/`.hk`/…) show the notice; mapping
  them via `fmp_ticker` would extend coverage where Tipranks has the name.

- **FCLite push subscription — DONE (Scalp + alerts).** Wired
  `IOffersManager.subscribeOfferChange` in the bridge into a push-maintained
  offer cache, exposed via a fast `/prices/live` map read, and fanned out by a
  QuoteHub-style SSE hub at `/api/fxcm/stream` (per-client bounded queue,
  drop-oldest, replay-latest-on-connect, supervisor that never crashes the
  process). Frontend rides it via the ref-counted `data/fxcmPriceStream.ts`
  singleton + `useFxcmPriceStream` hook (mirrors `quoteStream.ts`): Scalp mode
  and `CfdAlertEngine` now consume the stream, with the 1 s `/prices` poll kept
  as the automatic fallback. **Still on the 3 s poll:** the CFD chart's live
  tip and `CfdDiscoverPage` watchlist — point them at `useFxcmPriceStream` to
  finish removing the polling cadence floor there too.
- **Live current-bar updates in the CFD chart** — `subscribeBars` is a
  no-op in CFD mode (the bridge has no SSE bar stream). Either synthesize
  a partial bar from the push-subscription quotes above, or add a
  bar-aggregation step to the bridge.
- **CFD order / position UI inside the TV account manager** — `createBroker`
  short-circuits all Alpaca routes in CFD mode and the panel stays empty.
  A "CFD broker" branch could wire `getFxcmPositions` / `getFxcmOrders` /
  `placeFxcmOrder` into the TV broker surface for in-chart trading.
- **Spread pip denominator from OFFERS `digits`** — `FxcmPrice.digits` is
  already on the wire; `CfdDiscoverPage` and the chart status row hardcode
  100000/1000 for non-JPY/JPY. Replace with `digits`-derived multiplier so
  exotic-precision instruments display correctly.
- **JWT refresh-token rolling flow** — `backend/app/fxcm_auth.py` currently
  re-mints via `/iam/authenticate` every ~50s. FXCM also exposes
  `POST /iam/refresh` (cookies + CSRF echo) that mints a fresh 60s
  accessToken from a 30-day refreshToken — saves 1 req/min to FXCM at the
  cost of a stateful cookie jar in the proxy. Worth wiring when multi-user
  or live-trading scope makes the saved requests material. Spec
  documented in `docs/fxcm.md` → "Auth flow".
- **FXCM-side subscription resolution** — many FXCM instruments have
  `Status: "D"` (not subscribed) on our demo account. They appear in
  search/watchlist add but their bars/prices/history calls bridge through
  to a "not subscribed" error from FCLite. FCLite SDK exposes
  `instrumentsManager.subscribeInstruments([symbols], callback)` — wire
  that into a `POST /api/fxcm/subscribe` route so the user can resolve
  subscriptions on demand. Right now the workaround is to leave status-D
  instruments alone or pre-subscribe via the FXCM web UI.
- **Bridge reconnect on FCLite disconnect** — `FxcmSession.connect()` only
  uses the connection-status listener to fire the initial latch; a later
  `isDisconnected()` does nothing. If FCLite drops mid-run, every route
  returns errors until Render restarts the container. Add a watchdog: flip
  `connected = false` on disconnect, kick off `session.connect()` from a
  background thread with exponential backoff. Render's container-restart
  covers the coarse case but a finer recovery is cheap to add.
- **Bridge-side `/api/fxcm/instruments` field normalisation** — the endpoint
  returns raw FCLite `InstrumentInfo` (`Name` / `OfferId` / `Status`, PascalCase)
  while `/watchlist`, `/prices`, `/positions` all use snake_case. Currently
  normalised at the api.ts boundary; fixing it in the bridge handler keeps
  the contract consistent for any future direct consumer.
- **FXCM cancel-all orders** — bridge has only single-cancel. Add a
  `DELETE /api/fxcm/orders` route in the proxy that fetches the list and
  iterates `DELETE /api/fxcm/order/{id}`. Defer until the Orders blotter UX
  demands it.
- **Verify CFD exposure semantics against the live demo account.** The Account
  Hub's Market-exposure axis (`lib/fxcm-exposure.ts`) computes notional as
  `|amount| × contract_multiplier × rate` (non-FX) / `|amount|` (FX), netting
  hedges within an instrument and converting to USD via the status-`V`/pair
  rate. This was derived, not yet checked against real positions — confirm once
  the bridge ships `contract_multiplier`/`contract_currency` on `/positions`
  that (a) `amount` is the contract count the formula assumes for
  indices/stock-CFDs (vs `amount/base_unit_size`), and (b) a known position's
  computed notional + leverage match the FXCM platform. Until then the axis
  degrades to multiplier 1 (understates indices/metals). Cross-currency
  conversion (non-USD `contract_currency` with no in-book pair) falls back to
  the contract-ccy figure and sets `approximate`.
- **FXCM rollover / dividend activity stream** — FCLite doesn't expose
  deposits, withdrawals, overnight swap, or stock-CFD dividend adjustments as
  discrete events. The FXCM Activities feed shows closed trades only.

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
  (currently fixed: earnings +14d, economic +7d US high+medium — CFD
  Discover overrides the region with an FXCM-derived country set).
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
