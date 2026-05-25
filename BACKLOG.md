# Backlog

Outstanding work only — shipped / historic notes are intentionally not kept
here; use `git log` for that.

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

- **Split `components/Workspace.tsx` (~1325 lines)** — the container holds five
  self-contained toolbar sub-components (`AddWidgetMenu`, `LayoutsMenu`,
  `ChannelChip`, `EmptyState`, `ChannelsStrip` — ~860 lines together) plus the
  layout/channel persistence helpers. Extracting the toolbar into
  `components/workspace/` would leave the container ~450 lines. Deferred because
  it's desktop-only Dockview UI that can't be exercised in the cloud sandbox, so
  the split needs local verification before it ships.
- **Named user layouts** — the v2 persistence shape reserves
  `saved: Record<name, layout>` for "Save current as…"; build the Save / Rename /
  Delete UI in the Layouts menu (the popover already has the card grid + Apply
  confirm to extend). The AI builder currently writes its custom layout into
  `active` (named `"custom"`), not `saved`.

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
  doesn't expose them, so `IndicatorPillsRow` / `ChatContextPills` poll
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
  calendar widget or Markets item) rather than back in the status strip.
