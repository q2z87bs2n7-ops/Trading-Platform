# CLAUDE.md

Guidance for working in this repo. Read in full before changing deploy
config, dependencies, or the streaming path. Companion docs:
`README.md` (setup & deployment), `BACKLOG.md` (deferred work),
`docs/landmines.md` (Vercel-Python / TradingView / streaming / FXCM details
that took several iterations to land — don't undo them),
`docs/workspace.md` (Workspace mode + module pattern), `docs/ai.md`
(the two AI surfaces), `docs/database.md` (Postgres asset catalogue),
`docs/tipranks.md` (Tipranks research API — endpoint inventory & auth
quirks, not yet wired), `docs/fxcm.md` (FXCM ForexConnect integration —
bridge architecture, SDK patterns, what's built, what's next).

## What this is

A serious hobby-grade paper-trading platform on the
[Alpaca](https://alpaca.markets/) API, with a third **CFD silo** powered by
the FXCM ForexConnect API. Full paper trading on Alpaca: orders
(market/limit/stop/stop-limit/trailing, bracket/OCO), cancel/replace,
close positions, portfolio & P/L, persisted watchlists, asset search,
real-time streaming. Supports **US equities**, **crypto**, and **CFDs
(FXCM demo account — forex, indices, metals, commodities, stock CFDs)**
in three separate silos. Alpaca silos are paper-only
— there is no live trading path. The FXCM silo is a POC against a demo
account via an FCLite Java bridge that runs as its own Render service
alongside the relay (see "Four runtime targets").

**Hard rules — do not cross without an explicit, deliberate decision:**

1. **Paper account ONLY.** Alpaca client is always `paper=True`; there
   is no live path.
2. **Single user; keys server-side only.** Alpaca credentials never
   reach the browser.
3. **Auth gate on writes.** Trade-mutating endpoints sit behind a
   shared token — currently a no-op seam (`require_write_auth` in
   `backend/app/main.py`). Flip before any non-paper exposure.
4. **Free / very-low-cost infra only.**

## Workflow rules (strict — override default behavior)

1. **Never assume** — always ask before proposing or touching code.
2. **Surgical edits only** — smallest possible change; don't reformat
   or reorganise surrounding code.
3. **No changes to `main` without explicit user approval.**
4. **Git branching** — all changes go to a `claude/` branch first; only
   merge to `main` when explicitly asked, and only as a fast-forward.
5. **Version every change** — root `VERSION` is the single source of
   truth (`X.Y.Z`). Each commit on a `claude/` branch bumps **Z**.
   Each promotion to `main` bumps **Y** and resets **Z** to 0, unless
   the user explicitly asks otherwise. Minor hotfix commits made
   directly on `main` (e.g. a one-line bug fix) bump **Z** by 1.
   **X** is bumped manually.
   Backend reads `VERSION` at startup (layout-tolerant + crash-proof —
   see `docs/landmines.md`); frontend syncs to `package.json` via
   `npm run sync-version` (auto-run pre-build).
6. **No rewrites** — targeted edits only.

## Architecture (high level)

- **Frontend:** React 18 + TypeScript + Vite, single-page (no router).
  On the **first session only** `AssetClassSplash.tsx` is shown as the
  landing screen, prompting the user to pick **Stocks**, **Crypto**, or
  **CFDs**. Once a silo is picked, `localStorage('splash_seen_v1')='1'`
  is set and every subsequent load lands straight on the last-used silo's
  Discover — **but only while the session is fresh**: a `last_active_at`
  timestamp (updated on interaction / focus) gates this, so a tab left
  dormant longer than `SESSION_TTL_MS` (10 min) re-shows the splash on its
  next load instead of silently resuming (`shouldShowSplash` in `App.tsx`).
  `localStorage('asset_class_mode')` is now **load-bearing** — it
  selects the silo the app boots into (was previously just a last-used
  hint). The header brand button re-opens the splash on demand as the
  **Account Hub**: a whole-account overview that is intentionally the
  *only* cross-silo balance surface — every other balance view is filtered
  to the active silo. Its breakdown is a **two-axis module**
  (`TwoAxisModule` in `AssetClassSplash.tsx`) toggling **Capital deployed**
  vs **Market exposure** — because the three products don't share one honest
  denominator (CFDs are leveraged up to 400:1, so value-weighting either
  hides their risk or drowns the spot silos). **Capital** = equity: the stock
  slice nets the Reg-T margin loan out (`stockMV − L`, `L = max(−cash,0)`,
  attributed wholly to stocks since crypto is non-marginable), cash floored
  at 0, CFD = FXCM account equity. **Exposure** = notional at risk: drops cash
  entirely, and the CFD slice swaps equity → notional (`lib/fxcm-exposure.ts`).
  Both modes badge the CFD slice with per-silo leverage
  (`notional ÷ used_margin`). Below the module sit two **Brokerage cards** —
  *Alpaca* (stocks/crypto/cash allocation bar + Stocks/Crypto silo-nav rows)
  and *FXCM* (margin-used gauge, Free margin / Exposure / Leverage stats,
  "Forex & CFDs", ⚡ Scalp corner) — which double as the silo picker. The CFD
  card pulls live FXCM equity / day P/L / positions / margin via
  `useFxcmAccount` + `useFxcmPositions` (30 s poll,
  `retry: 0`); both hooks fetch on **both** the first-time landing splash
  and the Hub overlay so the CFD card shows live equity/positions on first
  load (a bridge-offline 503 with `retry: 0` keeps the card on its `—`
  placeholder rather than reading `$0.00`). Switching silo also runs through the brand button
  → hub on desktop (the standalone stocks/crypto pill is gone); mobile
  keeps the inline toggle for fast access. Per-silo accent: stocks
  recolours the `--accent` tokens to green (`--pos`), crypto keeps the
  default blue, CFD uses orange/amber (`oklch(72% 0.18 55)`);
  `--pos`/`--neg` P/L colours are untouched. The header
  pill switches between four modes
  (persisted across reloads via `localStorage('platform_mode_v1')`;
  **Workspace** is desktop-only — a mobile reload that rehydrates
  `workspace` falls back to Discover). A fifth mode, **Scalp**, exists
  only in the **CFD silo** and is deliberately **not** a header pill —
  it's a rapid-trade surface reached from the **CFD card's "⚡ Scalp"
  affordance** on the splash / Account Hub (`CfdScalpPage.tsx`, see
  below). It's desktop- and CFD-only; a rehydrated `mode=scalp` on
  mobile or in a non-CFD silo falls back to Discover (mirrors the
  Workspace guard):
  - **Discover** (default) — one parameterized surface, `DiscoverPage.tsx`
    (`assetClass` prop), sharing the hero / AI summary / watchlist / inline
    chart / news scaffold across both silos and branching only where they
    differ. Silo-specific data hooks are gated with `enabled` so the inactive
    silo never fetches. Watchlist sparkline cards and the crypto ticker render
    the **live stream price** (`useLiveQuotes` quote mid) over the snapshot's
    `prev_close` (the daily-change baseline) — matching the chart and the
    Workspace Watchlist widget; the REST snapshot/ticker calls now seed only
    `prev_close`. The sparkline curve itself is **real recent daily closes**
    fetched once for the whole watchlist via `/api/bars/batch` (`useBarsBatch`,
    5-min refetch) and rendered through a tiny **lightweight-charts** area
    series (`SparkChart` inside `discover/SparkCard.tsx`) for visual parity
    with the Workspace Mini chart's spark tier. While bars are in flight
    the sparkline area is empty (no synthetic-curve fallback — the swap
    onto the LWC chart read as a visible flash); the price + day-% chip
    above the curve still render so cards are never fully blank. Each
    SparkChart overlays a dashed horizontal hairline at `closes[N-2]`
    via LWC's `createPriceLine` — yesterday's daily close, the same
    `prev_close` the day-% chip is measured against — so a sparkline
    trending up against a red day chip (or vice versa) is readable at
    a glance (tip below the line = today is down).
    **Desktop layout is a 2-col grid**: a sticky left **watchlist sidebar**
    (`260px` expanded — trimmed to `216px` on iPad portrait (641–1024px) so
    the chart / movers row doesn't get squashed; collapses to a `32px`
    chevron strip — state persisted
    in `localStorage('discover_sidebar_collapsed_v1')`) + main column with
    hero / AI summary / inline chart / movers / calendars / news. Clicking
    a sidebar card writes `selected` which drives the inline chart on the
    right. Mobile keeps the linear stacked flow (watchlist as a horizontal
    `CardsRow`, no sidebar). When the inline chart scrolls off the top
    (desktop only — `IntersectionObserver` watches the chart card), a slim
    sticky bar appears at the top of the main column showing
    symbol · live price · day-% · "Scroll to chart ↑"; click smooth-scrolls
    back. Uses the inverted-bg pair (`--text` / `--bg`, à la `TradeBar`) so it
    pops over panels of the same colour. `selected` is unioned into the
    snapshot + live-quote symbol list so the bar has data even for picks
    outside the watchlist (e.g. an Earnings calendar row).
    - *Stocks*: `DiscoverHero` (single-column silo holdings + ~80px
      area-filled net P/L sparkline from `usePnlHistory` — the allocation
      donut moved to Portfolio as a sibling card), indices marquee ticker,
      watchlist sidebar, inline chart, gainers/losers tabbed card (with
      most-active volume), **earnings calendar**
      (`discover/EarningsCard.tsx`, paginated 10/page; Top / Upcoming
      toggle re-sorts the same rows by market cap desc vs date asc
      client-side, with `sortable` opt-in so the Workspace per-symbol
      view stays chronological), **economic calendar**
      (`discover/EconomicCard.tsx`, high/medium-impact, day-paginated —
      defaults to today, falls back to the next day with events; US-only on
      stocks Discover, FXCM-derived country set on CFD Discover (see
      `lib/fxcm-countries.ts`); rows for
      the ~95 mapped recurring releases deep-link to the corresponding
      **FRED series page** in a new tab via `lib/economic-fred-map.ts`
      (rule-based name → series id), unmapped events render as plain text
      — a Google-search fallback was tried and dropped because the result
      pages rarely landed on the right release), market news.
      Both pagers share `discover/CardPager.tsx`.
    - *Crypto*: crypto price marquee ticker (`discover/CryptoTicker.tsx`),
      same single-column `DiscoverHero` (crypto holdings + curve),
      watchlist sidebar, inline chart, BTC news feed. No movers/most-active
      (Alpaca has no crypto screener).
    - *CFDs*: separate page (`CfdDiscoverPage.tsx`) — same 2-col shell
      (watchlist sidebar + FXCM account hero (equity + day chip + Balance /
      Used / Free margin + the same closed-trades net-P/L curve as the CFD
      PortfolioHero, via `lib/fxcm-pnl.ts` + `discover/PnlSparkline.tsx`) /
      **AI market summary** /
      inline `CfdPriceChart` / economic calendar gated on the FXCM-derived
      country set, each row flag-prefixed via `EconomicCard`'s default-off
      `showFlags` prop — enabled only on CFD Discover). The old inline
      **open-positions panel was removed** so
      CFD Discover is **market-discovery only**, consistent with the
      stocks/crypto Discover surfaces — open positions live on Portfolio.
      The AI market summary uses the same `MarketSummaryCard` +
      `useMarketSummary(wlSymbols, "cfd")` as the other silos, with a
      forex/CFD-flavoured desk-note prompt (USD tone, majors, gold,
      indices, one macro headline; steers off the Alpaca portfolio tools
      since the Ask backend doesn't cover FXCM instruments). Own
      `cfd_market_summary_v1` cache + UTC session windows (Asia / London /
      NY / Late). Watchlist mutations go through the JWT-backed FXCM
      Endpoints suite (`/api/fxcm/watchlist`); chart bars stream from
      `/api/fxcm/history` with a 3 s `/api/fxcm/prices` poll for the live
      tip. Full surface inventory in `docs/fxcm.md`.
  - **Scalp** (CFD-only, desktop-only — `CfdScalpPage.tsx`) — a
    traditional forex-broker rapid-trade surface and the platform's
    **main CFD trading entry**. Reached from the splash / Account Hub
    CFD card's "⚡ Scalp" affordance (`enterMarket("cfd", "scalp")`), not
    a header pill. Layout is a **3-pane "cockpit"** (rebuilt from the design
    handoff `design_handoff_cfd_scalp_cockpit`, adapted onto our Calm-v2
    tokens via `components/cfd-scalp.css`): a top **stats bar** (brand · Live
    pill · equity/free-margin/open-P&L · hotkey hint · size chips · 1-click
    toggle — no in-scalp theme toggle; the global nav theme switch is the
    single source), then a grid of **Rate Matrix** (left, click-to-select
    rows with bid/ask flash + spread + per-instrument P/L + inline remove) ·
    **Chart + Deal strip** (center — `CfdPriceChart` on the m1 scalping
    preset drives the action, with a dashed **entry line** at the selected
    instrument's net average — long green / short red, via the chart's
    additive `entryLine` prop + LWC `createPriceLine` — and the
    Sell/spread/Buy deal strip beneath) ·
    **Position info** (right — net side/size/avg/P&L/pips, mark/spread/margin,
    visual-stub SL/TP, Reverse + Close), then a full-width **blotter**
    (per-fill close + Flatten-all) and the alerts panel. **Hotkeys:** B/S
    fire, F flattens, Space confirms an armed order. Collapses to a single
    column below 1180px (scalp stays desktop-only). Underneath it reuses the
    same engine as before: an account/control model with **per-instrument-type
    lot presets** —
    FX in 1K/10K/50K/100K units, non-FX in `1/5/10/25 × base_unit_size`
    contracts; the control stores a 0–3 level and each tile resolves its
    own amount at submit), a **rate matrix** of live bid/ask tiles (one
    per watchlist instrument) with **up/down tick flashes**, broker-style
    big-figure/pips/tenth price rendering, spread chip, and a net
    position/P&L footer. When an instrument has **no live bid/ask** (market
    closed — FXCM stops quoting indices/CFDs while FX keeps a last quote; both
    `/prices` and the SSE stream read the same offers, so polling can't fill
    it), the tile falls back to the **last `D1` bar close** as a muted,
    spread-less **indicative** level (mirrors the Discover watchlist card, same
    `useFxcmBars` key so React Query dedupes) rather than a dash. Instruments
    are managed inline (a per-tile ×
    removes, a trailing `AddSymbolTile` searches + adds via the same FXCM
    Endpoints-suite watchlist as Discover, so no round-trip to manage it);
    a **deal-ticket focus column** (chart on top —
    it drives the action — a `CfdPriceChart` opened on a **scalping preset**
    via additive `defaultTimeframe="m1"` + `barsToShow` props that zoom to
    the recent bars; then the selected instrument's big bid/ask Buy/Sell,
    then its open positions); and an **open-positions blotter** with
    per-row + sequential close-all. A **1-click toggle** in the control
    strip gates execution: ON fires on a single click; OFF arms the
    button ("Confirm") and a second click within ~4 s executes — a
    modal-free fat-finger guard (`requestOrder` → `placeOrder`). Orders
    submit **market (OM)** via `useFxcmSubmitOrder` at the selected lot
    (clamped to per-instrument `base_unit_size`); every execution path
    (buy/sell, close, close-all) raises a success/error toast. All
    precision/pip handling reads the bridge **instrument metadata** off
    `/prices` (`digits`, `point_size`, `instrument_type`, `base_unit_size`
    — only present for subscribed offers, so `cfdDigits()` is the
    pre-subscription fallback): the big-figure split locates the pip via
    `point_size` (so indices/stock-CFDs render right, not just 5dp FX),
    and tick flashes use a **per-side, ½-`point_size` dead-band** so an
    unchanged quote stays quiet while its counterpart moves (the
    FXCM/MT4/cTrader dealing-tile convention) instead of strobing every
    poll.
    **Status — MOCK / FOUNDATION for design to redo:** live ticks now
    ride a **real SSE feed** (`useFxcmPriceStream` → `/api/fxcm/stream`,
    FCLite `subscribeOfferChange` push under the hood — see `docs/fxcm.md`
    → "Live price stream"), with the 1 s `/api/fxcm/prices` poll kept as
    the automatic fallback; the **alert engine shares the same feed**.
    (`subscribeBars` — live *bar* updates in the chart — is still a no-op.)
    **SL/TP is a visual stub** (bridge stop/limit params untested from here, so they
    aren't sent — the 1-click/confirm toggle and the success toasts are
    real, but SL/TP isn't). Instruments are subscribed via `useFxcmView`
    so the bridge keeps them on status T (live bid/ask). The focus column
    also carries a **price-alerts panel** (`CfdAlertsPanel`): rate-cross
    alerts (above/below a level on bid/ask/mid) for the selected
    instrument, with edit / cancel / re-arm. Monitoring is **client-side
    only** — a headless `CfdAlertEngine` mounted in `App.tsx` polls
    `/api/fxcm/prices` *only while armed alerts exist* (subscribing those
    instruments via `useFxcmView`), detects a true cross (needs a prior
    sample on the opposite side, so an alert created already-past won't
    fire), then raises a toast + a short Web-Audio chime (`lib/sound.ts`)
    and marks the alert one-shot `triggered`. Rules persist in
    `localStorage('cfd_alerts_v1')` via `lib/alerts.ts`. **No server
    watcher and no push** (out of scope) — alerts only fire while the app
    is open.
  - **Portfolio** — Unified `PortfolioHero` (siloed: silo holdings on the
    left with the **net P/L curve** from `/api/pnl-history` + day chip,
    plus a 2-col stat grid on the right — stocks show Cash · BP · Net
    equity · Total P/L · Open orders; crypto drops Cash since BP already
    *is* the cash for crypto and shows BP · Total P/L · Open orders) +
    `AllocationDonut` sibling card (donut + legend, sorted biggest slice
    first; rendered via the shared `components/AllocationDonut.tsx`
    extracted from the old DiscoverHero — Portfolio is the spec'd home
    for the donut, Discover is now market discovery only; a **lone position**
    draws a full ring via `buildRing` since a single 360° `buildArc` slice
    is degenerate — start == end — and renders nothing; slice palette is
    **per-silo** — green ramp (`DONUT_COLORS_GREEN`) for stocks, amber
    (`DONUT_COLORS_AMBER`, hue 55) for CFD, blue default for crypto — matching
    each silo's `--accent`) +
    promoted `Positions` block (`SectionHeading size="lg"`) + a 2-col
    `Orders` + `Activities` row beneath. Clicking a Positions row
    switches to Chart mode for that symbol (was: just repopulated the
    bottom TradeBar). On mobile the hero collapses
    to a single column: holdings number + curve on top, hairline, 3-col
    mini-stats below. The desktop two-row header (chrome row + `TopBar`
    status strip) is gone — its content folded into a single
    grid-`auto 1fr auto` header in `App.tsx` (Identity · Mode · Account
    & actions). `HeaderStatusInline` + `HeaderEquityReadout` live in
    `TopBar.tsx` as exports; `TopBar` itself returns null on every
    viewport, with the mobile chrome + status merged into
    `MobileHeader`. The market clock surfaces stocks-only (Alpaca clock
    is equities-only); crypto shows a static `Open · 24/7`. BP no longer
    surfaces in any header — it lives in the hero (`buying_power` for
    stocks, `non_marginable_buying_power` for crypto). **CFD/FXCM** runs
    the same shell with silo-specific bodies: `CfdPortfolioHero` (equity +
    day chip + Used/Free margin · Total P/L · Open orders + a **net-P/L
    curve** rebuilt client-side from closed trades — `lib/fxcm-pnl.ts`'s
    `buildClosedTradePnl` cumulative-sums each closed trade's realized `pl`
    by `close_time` (FCLite already nets them — no FIFO) and tips the line
    with current open unrealized P/L (`equity − balance`); rendered via the
    shared `discover/PnlSparkline.tsx`, the same 80px area-filled SVG the
    stocks/crypto `DiscoverHero` uses, which the CFD Discover
    `FxcmAccountHero` shares too), netted-per-instrument `Positions`, the
    `FxcmOrders` blotter (FXCM's `OM`/`SE`/`LE` order model diverges
    enough that folding it into `Orders.tsx` would be ugly), and
    `Activities` sourced from `/api/fxcm/closed_trades`. `TradeBar` runs
    in CFD mode too — same component, `assetClass="cfd"` routes its data
    path through `useFxcmPrices` and its order sheet through
    `FxcmOrderSheet` (which now takes `defaultSide`). The sticky
    chart-mini bar at the top of the main column is the shared
    `discover/StickyChartBar.tsx` (extracted from the old inline JSX in
    `DiscoverPage.tsx`). CFD digit precision (JPY 3dp · FX 5dp · metals
    4dp · indices 1dp · stock-CFDs 2dp) flows from
    `lib/format.ts → cfdDigits`. Full surface inventory in `docs/fxcm.md`.
  - **Chart** — `TVPlatform.tsx` wraps the full TradingView Charting
    Library (`frontend/public/charting_library/`, committed — private
    repo only) using **TV's native chrome**: the native header (symbol
    search, resolutions, chart type, indicators, settings, …) and the
    native **Account Manager** (positions / orders / account blotter —
    enabled but **collapsed by default** via disabling
    `open_account_manager`). Only TV's trade-*initiation* UI is
    suppressed in `disabled_features` (`order_panel`, `buy_sell_buttons`,
    `broker_button`, plus `header_saveload` — no charts-storage backend);
    trade entry runs through the floating `TradeBar` + `OrderSheet`, so
    the crypto constraints and confirm flow are enforced. The broker
    stays wired so price-line overlays for open orders/positions draw.
    On desktop the chart fills the viewport (`.app.app-chart` flex
    column) at the same height as the `ChatPanel`. Datafeed:
    `lib/tv-datafeed.ts`. Broker: `lib/tv-broker.ts`. ChartBot side panel
    mounts here when `AI_CHAT_ENABLED=true`. In the **CFD silo** the
    datafeed branches off the Alpaca path and routes symbol search, bars,
    quotes, and live ticks through `/api/fxcm/*` (history bars,
    `api.getFxcmInstruments()` with client-side filter for search since
    the bridge ignores `?search=`; `subscribeBars` is a no-op until the
    FCLite push backlog item lands).
  - **Workspace** (desktop only — hidden on mobile) — a dockable widget
    canvas on Dockview (`components/Workspace.tsx` + `lib/workspace/`):
    per-silo layout persistence, link-channel widgets (None +
    Main/blue/green/amber), named layout presets plus user-saved layouts
    ("Save current as…"), and an Ask-anything
    control path. Goes full-bleed and drops the `TopBar` equity strip
    (account figures live in the Account widget). A first-class surface for
    **all three silos** including CFD (FXCM data across every widget,
    research widgets resolve stock-CFD underlyings). **Full detail — widget
    catalogue, channels, toolbar, panel-size fit, the CFD silo, and the
    module-reuse pattern — is in `docs/workspace.md`.**
- **Mobile / responsive (≤ 640px).** A single `useMobile()` hook
  (`hooks/useMobile.ts`, `matchMedia("(max-width: 640px)")`) gates the
  phone layouts; it mirrors the CSS `@media (max-width: 640px)` breakpoint
  exactly. **Desktop / iPad (> 640px) render unchanged** — every mobile
  branch is additive, never a replacement. The header is a single merged
  sticky `MobileHeader`: row 1 carries ☰ · page name + inline `● Open ·
  until 16:00` micro-status (or `Open · 24/7` for crypto) · equity-pill
  (opens the existing balance sheet); row 2 keeps mode pills + the silo
  toggle. The previous mobile status strip (`MobileStatusStrip` under
  `TopBar`) is gone — its content folded into row 1. ✦ Ask is a
  floating 48 px launcher in the **bottom-left** corner (matches the
  ChartBot violet launcher's position in Chart mode for a consistent
  reach target); it's suppressed in Chart mode itself so the two
  launchers don't pile up. `MobileNavDrawer` (left slide-in,
  hamburger-driven) carries the theme toggle, AI toggles, Account hub
  link, and a Disable-service-worker shortcut. Tabular surfaces
  (`Positions`/`Orders`/`Activities`) render stacked **card lists**
  instead of tables. Chart mode goes full-bleed (`100dvh`-based height)
  using TV's native header, and the ChartBot panel becomes a
  bottom-left **violet launcher + slide-up sheet**. `OrderSheet` and the
  Ask-anything `AskBar` go full-screen with safe-area-padded sticky
  footers; `TradeBar` and the watchlist add-sheet clear the home
  indicator. Mobile tokens (`--mob-*`, `--safe-*`) live in `index.css`;
  `--mob-hero-value` is deliberately scoped to the media query, not
  `:root` (see `docs/landmines.md`).
- **Order entry.** `hooks/useOrderTicket.ts` owns all form state
  (symbol/side/type/qty/limit/stop/trail/TIF/ext-hours, plus a
  shares-vs-dollars `amountMode` → `notional`) plus asset lookup, live
  quote, est notional, validation, and submission.
  Crypto constraints are enforced here: order types limited to
  `market`/`limit`/`stop_limit` (no plain `stop`, no `trailing_stop`);
  TIF limited to `gtc`/`ioc`; no extended hours;
  `non_marginable_buying_power` used (not `buying_power`) since Alpaca
  doesn't extend margin for crypto. **Dollar (notional) entry** is offered
  on market/limit orders for **fractionable** assets only — equities force
  TIF=`day` (Alpaca caps notional/fractional at day, no ext-hours), crypto
  keeps `gtc`/`ioc`; the toggle reads "Units" in the crypto silo.
  **Extended hours** is allowed on limit + `day`/`gtc`. All of these are
  **frontend-only guards** — the backend write path applies no asset-class
  gating, so direct API callers can bypass them.
  `isCrypto` is detected synchronously via `symbol.includes("/")` so
  constraints apply before the async asset fetch resolves. Notional orders
  come back with `qty: null` (executed size lands in `filled_qty`); the
  Orders blotter falls back to `filled_qty`/`notional` for its Qty/Value
  columns.
  UI surfaces in `components/trade/`: `OrderSheet.tsx` (shell +
  desktop body), `OrderSheetMobile.tsx` (mobile body),
  `orderSheetParts.tsx` (shared `Chip`/`Stepper`/`AmountToggle`/
  `DollarInput`/`MobileHalfSheet`/`segStyle`/`TYPE_LABEL`/`TIF_LABEL`/
  `useAutoSelect`). The amount field opens **focused + highlighted** when
  the ticket is launched from the floating `TradeBar` (`useAutoSelect`,
  rAF-deferred focus+select) across all silos — `OrderSheet` desktop +
  mobile bodies and `FxcmOrderSheet`; the Workspace `OrderTicketInline`
  deliberately doesn't auto-focus (it's a docked widget, not a modal).
  The default export of `OrderSheet.tsx` still picks mobile vs desktop
  via `useMobile()`, and it re-exports the parts so legacy
  `from "./OrderSheet"` imports keep working. The mobile and desktop
  bodies share the same `useOrderTicket` instance so business logic is
  not duplicated. Other trade surfaces: `TradeBar` (floating Buy/Sell
  pill, mounted in every mode), `ClosePositionCard`, `ModifyOrderCard`,
  `ConfirmCard`. The Ask anything order intent uses `useOrderTicket`
  with `skipConfirm: true`. **No `window.confirm` in the trade flow.**
  The Orders blotter's cancel-all also runs inline (toolbar row swap)
  rather than via a modal `ConfirmCard`.
- **Backend:** FastAPI + `alpaca-py`. Real code in `backend/app/`;
  `api/index.py` is the Vercel shim. Endpoints under `/api/`: health,
  config, status, account, bars, bars/batch, quotes, snapshots, stream, orders, positions,
  portfolio/history, pnl-history, activities, clock, calendar,
  calendar/earnings, calendar/earnings/{symbol}, calendar/economic,
  research/trending, research/smart-score/{symbol},
  research/sentiment/{symbol}, research/analysts/{symbol},
  research/hedge-funds/{symbol}, research/insiders/{symbol},
  research/related-tickers/{symbol},
  research/holder-demographics/{symbol}, assets, asset-profile, news,
  watchlist, movers,
  most-active, indices, market-news, crypto/tickers, ai/chat, ai/ask (last two gated by
  `AI_CHAT_ENABLED`; require `ANTHROPIC_API_KEY`),
  fxcm/health, fxcm/account, fxcm/prices, fxcm/stream (SSE — live price
  feed for Scalp + alerts; QuoteHub-style fan-out over the bridge's
  in-memory /prices/live push cache, Render-only), fxcm/positions,
  fxcm/orders, fxcm/summary, fxcm/closed_trades, fxcm/instruments,
  fxcm/instruments/{name:path}, fxcm/history, fxcm/order (POST/DELETE/PATCH),
  fxcm/close (POST), fxcm/view (POST — subscribe on-screen instruments),
  fxcm/watchlist (GET/POST/DELETE-by-{instrument:path}),
  fxcm/display-names (GET), fxcm/underlying-units (GET),
  fxcm/search-instruments (GET, `?q=`) —
  most of these proxy to the in-container FXCM bridge on 127.0.0.1:3001
  (return 503 when the JVM isn't responding). **Three endpoints are DB-only
  and never touch the bridge:** `fxcm/display-names`, `fxcm/underlying-units`,
  and `fxcm/search-instruments` — all three query the `assets` table
  (`WHERE source='fxcm'`) and are served from Vercel (via `API_BASE`) not Render
  (`STREAM_BASE`), so they work even when the bridge is offline. **The
  fxcm/watchlist surface** doesn't touch the bridge either — it proxies
  to FXCM's Endpoints suite (`endpoints-demo.fxcorporate.com`)
  with a JWT minted by `backend/app/fxcm_auth.py` (POST /iam/authenticate,
  60s lifetime, re-minted ~50s by the same in-memory cache). Find-or-create
  resolves which FXCM-side watchlist to pin on first call; mutations
  translate symbol ↔ FCLite offerId via the bridge's `/instruments`
  table. Full spec + auth flow in `docs/fxcm.md` → "Watchlist API
  (Endpoints suite)". `/api/indices` and
  `/api/market-news` hit Yahoo Finance directly via `requests` (no yfinance,
  no C extensions — Python 3.14 safe). `/api/calendar/{earnings,economic}`
  are **FMP-backed**, live-proxied with an in-process cache (`calendar_fmp.py`,
  the indices/market-news pattern — never persisted, no scheduler); they need
  no Alpaca keys and return `[]` when `FMP_API_KEY` is unset. The earnings
  calendar curates the noisy whole-market feed by **market cap**
  (`db.market_cap_map()`) but always unions the user's positions / open orders /
  watchlist symbols (passed as `?include=`); rows arrive sorted by market cap
  desc (the frontend's "Top" mode — "Upcoming" re-sorts by date asc client-side
  off the same array). When the DB is unreachable it degrades to those `include`
  symbols only. FMP economic times are **UTC**. `/api/calendar/economic` accepts
  `?countries=US,GB,DE,...` (ISO 3166-1 alpha-2, plus `EU` for the eurozone
  aggregate); empty defaults to US-only. The CFD Discover card passes the
  countries it derives from the FXCM instrument universe via
  `lib/fxcm-countries.ts`, so any new symbol the bridge surfaces widens
  calendar coverage automatically. `/api/news` and `/api/most-active` are
  served but only consumed by the AI tool loop — don't delete them. `/api/assets`
  (search) and `/api/assets/{symbol}` are **DB-backed** off the catalogue (clean
  enum values, sector/logo/market_cap; Alpaca fallback) and power the watchlist
  autocomplete, chart search, and the bot's `find_symbol`. `/api/asset-profile/
  {symbol}` (sibling path — *not* the removed `/api/assets/{symbol}/profile`)
  returns the full enrichment row (`db.get_asset_profile`, NULLs dropped — now
  including the FMP **annual-fundamentals** columns) that powers the Workspace
  **Profile** and **Fundamentals** widgets. The Postgres **asset
  catalogue** is **onboarded** by the Render-only `POST /api/_dev/seed-assets`
  (Alpaca base + CoinGecko crypto), then kept fresh by three Render-only,
  background, per-widget **refresh routines** — `POST
  /api/_dev/refresh-profile-stocks` (FMP `/profile`), `POST
  /api/_dev/refresh-profile-crypto` (CoinGecko), and `POST
  /api/_dev/refresh-fundamentals` (FMP annual statements), plus aggregate flows
  `POST /api/_dev/refresh-all-stocks` (Profile + Fundamentals) and `POST
  /api/_dev/refresh-all-crypto`. Each re-pulls every DB value its card shows for
  already-enriched rows (`?include_missing=true` also onboards new ones);
  fire-and-forget, sensible monthly. Alpaca base/trading-status (tradable,
  active/inactive, options, increments) is refreshed by `POST
  /api/_dev/refresh-alpaca` (background; the only routine touching the
  Alpaca-sourced fields, also onboards new listings); `GET /api/_dev/new-symbols`
  is a fast read-only check for new listings/IPOs not yet in the catalogue.
  `POST /api/_dev/seed-fxcm-instruments` is a one-time lift that upserts
  FXCM instrument metadata into `assets` (`source='fxcm'`; `fxcm_instruments`
  is now a legacy empty table). `POST /api/_dev/enrich-fxcm-stocks` FMP-enriches
  the `stock_cfd` subset (synchronous, ~5 min); `POST
  /api/_dev/refresh-fxcm-stocks` re-enriches in the background.
  See "Asset catalogue" below and `docs/database.md`.
  **Path params with slashes:** `/api/assets/{symbol:path}`,
  `/api/asset-profile/{symbol:path}`, `/api/positions/{symbol:path}`, and
  `/api/watchlist/{symbol:path}`
  use FastAPI's `:path` converter so `BTC/USD` passes through without
  breaking routing. Frontend never calls `encodeURIComponent` on symbol
  path segments (symbols are `[A-Z0-9/.]` only).
  **Account fields:** `get_account()` returns `buying_power` (may
  include margin) and `non_marginable_buying_power` (cash-only; correct
  figure for crypto trades). Use the latter in crypto contexts. It also
  exposes `short_market_value`, `initial_margin`, `maintenance_margin`,
  `daytrading_buying_power`, and `regt_buying_power` (all `float(x or 0)`
  -guarded; mostly ~0 in a paper account).
  **Crypto symbol/silo helpers (single source of truth):** `alpaca/client.py`
  owns `is_crypto`, `normalize_crypto_symbol` (re-slash `BTCUSD`→`BTC/USD`,
  longest-first `USDT`/`USDC`/`USD`), and `coerce_silo` (anything ≠ `"crypto"`
  → `"stocks"`). Re-slashing and silo coercion happen *only* here — don't
  re-implement them inline. Frontend mirror: `lib/asset-class.ts`
  (`isCryptoSymbol`/`isCryptoPosition`/`isCryptoOrder`).
  **Positions:** `_position_dict` normalises crypto symbols via
  `normalize_crypto_symbol` (Alpaca strips the slash in its positions
  endpoint) and includes `asset_class`. Use `asset_class === "crypto"`
  — not `symbol.includes("/")` — to filter positions. `_position_dict`
  also exposes `unrealized_intraday_pl` (silo day-P/L source); `PositionOut`
  and `OrderOut` both carry `asset_class` (they used to strip it, so the
  per-silo filters had been quietly surviving on the `/` fallback).
  **Per-silo P/L curve:** Alpaca has no per-asset-class portfolio history,
  so `alpaca/pnl.py` (`/api/pnl-history`) rebuilds it from FILL activities
  (FIFO lots → realized P/L) valued against historical daily closes; the
  curve is anchored on open-position cost (deposits ignored) and its live
  tip uses current position market value.
- **Data feed:** IEX (free, ~2-3% of volume). `sip` (paid) via
  `ALPACA_DATA_FEED` env — no code change.
- **Streaming:** `backend/app/stream.py` holds two hub singletons:
  `hub` (`QuoteHub` — Alpaca `StockDataStream`) and `crypto_hub`
  (`CryptoQuoteHub` — Alpaca `CryptoDataStream`). Both follow the same
  fan-out SSE pattern. `/api/stream` detects `all("/" in s for s in syms)`
  and routes to the appropriate hub. The watchlist **auto-falls-back to
  polling `/api/quotes`** when the stream is unreachable — load-bearing.
  See `docs/landmines.md` for buffering, `VITE_STREAM_BASE`, and CORS
  details.
- **Watchlists:** Two named Alpaca watchlists per account — `"primary"`
  (stocks) and `"primary-crypto"` (crypto, seeded with BTC/ETH/SOL).
  All three `/api/watchlist` routes accept `?asset_class=crypto` to
  target the crypto list (run through `coerce_silo`). `/api/pnl-history`
  uses the same two-state silo param and echoes the resolved
  `asset_class` in `PnlHistoryOut`. **`/api/assets` is different** — a
  three-state asset-universe filter (`""`=all / `us_equity` / `crypto`)
  the watchlist/chart search and the AI `find_symbol` path rely on; don't fold
  it into `coerce_silo`. It's DB-backed (`db.search_assets`) and applies the
  **visibility rule** — only `tradable` + enriched rows show in search (see
  "Asset catalogue").
- **PWA:** `vite-plugin-pwa`. NetworkFirst for API, CacheFirst for
  static; charting library excluded from precache.
- **Persistence:** Postgres (Supabase) backs the **asset catalogue** — the
  `assets` table holding the full Alpaca universe (~13.8k us_equity +
  crypto rows) plus per-source enrichment — and a small `app_settings`
  key/value table (the maintenance switch). Pure-Python `pg8000`
  (3.14/Vercel-safe), per-op connections from `DATABASE_URL`, graceful
  `DbUnavailable` → 503-style fallback when unset. Tables are created by
  `backend/sql/002_assets.sql`, `backend/sql/003_app_settings.sql`,
  `backend/sql/004_fxcm_instruments.sql`, and
  `backend/sql/005_merge_fxcm_instruments.sql`, each run **once** in the
  Supabase SQL editor (no auto-create). Writes only run from prod/Render (Postgres :5432 is firewalled
  from the sandbox + the owner's laptop). Everything else (trade journal,
  server-side watchlists, finer P/L history) is still direct-Alpaca +
  `localStorage` — backlogged. See `docs/landmines.md` → "Asset catalogue"
  and `docs/database.md`.
- **Maintenance / force-stop switches + version gate:** `/api/status` returns
  `{version, maintenance, message, force_stop, force_stop_message}` (read from
  `app_settings`; fail-open if the DB is unreachable so a blip can't strand
  everyone). The frontend polls it (`useAppStatus` — on mount, on window focus,
  a slow 5-min interval that tightens to 30s while in maintenance). Two switches,
  both gated in `App.tsx`:
  - **`maintenance`** (graceful) → renders `MaintenancePage` and tears down the
    data layer; the status heartbeat keeps polling so clients **auto-return**
    within ~30s when flipped off.
  - **`force_stop`** (terminal boot) → renders the **terminal** `MaintenancePage`
    *and* latches `booted` so `useAppStatus` is disabled — the tab stops **all**
    polling (incl. `/api/status`) and makes zero further requests. It **never
    auto-recovers**; only a manual browser reload returns. Use to truly silence
    misbehaving/lingering clients.

  App.tsx also **self-reloads once** when `status.version` ≠ built
  `__APP_VERSION__` (sessionStorage-guarded), except while `force_stop` is on
  (the boot page must not reload itself). Nothing pushes: clients learn on their
  next poll (≤5 min, instant on focus); both switches only reach clients running
  this gated code. Toggle in the **Supabase SQL editor** (one-time table setup +
  full command reference in `backend/sql/003_app_settings.sql`):
  ```sql
  -- Graceful maintenance (auto-recovers):
  update app_settings set value='on'  where key='maintenance';   -- boot to page
  update app_settings set value='off' where key='maintenance';   -- bring back

  -- Force-stop / terminal boot (manual reload to return):
  update app_settings set value='on'  where key='force_stop';    -- silence clients
  update app_settings set value='off' where key='force_stop';    -- stop re-booting fresh loads
  -- Optional messages: keys 'maintenance_message' / 'force_stop_message'.
  ```
- **Asset catalogue:** one `assets` table hosting all three symbol universes.
  `source` column (`'alpaca'` | `'fxcm'`) identifies origin. `asset_class`
  drives enrichment: `'us_equity'` / `'crypto'` (Alpaca) or `'forex'` /
  `'stock_cfd'` / `'index'` / `'metal'` / `'commodity'` / `'cfd_other'` (FXCM).
  Base identity for Alpaca rows comes from `get_all_assets_for_seed` →
  `db.bulk_upsert_assets`; FXCM rows are seeded via
  `seed-fxcm-instruments`. Enrichment: crypto from CoinGecko (`coingecko.py` —
  keyless or `COINGECKO_API_KEY` Demo key, static base-ticker→id map); Alpaca
  equities + FXCM stock_cfd from FMP's **stable** profile endpoint (`fmp.py` —
  single-symbol on the paid **Starter** tier, 300/min, no daily cap;
  `profile-bulk` + constituent lists 402 on Starter); fundamentals from FMP
  statements (`income-statement`+`cash-flow-statement`+`ratios`, annual —
  `us_equity` only). For FXCM stock_cfd rows FMP enrichment shares the same
  columns (`description`, `logo_url`, `sector`, `market_cap`, `is_adr`, etc.);
  `fmp_ticker` records the ticker used (bare ADR first, exchange-suffixed
  fallback). Refresh routines: `refresh-profile-stocks` / `-crypto` /
  `refresh-fundamentals` / `refresh-fxcm-stocks`; `?include_missing=true`
  onboards new rows. **Visibility rule:** `db.search_assets` returns only
  `tradable` + enriched rows — scoped to Alpaca rows (FXCM instruments use
  `search_fxcm_instruments` via `/api/fxcm/search-instruments`). Direct
  resolution (`get_asset`, `get_asset_profile`) is never filtered and works for
  FXCM symbols too. See `docs/database.md`.
- **Styling:** Tailwind + a Calm v2 oklch token set in
  `frontend/src/index.css` (light default, dark under
  `html[data-theme="dark"]`, switched by `hooks/useTheme.ts` with a
  synchronous bootstrap in `index.html` — don't delete that script or
  every load flashes). Tokens exposed as utilities in
  `tailwind.config.js`. Tailwind preflight stays **off**
  (`corePlugins.preflight: false`); `frontend/src/app-reset.css` (imported
  after `index.css` in `main.tsx`) carries a minimal element reset —
  zeroes `button`, `ul`/`ol`, `fieldset`, and `h1`-`h6` defaults — so a
  stray bare element doesn't drag in browser chrome next to the
  utility-styled surfaces. A full preflight enable is a deliberate
  post-demo follow-up (would regress hand-styled surfaces that never
  finished the utility migration). Fonts: Inter + IBM Plex Mono. Mobile
  layout tokens (`--mob-*`) and safe-area insets (`--safe-*`) are
  appended in the same file; `index.html` sets `viewport-fit=cover` so
  the insets resolve.
- **Number formatting** (`frontend/src/lib/format.ts`): `money(n)` is
  the stock/dollar formatter (2 decimal places, USD locale). Crypto
  prices must use `fmtCryptoPrice(n)` — a magnitude ladder (≥$1 → 2 dec,
  ≥$0.01 → 4 dec, ≥$0.0001 → 6 dec, else 8 dec). Alpaca sets
  `price_increment=1e-9` uniformly across all crypto pairs so per-asset
  precision is not available; the ladder is the correct approach.
  `fmtCryptoPrice` is used in `CryptoTicker`, `SparkCard` (via
  `isCrypto` prop), and `Positions` price/avg columns.
  **Loading placeholder:** equity/P&L surfaces must not flash a misleading
  `$0.00` / `Day +0.00%` while their source query is still in flight — show
  `DASH` (`—`) instead. `moneyOr(n, ready)` / `pctOr(n, ready)` return the
  formatted value when `ready`, else `DASH` (a *real* loaded zero still
  renders `$0.00`). Presentational heroes take an additive default-on
  `ready?: boolean` prop (e.g. `DiscoverHero`, `HeroCardMobile`); the splash
  Brokerage cards thread `alpacaReady`/`fxcmReady` (`!!query.data`) through
  `moneyOr` + a `DayChip`/`Bar` ready gate. Surfaces that already
  render a skeleton / `null` until data lands (header equity readout, the
  Portfolio / CFD-Discover heroes, `Positions`) don't need it.

## Workspace module pattern (reuse strategy)

Surfaces that may live in more than one place follow a strict three-layer
split: **engine** (hooks/data/types, no UI) → **feature component**
(presentational, location-agnostic, props in / callbacks out, lives in
`components/`, knows **nothing** about the Workspace) → **Workspace adapter**
(`lib/workspace/registry.tsx`, the only layer that knows Dockview, link
channels, and `LinkHeader`). A feature component importing from
`lib/workspace/` or calling `useWorkspace()` is a smell. Evolve shared
components with **additive, default-off props** — never change a default for a
new surface. Full rules, precedents, and examples: `docs/workspace.md` →
"Module pattern".

## localStorage keys (single-user app)

| Key | Writer | Read by | Notes |
| --- | ------ | ------- | ----- |
| `asset_class_mode` | `App.tsx` | `App.tsx` | `"stocks" \| "crypto" \| "cfd"`. **Load-bearing** — the silo the app boots into on subsequent loads (post-splash). Also highlights the active card in the Account Hub. Legacy `"forex"` values are migrated to `"cfd"` on read. |
| `platform_mode_v1` | `App.tsx` | `App.tsx` | `"discover" \| "portfolio" \| "chart" \| "scalp" \| "workspace"`. The mode the app boots into. `workspace` is desktop-only; `scalp` is CFD- and desktop-only (and entered from the splash CFD card, not a header pill). A reload that rehydrates `workspace` on mobile — or `scalp` on mobile / in a non-CFD silo — falls back to `discover`. |
| `splash_seen_v1` | `App.tsx` | `App.tsx` | `"1"` once the user has picked a silo from the splash. Subsequent loads skip the splash and land on the `asset_class_mode` silo **only while the session is fresh** (see `last_active_at`). Clearing this key restores the first-time landing. |
| `last_active_at` | `App.tsx` + `lib/session.ts` | `App.tsx` (`shouldShowSplash`) | Epoch-ms of last activity (mount · interaction, throttled 15s · tab focus · pagehide). Gates the resume-on-reload behaviour: if a load happens > `SESSION_TTL_MS` (10 min) after the last activity — or the key is absent — the splash re-shows instead of resuming the last silo/mode. Boot-only check (never interrupts a mounted session). A **service-worker reset** (`disableServiceWorker`) calls `expireSession()` (removes this key) so the post-reset reload lands on the splash. Primitives live in `lib/session.ts`. |
| `theme` | `hooks/useTheme.ts` + `index.html` bootstrap | both | `"light" \| "dark"`. Defaults to OS preference. |
| `discover_sidebar_collapsed_v1` | `components/DiscoverPage.tsx` | `components/DiscoverPage.tsx` | `"1"` when the desktop Discover watchlist sidebar is collapsed to its 32 px chevron strip. Absent / any other value = expanded. Desktop-only (mobile renders the watchlist as a horizontal CardsRow). |
| `cfd_alerts_v1` | `lib/alerts.ts` | `lib/alerts.ts` (`useAlerts`) + `CfdAlertEngine` | JSON array of client-side CFD price alerts (`instrument`, `source` bid/ask/mid, `direction` above/below, `price`, `status` armed/triggered). Monitored in-browser by `CfdAlertEngine` while the app is open; fires a toast + chime on a rate cross, one-shot. No server watcher / push. Easily swappable to the DB later (isolated behind `lib/alerts.ts`). |
| `chartbot_session` | `useChatSession` | `useChatSession` | Serialised turns + apiHistory, capped at 256 KB. |
| `ask_session_v1` | `components/ask/AskBar.tsx` | `components/ask/AskBar.tsx` | Ask-anything transcript + apiHistory, capped at 256 KB. Each fallback turn stores its `cachedResp` so a reopen / reload replays the answer without re-billing Anthropic; workspace_actions and watchlist invalidations are **not** re-replayed from cache. Header **Clear** button (visible only when there are turns) wipes the key. Eviction drops the oldest turn (and matching user+assistant pair) when over budget. |
| `ai_drawings_v1` | `tv-drawings.ts` | `tv-drawings.ts` | Per-symbol drawing UUIDs replayed on chart load. |
| `market_summary_v1` / `crypto_market_summary_v1` / `cfd_market_summary_v1` | `useMarketSummary` | `useMarketSummary` + Ask-anything summary card | Per-silo cached AI market summary (window, date, content). CFD uses UTC session windows (Asia / London / NY / Late) and a forex/CFD desk-note prompt; stocks use EST open/close windows. |
| `app_settings_v1` | `lib/settings.ts` | `useSettings` + `SettingsMenu` + `MobileNavDrawer` | JSON-encoded `AppSettings`. Three per-surface AI toggles, each default `false` (opt-in — no Anthropic credits until enabled): `marketSummaryAiEnabled` / `askAiEnabled` / `chartbotEnabled`. When a surface is off it renders a shared `AiDisabledNotice` ("…enable in Settings") instead of calling Claude — except the Discover market summary, which still surfaces its last cached briefing (with an "AI off" hint) when one exists and only falls back to the notice when nothing is cached. |
| `workspace_layouts_stocks_v2` / `workspace_layouts_crypto_v2` | `components/Workspace.tsx` | `components/Workspace.tsx` | Per-silo Workspace layouts — `{ active: { name, layout }, saved: {} }`. `active.layout` is the live Dockview `api.toJSON()`; `active.name` records the last-applied preset (Trader / Researcher / Watcher / Focus). `saved` holds the user's named layouts (the "My layouts" section of the in-canvas Layouts menu — Save current as… / Apply / Rename / Delete); each entry is `{ layout, channels }`, snapshotting both the Dockview JSON and that silo's colour-channel symbols, so Apply restores the arrangement *and* the per-channel tickers. Migrates transparently from the old `workspace_layout_{silo}_v1` (raw layout) on first load after upgrade; the v1 key is then removed. Applying a preset/custom layout clears only `active` (the `saved` map survives). |
| `workspace_channels_v1` | `components/Workspace.tsx` | `components/Workspace.tsx` | Per-silo colour-channel symbols (`{stocks,crypto}` → channel → symbol). Seeded from `CHANNEL_DEFAULTS`; persists header-search picks across reloads. "main" is not stored here (it proxies the app's selected symbol). |

Watchlists are not in localStorage — server-side via `/api/watchlist`.

## Four runtime targets (do not conflate)

1. **Vercel — production**, from `main` only, via
   `.github/workflows/deploy-prod.yml` (`vercel deploy --prod`).
   Serves frontend **and** serverless REST API. Vercel's Git
   integration is intentionally disabled (`vercel.json`
   `git.deploymentEnabled=false`) — do not re-enable.
2. **Render — always-on relay**, from `render.yaml` (Blueprint),
   single Docker instance from `backend/Dockerfile` (now **Python-only** —
   no JVM). Built from the **repo-root context** (`dockerContext: .`) so the
   image ships the root `VERSION` file the backend reads at startup; a root
   `.dockerignore` keeps that context lean (must exclude `frontend/`).
   The *only* host that can hold the Alpaca WebSocket open for
   `/api/stream`. Proxies `/api/fxcm/*` to the bridge service (#4) over
   Render's private network via `FXCM_BRIDGE_URL` (default
   `http://fxcm-bridge:3001`). Never run >1 instance — `QuoteHub` and
   `CryptoQuoteHub` are process-local with no external pub/sub. See
   `docs/landmines.md`.
3. **GitHub Pages — dev previews**, via `preview-pages.yml`. Static
   frontend only; talks to the Vercel prod backend. Auto-publishes to
   `gh-pages` on every `claude/**` push. Cannot trigger a Vercel
   deploy.
4. **FXCM bridge — its own Render service** (`fxcm-bridge`, a **private
   service** off the public internet), from `fxcm-bridge/Dockerfile` +
   `fxcm-bridge/entrypoint.sh`. FCLite Java fat JAR; binds
   `FXCM_BRIDGE_HOST=0.0.0.0` on `FXCM_BRIDGE_PORT=3001` so the relay (#2)
   reaches it over Render's private network. Was co-located in the relay
   container — split out so the JVM no longer shares 512 MB with Python
   (the OOM contention is gone, and an FXCM hiccup can't drop stock/crypto
   streaming). **Both default to `127.0.0.1`/co-located when their env vars
   are unset, so local dev still runs the bridge + relay in one process.**
   Note FXCM creds (`FXCM_USER`/`FXCM_PASS`) are needed on **both** services
   — the bridge for the FCLite login, the relay for the Endpoints-suite
   watchlist JWT (`fxcm_auth.py`), which doesn't touch the bridge. The
   frontend hits FXCM endpoints directly at the relay origin via
   `VITE_STREAM_BASE` (Vercel's serverless container has no bridge). Full
   FCLite reference, deploy lessons, and the API quirks future agents will
   need: `docs/fxcm.md`.

## Two AI surfaces (teal Ask anything vs violet ChartBot)

Accent colour is the tell: **teal = local intent parser** (free, instant) —
the Ask anything module (`components/ask/` + `lib/ask-intent/`), available in
all modes, with an optional `/api/ai/ask` fallback that adds watchlist/report
and Workspace-control tools. **violet = real Claude API call** (Anthropic
credits, slow) — the Discover AI market summary (now on **all three silos**,
incl. the forex/CFD desk note) and the Chart-mode ChartBot
side panel (`backend/app/ai/router.py` hybrid tool loop). All three surfaces
are opt-in via per-surface toggles in `app_settings_v1` (default off; off
renders a shared `AiDisabledNotice`). Tunables: `AI_CHAT_ENABLED`,
`ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`, `AI_MAX_TOKENS`,
`AI_MAX_TOOL_ITERATIONS`, `AI_WEB_SEARCH_ENABLED` (default off). **Full wiring
— tools, the schema split, prefix-cache markers, multi-turn, and per-surface
gating — is in `docs/ai.md`.**

## Dual requirements.txt trap

`backend/requirements.txt` is for local dev and Render. **Root
`requirements.txt`** is what Vercel's Python builder reads for `api/`.
Any new dep must land in **both** or prod 500s on first import. CI
(`check-requirements-sync` in `lint-backend.yml`) fails on divergence;
`uvicorn` is intentionally backend-only and excluded.

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

Vite proxies `/api` → `:8000`. Typecheck the frontend with
`npx tsc -b` before committing UI changes.

## Code conventions

- Minimal comments — explain *why*, never *what*. No new abstractions
  or backwards-compat shims beyond what a task needs.
- Keep the polling fallback and graceful 503s (unconfigured Alpaca
  keys) intact across all data endpoints.
- Don't put model identifiers in commits/PRs/code.
- Don't open PRs unless explicitly asked. `gh-pages` is auto-generated
  by the preview workflow — never hand-edit.
