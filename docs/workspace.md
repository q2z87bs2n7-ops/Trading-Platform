# Workspace mode

Desktop-only dockable widget canvas (the fourth header mode; hidden on mobile).
The high-level pointer lives in `CLAUDE.md`; this is the full reference for the
widget catalogue, link channels, toolbar, panel-size behaviour, and the
module-reuse pattern.

Core files: `components/Workspace.tsx` (container + toolbar) +
`lib/workspace/registry.tsx` (widget catalogue + adapters) +
`lib/workspace/presets.tsx` (named layouts). Built on Dockview
(`dockview-react`, lazy-loaded): drag-to-dock, tab-stack, float and pop-out
panels, per-silo layout persistence (`workspace_layouts_{stocks,crypto}_v2` —
`{ active: { name, layout }, saved: {} }`; a transparent migration from the old
`workspace_layout_{silo}_v1` runs on first load after upgrade). `active` is the
live canvas (autosaved on drag); `saved` is the user's **named layouts** (see
Toolbar → Layouts), each entry `{ layout, channels }` so a restore brings back
both the arrangement and the per-channel symbols.

## Toolbar

- **＋ Add widget** — primary menu (320px `<body>`-portaled popover with a search
  input, grouped sections — Charts / Trade / Market data / Activity — and inline
  single-stroke icons; ↑/↓/Enter/Esc).
- **Channels strip** — one chip per symbol channel showing the channel symbol +
  a count of widgets bound to it; click opens `AssetSearch` to retarget the
  channel everywhere.
- **Layouts ▾** — 480px popover with two parts: the built-in **presets** (Trader
  / Researcher / Watcher / Focus — see `presets.tsx`; Trader = the old default,
  applied on first run; select a card then Apply, which clobbers the canvas), and
  a **"My layouts"** section for the user's named saved layouts — *Save current
  as…* (inline name input), then per-row *Apply / Rename / Delete*. A saved
  layout snapshots the Dockview JSON **and** the current colour-channel symbols
  into `saved[name] = { layout, channels }` (localStorage); Apply restores both.
  Applying a preset/custom layout resets only `active` — saved layouts persist.
- **Tab bars** toggle — per-group header via Dockview.
- **Focus** toggle — hides the app header for a near-full-screen canvas; `Esc`
  exits unless a `[role=dialog]` is focused.

When the canvas has zero panels an empty-state overlay shows ＋ Add widget /
Browse layouts CTAs that imperatively open the toolbar menus. The mode also goes
**full-bleed** (`.app.bleed` in `index.css` — no max-width/gutters, a full-height
flex column so the dock fills the viewport) and **drops the `TopBar` equity
strip** (account figures live in the Account widget).

## Widgets

Widgets reuse existing surfaces:

