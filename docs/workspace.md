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

Three-zone CSS grid (`auto 1fr auto`) — channels sit in the centre as the
visual centrepiece, layouts anchor the left, quiet actions anchor the right.

- **Layouts selector (LEFT)** — stateful button labelled `▦ {activeName} ▾`
  (Trader / Researcher / Watcher / Focus for built-in presets, "Custom" for
  drag-edited or AI-built layouts, otherwise the user-supplied saved name).
  Opens a 480px popover with two parts: the built-in **presets** (Trader /
  Researcher / Watcher / Focus — see `presets.tsx`; Trader = the old default,
  applied on first run; select a card then Apply, which clobbers the canvas),
  and a **"My layouts"** section for the user's named saved layouts —
  *Save current as…* (inline name input), then per-row *Apply / Rename /
  Delete*. A saved layout snapshots the Dockview JSON **and** the current
  colour-channel symbols into `saved[name] = { layout, channels }`
  (localStorage); Apply restores both. Applying a preset/custom layout
  resets only `active` — saved layouts persist.
- **Channels strip (CENTRE)** — boxed (`var(--bg)`-tinted panel, 1px border,
  10px radius), eyebrow `CHANNELS` + 1px hairline divider + one chip per
  symbol channel showing the channel symbol + a count of widgets bound to
  it; click opens `AssetSearch` to retarget the channel everywhere. Each
  Dockview panel header also carries a 7px channel-colour dot before the
  title (`TabWithChannel` in `lib/workspace/registry.tsx`).
- **Quiet actions (RIGHT)** — `＋ Widget` (ghost variant of AddWidgetMenu),
  `Tab bars` toggle (per-group header via Dockview), and a `⛶` Focus icon
  that hides the app header for a near-full-screen canvas (`Esc` exits
  unless a `[role=dialog]` is focused).

The AddWidgetMenu popover itself (also reachable from the empty-state CTA)
is unchanged: 320px `<body>`-portaled popover with a search input, grouped
sections (Charts / Trade / Market data / Activity), inline single-stroke
icons, and ↑/↓/Enter/Esc keyboard handling.

When the canvas has zero panels an empty-state overlay shows ＋ Add widget,
▦ Browse layouts, and a violet **✦ Ask AI to build one** CTA (dispatches a
synthetic ⌘K to open the existing Ask anything bar, which already builds
custom layouts via `buildCustomLayout`). The mode also goes **full-bleed**
(`.app.bleed` in `index.css` — no max-width/gutters, a full-height flex
column so the dock fills the viewport) and **drops the `TopBar` equity
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
  writes to the widget's channel. Container-width-aware in two steps: between
  280–420px a `compact` tier keeps the sparkline but shortens it (H=32 instead
  of 48, drops the name slot, auto-fill min drops 150→110px); under ~280px the
  layout forces a 2-col grid of dense `SparkCard`s (no sparkline at all,
  smaller fonts) instead of the auto-fill grid that would otherwise collapse to
  1-col and waste the dock height.
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
- **Trending** — `discover/TrendingResearchCard.tsx`, reused from Discover via
  its `bare`/`dense` props. Whole-market list of top trending stocks by analyst
  coverage (Tipranks, `/api/research/trending`); no symbol input. **Stocks-only**
  — crypto silo shows a notice. The widget still carries a channel selector
  (defaults to Main) so a row click writes the picked ticker into that channel
  and linked widgets follow — same pattern as Watchlist. See `docs/tipranks.md`.
- **SmartScore** — `research/SmartScoreCard.tsx`, per-symbol Tipranks composite
  signal (1-10) plus six input components (hedge-fund flow, blogger / news
  sentiment, insider activity, investor holding deltas). Symbol-linked like
  Profile/Fundamentals (default Main, no None). **Stocks-only**. The
  `fundamentals_*` fields from upstream are deliberately hidden in the UI to
  avoid duplicating Fundamentals (FMP is the higher-fidelity source for those
  metrics); the AI bots still receive them via `get_smart_score` so they can
  answer fundamentals questions when FMP is unavailable. Price target shown is
  Tipranks' own (NOT unified with Trending's avg PT — each widget keeps its own
  source).
- **Sentiment** — `research/SentimentCard.tsx`, combined blogger + news +
  Tipranks-investor sentiment for one stock. Three upstream Tipranks calls are
  fanned into the route; the card surfaces each block independently so a
  partial outage thins rather than blanks the widget. News uses a 3-segment
  pos/neu/neg bar (stock vs sector); blogger shows bullish/bearish ratios + top
  sources; investor shows portfolio holding stats + 7d/30d deltas. Symbol-linked
  (default Main, no None), stocks-only.
- **Analyst Ratings** — `research/AnalystRatingsCard.tsx`, per-analyst list
  for one stock (name, firm, recommendation, date). Paginated 8/page. Drills
  down from Trending's aggregate consensus. Symbol-linked (default Main, no
  None), stocks-only. Dense breakpoint 380 collapses the firm column.

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
trips in this desktop-only mode). `useContainerTall` is a sibling hook that
keys off panel *height* — currently used by Positions so a tall+narrow dock
tightens row padding/gap to fit more rows. Flip widths are tuned per widget; a
few widgets carry a second tier between full and dense (or above full, "wide")
so the transition isn't a single hard flip:

- **Orders** — dense 560 (table → cards). Intermediate `mid` 760 keeps the
  table but hides TIF + Submitted columns so it fits common 600–760px docks.
- **Positions** — dense 480 (strip → mobile card). Height `tall` 600 with
  `dense` engages `compact` row padding (8/12 instead of 14/16) for tall+narrow
  docks where many rows compete for vertical space.
- **Activities** — dense 360.
- **Profile** — dense 340 (stat grid 2 → 1).
- **Fundamentals** — own dense 400 (denser numeric data than Profile) + `wide`
  560 promoting the stat grids from 2 → 3 columns on roomy panels.
- **Earnings** — dense 420 drops the revenue column; `tight` 320 also
  suppresses the year suffix on per-symbol dates (`May 30 '26` → `May 30`),
  shrinking the date column from 72 → 48px before revenue drops.
- **Trending** — dense 360 drops the company name + market-cap columns.
- **News** — `compact` 320 stacks the rel-time *above* source+title instead of
  using the 60px left column.
- **Watchlist** — `compact` 420 + dense 280 (see widget bullet above).
- **Account** — equity headline scales: 32px at >=360px, 24px default, 20px
  under 240px.
- **Trade** — tightens at <300px: row gap and Buy/Sell + Submit button
  paddings shrink (no layout flip; `flex-wrap` already handled narrow chips).
- **LinkHeader** (shared) — self-measures via its own `useContainerNarrow`;
  under 260px drops the `· Kind` suffix and tightens `ChannelPicker`
  (gap 1 → 0.5, dot 11 → 9).

The header `AssetSearch` portals its dropdown to `<body>` so it isn't clipped
by the panel. Data widgets render **bare** (the `bare` prop on
`Orders`/`Activities`/`NewsCard` + the `Positions` strip rows) — no
per-component card border/shadow, since the panel is already a closed-off
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
