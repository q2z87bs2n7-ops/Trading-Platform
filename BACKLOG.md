# Backlog

## Existing

- **Postgres persistence layer** — trade journal, server-side watchlists,
  analytics history. Replaces direct-Alpaca-only reads + `localStorage`
  prefs. Free tier (Supabase/Neon).
- **Write-auth gate (Charter Hard Rule #3)** — `require_write_auth` in
  `backend/app/main.py` is an intentional no-op seam; flip it to a
  shared-token check before any non-paper / non-private exposure.
  Deferred by decision (paper account).
- **Orphaned component cleanup (post UI-playground sprint)** — five
  component files are no longer imported anywhere but are kept in the
  tree for a clean revert path: `MarketClock.tsx`, `Calendar.tsx`,
  `AccountSummary.tsx`, `PortfolioSummary.tsx`, `InstrumentInfo.tsx`.
  Their data hooks (`useClock`, `useCalendar`, `useAccount`,
  `usePortfolioHistory`, `useAsset`) are now consumed directly by
  `TopBar.tsx` and `PriceChart.tsx`. Delete the five files once the
  UI sprint is confirmed sticky.

## TradingView mode

- **Bracket / OCO orders** — TV's order dialog supports bracket orders
  natively; `tv-broker.ts` `placeOrder()` currently maps to simple
  market/limit/stop only. Wire `bracket` order type to Alpaca's
  `order_class=bracket` with `take_profit` / `stop_loss` legs.
- **Replace / modify order** — TV calls `modifyOrder(orderId, data)` when
  a user drags a price line; `tv-broker.ts` has no `modifyOrder` method.
  Wire to `PATCH /api/orders/{id}`.
- **Account equity in TV header** — `accountInfo()` returns buying power
  and equity, and the Account Manager summary row updates live via
  `WatchedValue`s. TV's header strip (top-right of the chart) is a
  separate surface that has not been verified — confirm it shows the
  paper-account currency / equity correctly.
- **TV watchlist sync** — TV mode starts on the symbol selected in the
  custom UI watchlist, but switching symbols inside TV does not update
  the shared `selected` state. Add a `onSymbolChange` callback via
  `widget.activeChart().onSymbolChanged()` to keep both modes in sync.

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
  layer above. Naming convention TBD (per-user named views).
- **Discover-mode AI** — the chat panel is ChartBot-mode-only today. Extending
  to Discover needs a mode-aware system prompt, a trimmed tool set
  (no chart-only tools), and a new UI surface (cards over the
  existing tiles, or a separate panel). Bigger than a tool addition.
- **`createAlert` integration** — TV has a native alert API but no
  notification path exists in this app; defer until alerts have
  somewhere to go.