- **Chart** (primary) — a **bare** TradingView chart (`components/TVChartWidget.tsx`:
  TV's native chrome only, *none* of the `TVPlatform` chrome; account manager off
  + object tree collapsed; a ResizeObserver hides the legend + shrinks the scale
  font on small panels, layering on TV's own autosize).
- **Mini chart** (opt-in) — the lighter lightweight-charts `PriceChart` (no
  iframe, `responsive` prop — sheds chrome + chart axes to fit its panel via
  ResizeObserver, and at the smallest **spark** tier swaps the candles for a bare
  close-price area sparkline). The "bare-TV-only" rule governs the primary Chart,
  not this explicit add-on.
- **Trade** — inline trade ticket (`components/trade/OrderTicketInline.tsx` —
  reuses `useOrderTicket` + the OrderSheet inputs; always symbol-linked, no None
  channel).
- **Account** — `components/AccountPanel.tsx`, curated whole-account overview:
  equity, day P/L, buying power, cash, positions value, portfolio value, margin
  (initial/maintenance), and short value when non-zero.
- **Watchlist** — `components/Watchlist.tsx`, silo watchlist spark cards; a click
  writes to the widget's channel.
- **Positions / Orders / Activity / News** — the existing surfaces.
- **Profile** — `components/AssetProfile.tsx`, symbol-linked catalogue enrichment
  off `/api/asset-profile`: fundamentals for stocks (sector, market cap, beta,
  CEO, employees, HQ, IPO, description) and tokenomics for crypto
  (circulating/max supply bar, market-cap rank, ATH/ATL with live distance,
  categories, whitepaper/GitHub links); always symbol-linked like Trade — default
  Main, no None.
- **Fundamentals** — `components/Fundamentals.tsx`, symbol-linked off
  `/api/asset-profile` (the same row Profile reads, now carrying the FMP annual
  fundamentals). **Stocks-only** (crypto has no income statement → a notice): a
  5-yr revenue/net-income bar chart plus valuation (P/E, P/S, P/B, EV/EBITDA,
  PEG), profitability (margins, ROE, ROIC), YoY growth, health (debt/equity,
  current ratio, EPS, FCF), and dividend. Deliberately **disjoint from Profile**
  (no market cap / beta / sector / description). Default Main, no None.
- **Earnings** — `discover/EarningsCard.tsx`, reused from Discover via its
  `bare`/`dense` props (like `NewsCard`/`NewsWidget`): on a colour channel it
  shows that symbol's report history (`/api/calendar/earnings/{symbol}`); on
  **None** it shows the curated whole-market upcoming calendar
  (`/api/calendar/earnings`), mirroring NewsWidget's market mode. The per-symbol
  view passes the card's additive `showYear` prop (dates render `May 30 '26`)
  since its rows span quarters; Discover and the market view stay year-less.
  A crypto-linked symbol short-circuits the fetch and shows a "crypto has no
  earnings" notice instead of the backend's bare 404. No economic
  widget — the economic calendar has no per-symbol form and stays Discover-only.

## Link channels

Each widget carries a **link channel** (None + Main/blue/green/amber, persisted
in the panel's Dockview params):

- A symbol channel filters the widget to that one instrument
  (Positions/Orders/Activities take a `symbol` filter prop, news uses
  instrument-specific `useNews`).
- **None** shows whole-account info (Trade is symbol-only, no None; the chart
  widgets allow **None as a standalone mode** — the panel owns its symbol via
  `params.symbol` rather than following a shared channel, so a custom layout can
  show many distinct charts beyond the four colour channels; the Account widget
  is `lockedChannel` — always None, picker hidden).
- **Main** proxies the app's selected symbol.

The widget header (`LinkHeader`) carries a 2px channel-coloured accent bar across
the top, a primary mono symbol label that doubles as a click-to-search picker
(`AssetSearch`), and a quiet `kind` label (e.g. `AAPL · Chart`); each panel tab
also renders a small channel-coloured dot via a custom Dockview
`tabComponents.default` (`TabWithChannel`, reads `params.channel` — seeded on
mount by `useChannel`). `useChannel` also reports up to the Workspace context so
the toolbar Channels strip can count widgets per channel (Dockview emits no
params-changed event). Live quotes and bars are deduped across all widgets
through shared ref-counted streams (`data/quoteStream.ts`, `data/barStream.ts`);
`useLiveQuotes` and `lib/tv-datafeed.ts` ride them.

## Panel-size fit

Charts shed chrome/axes as their panel shrinks (see the chart widgets above);
Positions/Orders/Activities flip to their stacked card layout (and Profile drops
its stat grid 2→1 column) in narrow panels via `hooks/useContainerNarrow` + an
additive `dense` prop (panel-width, since `useMobile` is viewport-only and never
trips in this desktop-only mode; the flip width is tuned per widget by column
count — Orders 560, Positions 480, Activities 360, Profile 340, Fundamentals 340, Earnings 420
(drops the revenue column)); the header `AssetSearch` portals its dropdown to
`<body>` so it isn't clipped by the panel. Data widgets render **bare** (the
`bare` prop on `Orders`/`Activities`/`NewsCard` + the `Positions` strip rows) —
no per-component card border/shadow, since the panel is already a closed-off
module; rows separate with a hairline in both the table and the narrow
stacked-card layouts. Account stays clean by construction.

## Module pattern (reuse strategy)

Adding surfaces — Workspace widgets, or anything that may live in more than one
place — follows a strict three-layer split so a module built for one surface is
reusable elsewhere for free:

1. **Engine** — hooks + data + types (`use*`, `data/`, `api`, `types.ts`). Pure
   logic, no UI; shared platform-wide.
2. **Feature component** — presentational and *location-agnostic*: takes
   `symbol` / `assetClass` / callbacks as props and knows **nothing** about the
   Workspace. Lives in `components/`. Examples: `PriceChart`, `TVChartWidget`,
   `OrderTicketInline`, `Positions`, `Orders`, `Activities`, `NewsCard`,
   `AssetProfile`, `Fundamentals`, `AssetSearch`.
3. **Workspace adapter** — `lib/workspace/registry.tsx` (+ `Workspace.tsx`): the
   *only* layer that knows Dockview, link channels, the `LinkHeader`, and
   `useWorkspace`. It wraps a feature component and injects the cross-cutting
   Workspace behaviours (channel symbol, header symbol picker, shared streams).

Rules:

- **Never put Workspace concerns inside a feature component** — no
  `useWorkspace()`, Dockview params, channel logic, or `LinkHeader`. If a feature
  component reaches for `useWorkspace()`, lift that into the adapter. A feature
  component importing from `lib/workspace/` is a smell.
- **Build new modules as a layer-2 component first** (props in, callbacks out)
  even when the Workspace is the only consumer today, then add a ~15-line
  registry wrapper — reuse elsewhere is then just rendering it with props.
  `OrderTicketInline` is the precedent (built for the Workspace, lives in
  `components/trade/`, takes only `{ symbol }`).
- **Evolve shared components with additive, default-off props** — never change a
  shared component's default behaviour for a new surface. Precedents:
  `PriceChart`'s `responsive` (default `false` keeps Discover unchanged), the
  optional `symbol` filter on `Positions`/`Orders`/`Activities`, and the `bare`
  flag on `Orders`/`Activities`/`NewsCard` (+ the `Positions` strip rows) that
  drops the component's own card border/shadow inside a Workspace panel — the
  panel already supplies the chrome, so widgets render borderless with hairline
  row dividers instead. Default `false` keeps Discover/Portfolio boxed.
- **File location signals reusability:** reusable cores live in `components/`;
  anything under `lib/workspace/` is Workspace-coupled by definition — don't park
  a reusable core there.
- The registry is the single catalogue (`widgetId → component`); expose or retire
  a Workspace module there.

## AI / Ask-anything control

The Ask-anything bot can drive the Workspace (set channels, apply presets, add
or remove widgets, build a custom grid). See `docs/ai.md` → "Workspace control"
for the directive flow, and keep the placeable-widget enum in sync across its
five sources of truth (`backend/app/ai/tools_workspace.py`
`WORKSPACE_WIDGET_KINDS`, `lib/workspace/actions.ts` `WidgetId`/`WIDGET_IDS`,
`lib/workspace/registry.tsx` catalogue, and the `WORKSPACE_WIDGETS` map +
add-regex in `lib/ask-intent/detectors.ts`).
