# Backlog

## Existing

- **Postgres persistence layer** — free-tier Supabase. **Shipped:** the
  `assets` catalogue (`db.py` + `coingecko.py` + `fmp.py`, seeded via the
  `/api/_dev/seed-assets` and `/api/_dev/enrich-stocks` dev tools) — full
  Alpaca universe with CoinGecko crypto + FMP stock enrichment, live in prod
  (see `docs/database.md`). The DB-backed, visibility-filtered search now powers the
  watchlist autocomplete, chart search, and the bot's `find_symbol`; stock
  enrichment backfills via `enrich-stocks?limit=N`. Still backlogged on this
  layer: trade journal, server-side watchlists, finer analytics/P&L history.
  **Shipped since:** `get_asset_profile` + `screen_assets` (structured catalogue
  filter with `sort_by` + industry did-you-mean) in the Ask-anything/ChartBot
  read-tool set (`ai/tools_read.py`, executed in `ai/router.py`). See
  `docs/database.md`. Follow-ups (all **parked by decision, May 2026**):
  - **Refresh policy** — backfill exists, but there's no automated re-enrich /
    new-listing refresh (no TTL; `enriched_at` is visibility-only). Now feasible
    on the paid FMP Starter tier (~1.5–2.5 h full re-enrich, under 300/min);
    parked by choice — slow-moving fields, low-stakes staleness.
  - **Catalogue/screener UI + company card** — Discover/Chart surface over the
    enriched universe; backend (`get_asset_profile`/`screen_assets`) is done, this
    is the remaining frontend piece.
  - **"Similar to X"** — a cheap structured-peers SQL tool (sector/industry +
    market-cap/beta proximity) or full pgvector RAG over stored descriptions;
    prefer the structured version first.
  - **Catalogue-grounded market summary** — parked: the catalogue is static (no
    price/time-series), so it adds little to the movers+news summary.
- **Per-silo P/L curve granularity** — `/api/pnl-history` (`alpaca/pnl.py`)
  reconstructs the curve from FILL activities (FIFO) valued at *daily*
  closes, with a cost anchor + live tip. Intraday shape between trades is
  not captured, FIFO is assumed, and fees are folded into the fill price.
  A finer, snapshotted curve (and realized/fee separation) would ride on
  the Postgres layer above.
- **Complex order classes (bracket / OCO / OTO) in the order ticket** — the
  backend is fully plumbed end-to-end: `SubmitOrderRequest` carries
  `order_class` + the take-profit / stop-loss legs (`backend/app/schemas.py`),
  `_build_order_request` maps them onto the alpaca-py request
  (`backend/app/alpaca/trading.py`), and `SubmitOrderInput`
  (`frontend/src/types.ts`) mirrors the contract. The only missing piece is the
  **order-entry UI** — `useOrderTicket` has no `order_class` state and
  `OrderSheet` never sets it, so every submitted order is `simple` (the
  blotter only *reads back* a class for display in `Orders.tsx`). Equities
  support bracket/oco/oto; **crypto does not** (simple only), so gate the new
  UI on `!isCrypto`. Overlaps the chart-mode bracket item under "Chart mode"
  below — same `useOrderTicket` + `OrderSheet` extension would serve both.
- **Write-auth gate (Charter Hard Rule #3)** — `require_write_auth` in
  `backend/app/main.py` is an intentional no-op seam; flip it to a
  shared-token check before any non-paper / non-private exposure.
  Deferred by decision (paper account).
- **Calendar exceptions chip in TopBar** — the "Cal · N exceptions"
  click-popover (holidays + half-days in the next 21 days) was removed
  from `TopBar.tsx` because the Portfolio strip felt over-busy. The
  `useCalendar` hook and `/api/calendar` endpoint are still wired up
  and tested; restoring is a copy-paste of the prior block. Likely
  better as a dedicated surface (a calendar widget in Discover or a
  Markets-section item) than back in the status strip.

## Ask anything

- **Modify / cancel-order intents.** `lib/cmd-intent.ts` returns
  `fallback` for "move my AAPL limit to 195" and "cancel order abc123".
  Cards exist in the design (`Modify card w/ old/new prices`,
  `Confirm + undo`); the blocker is fuzzy order matching from a phrase
  ("my AAPL limit" → which open AAPL order). Needs a small disambiguator
  pass when the user has multiple working orders for the same symbol.
- **"Open Chart mode and continue in ChartBot →" fallback.** When ⌘K
  receives a chart-ish prompt out of its lane (e.g. "draw a trendline"
  from Discover), the fallback card should suggest opening Chart mode
  and pre-seeding the ChartBot panel with the user's phrase. Wires the
  two AI surfaces into a coherent flow.

## Chart mode

- **Bracket / OCO orders** — TV's order dialog supports bracket orders
  natively; `tv-broker.ts` `placeOrder()` currently maps to simple
  market/limit/stop only. Wire `bracket` order type to Alpaca's
  `order_class=bracket` with `take_profit` / `stop_loss` legs. Same
  hook would extend `useOrderTicket` and surface bracket fields in
  `OrderSheet`.
- **Replace / modify order from TV price-line drag** — `ModifyOrderCard`
  ships for the Orders blotter (wired via `PATCH /api/orders/{id}`),
  but TV's `modifyOrder(orderId, data)` (called when a user drags an
  open-order price line on the chart) is not wired in `tv-broker.ts`
  yet. Hook it to the same endpoint.
