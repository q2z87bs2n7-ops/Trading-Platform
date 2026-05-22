# Backlog

## Existing

- **Postgres persistence layer** — trade journal, server-side watchlists,
  analytics history. Replaces direct-Alpaca-only reads + `localStorage`
  prefs. Free tier (Supabase/Neon).
- **Per-silo P/L curve granularity** — `/api/pnl-history` (`alpaca/pnl.py`)
  reconstructs the curve from FILL activities (FIFO) valued at *daily*
  closes, with a cost anchor + live tip. Intraday shape between trades is
  not captured, FIFO is assumed, and fees are folded into the fill price.
  A finer, snapshotted curve (and realized/fee separation) would ride on
  the Postgres layer above.
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

## ⌘K command bar

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
- **Positions strip mobile layout** — the 6-column `gridTemplateColumns`
  template compresses below ~720px. Functional but visually cramped;
  a separate two-row mobile template would read better.
- **Real `onStudyAdded` / `onStudyRemoved` events** — the bundled TV
  build doesn't expose them, so `IndicatorPillsRow` and
  `ChatContextPills` poll `getAllStudies()` every 1.2 s. If a future
  TV build ships the subscriptions, replace the polling.
- **TV `changeTheme()` instead of remount** — phase 7's `TVPlatform`
  recreates the widget on theme toggle because this build's
  `changeTheme` isn't reliable. Drawings + studies + active TF all
  reset across the swap. Move to `changeTheme()` once available.

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

## Crypto

- **Crypto movers / screener** — Alpaca has no gainers/losers or
  most-active endpoint for crypto. A Yahoo Finance or CoinGecko fallback
  could fill this gap on the CryptoTools Discover page.
- **Crypto streaming on Render relay** — `CryptoQuoteHub` is wired but
  only tested locally. Verify the Render deployment holds both
  `StockDataStream` and `CryptoDataStream` connections simultaneously
  without OOM.
