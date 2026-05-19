# Backlog

## Existing

- **Calendar UI tile** — `/api/calendar` exists and is wired in
  `api.ts`/`types.ts`; no UI surface yet.
- **Postgres persistence layer** — trade journal, server-side watchlists,
  analytics history. Replaces direct-Alpaca-only reads + `localStorage`
  prefs. Free tier (Supabase/Neon).
- **Write-auth gate (Charter Hard Rule #3)** — `require_write_auth` in
  `backend/app/main.py` is an intentional no-op seam; flip it to a
  shared-token check before any non-paper / non-private exposure.
  Deferred by decision (paper account).

## TradingView mode

- **Bracket / OCO orders** — TV's order dialog supports bracket orders
  natively; `tv-broker.ts` `placeOrder()` currently maps to simple
  market/limit/stop only. Wire `bracket` order type to Alpaca's
  `order_class=bracket` with `take_profit` / `stop_loss` legs.
- **Real-time bar updates** — `subscribeBars()` in `tv-datafeed.ts`
  forwards SSE quote ticks as bar updates; bar OHLC is approximated from
  bid/ask. A proper implementation would maintain a rolling current-bar
  accumulator keyed by resolution bucket.
- **Replace / modify order** — TV calls `modifyOrder(orderId, data)` when
  a user drags a price line; `tv-broker.ts` has no `modifyOrder` method.
  Wire to `PATCH /api/orders/{id}`.
- **Account equity in TV header** — `accountInfo()` returns buying power
  and equity but TV's header display depends on `currentAccount()` +
  `accountsMetainfo()` currency matching. Verify display once broker is
  fully stable.
- **TV watchlist sync** — TV mode starts on the symbol selected in the
  custom UI watchlist, but switching symbols inside TV does not update
  the shared `selected` state. Add a `onSymbolChange` callback via
  `widget.activeChart().onSymbolChanged()` to keep both modes in sync.