- **Positions strip narrow-desktop band** — the mobile redesign added a
  stacked `StripRowMobile` card at ≤640px, so phones no longer get the
  cramped 6-column grid. The 641–720px band (large phone landscape / small
  windows) still renders the compressed desktop grid; a fluid grid or
  lowering the card breakpoint would tidy it.
- **Real `onStudyAdded` / `onStudyRemoved` events** — the bundled TV
  build doesn't expose them, so `IndicatorPillsRow` and
  `ChatContextPills` poll `getAllStudies()` every 1.2 s. If a future
  TV build ships the subscriptions, replace the polling.

## AI chart assistant — deferred

- **Multi-pane chart layouts** — TV exposes `setLayout()` /
  `chartsCount()` for 2×1 / 2×2 splits, but our broker, datafeed,
  drawings replay, and AI `chart_context` all assume
  `widget.activeChart()`. Doing it safely needs per-chart routing
  through every one of those surfaces. Significant rework — worth a
  dedicated branch when there's a real use case.
- **AI saveChart / loadChart** — TV's `saveChart()` / `loadChart()` can
  persist whole chart layouts (symbol, drawings, studies, view state).
  Needs a storage layer; do this on top of the Postgres persistence
  layer above.
- **Discover-mode AI** — the ChartBot panel is Chart-mode-only today.
  Extending to Discover needs a mode-aware system prompt, a trimmed
  tool set (no chart-only tools), and a new UI surface. The ⌘K bar
  covers the casual side of this; a deeper ChartBot-equivalent for
  portfolio reasoning is a separate question.
- **`createAlert` integration** — TV has a native alert API but no
  notification path exists in this app; defer until alerts have
  somewhere to go.

## Mobile

The phased mobile redesign (P0–P6 + UAT fixes, v0.40.2–0.41.0; spec in
`Handover Mobile Trading.html`) shipped behind the ≤640px breakpoint.
Two follow-ups were deliberately left:

- **Combined Discover hero + merged movers card (≤640px)** — P5 kept
  `BalanceCard` + `AllocationCard` as two stacked cards and `MoversCard` +
  `MostActiveCard` as two stacked cards, rather than building the handover's
  combined `HeroCardMobile` (donut → horizontal allocation bar) and merged
  Gainers/Losers/Active tabbed card. Both already stack cleanly on mobile;
  the rebuilds were deferred as density polish (and to honour the
  "no rewrites" rule). The spec's §5.2 / §5.4 have the design if wanted.
- **On-device verification** — the mobile layer was typechecked +
  production-built but not yet validated on real devices / simulators
  (iPhone 12 / SE, iPad portrait) or as an installed PWA. Run the per-phase
  device checklists + the cross-cutting matrix from the handover spec before
  promoting to `main`.

## Crypto

- **Crypto movers / screener** — Alpaca has no gainers/losers or
  most-active endpoint for crypto. The Ask-anything bar now derives a
  movers view client-side from the crypto ticker snapshots, but the
  crypto Discover surface (`DiscoverPage`, crypto silo) still has none; a
  Yahoo Finance or CoinGecko fallback could fill that gap with a broader
  universe.
- **Crypto streaming on Render relay** — `CryptoQuoteHub` is wired but
  only tested locally. Verify the Render deployment holds both
  `StockDataStream` and `CryptoDataStream` connections simultaneously
  without OOM.

## Workspace

Desktop-only dockable widget canvas (`components/Workspace.tsx` +
`lib/workspace/registry.tsx`, Dockview). Phase-1 spike shipped: dock / tab-stack
/ float, per-silo layout persistence, add-widget toolbar.

- **Chart widgets use the bare TradingView chart widget** — TV's own chart and
  native controls only. Do not reuse the `TVPlatform` chrome
  (`ChartTopBar` / `IndicatorPillsRow` / `ChartBlotter` / floating `TradeBar`),
  and never use a homegrown chart (`PriceChart.tsx` / lightweight-charts). The
  Phase-1 Chart widget still embeds `TVPlatform`; swap it to a bare TV widget
  when the Workspace is built out.
