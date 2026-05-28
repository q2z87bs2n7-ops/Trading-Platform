# CFD silo → Workspace integration (tracked spec)

**Status:** Not started (spec only). **Branch:** `claude/cfd-silo-workspace-integration-BtckL`.
**Owner:** picked up by whichever agent is active — this doc is the handover.

Goal: make the desktop **Workspace** mode a first-class surface for the **CFD
(FXCM)** silo, at the same depth as the stocks/crypto silos. Read
`docs/workspace.md` (widget catalogue, link channels, module pattern) and
`docs/fxcm.md` (the CFD silo end-to-end) before starting — this spec assumes
both.

## Why this exists

Workspace is wired per-silo but only knows **two** silos. `AssetClass` in
`frontend/src/lib/workspace/registry.tsx` is `"stocks" | "crypto"`, and
`App.tsx` passes `assetClass={alpacaSilo}` to `<Workspace>` — `alpacaSilo`
coerces `cfd → stocks`. So today a CFD user who clicks the **Workspace** pill
silently lands in the **stocks** workspace (stock tickers, Alpaca account,
Alpaca orders). Nothing crashes; it's the wrong silo. This integration closes
that gap and brings CFD to parity.

## Decisions already made (do not relitigate)

1. **Scope: full parity (Phases 1–4 below).** CFD becomes a real Workspace
   silo, gets the CFD-capable widgets, a new inline CFD trade ticket, per-silo
   Add-menu gating, CFD layout presets, and AI/Ask-anything control parity.
2. **Research widgets resolve to the underlying instrument.** Profile /
   Fundamentals / SmartScore / Trending / Sentiment / Insiders / Analysts /
   HedgeFunds / RelatedTickers / HolderDemographics in the CFD silo:
   - **Stock CFDs** (FCLite `instrument_type == 8`, `.us`/`.de`/`.hk`/… suffix)
     → strip the exchange suffix to the underlying equity ticker
     (`AAPL.us → AAPL`) and fetch research against that. US-listed (`.us`) gets
     full FMP+Tipranks coverage; non-US suffixes will mostly 404 upstream and
     fall back to the existing "not available" notice naturally.
   - **Crypto CFDs** (an FXCM `BTC/USD`-style pair the cache classifies as CFD,
     mapping to a crypto underlying) → tokenomics Profile only (the crypto
     research path already shows notices for Fundamentals/Tipranks).
   - **FX pairs / indices / metals / commodities** → no underlying; render the
     existing stocks-only "not available for this instrument" notice.

   This requires a new helper `cfdUnderlying(symbol) → { symbol, assetClass } |
   null` that the research-widget adapters consult before fetching.

## Data model update — FXCM instruments now live in `assets` (2026-05, post-Phase 2)

**Important for Phase 3 planning.** The `fxcm_instruments` table is now
**empty/legacy** — all ~516 FXCM instruments were migrated into the **`assets`**
table under a `source='fxcm'` discriminator, alongside Alpaca's ~13.8k rows. Do
**not** query `fxcm_instruments`.

- **New `asset_class` values (FXCM-only):** `forex | stock_cfd | index | metal |
  commodity | cfd_other`. (These are DB-side; the frontend Workspace
  `AssetClass` stays `stocks | crypto | cfd` — the silo, not the instrument
  subtype.)
- **New `assets` columns (NULL for Alpaca rows):** `source`, `fxcm_type`,
  `fxcm_display_name`, `fxcm_underlying_unit`, `fxcm_alternatives`,
  `fxcm_session`, `fxcm_timezone`, `fmp_ticker`.
- **FMP enrichment is live on stock CFDs:** 255 / 369 `stock_cfd` rows have FMP
  profile data in the **standard enrichment columns** (description, logo_url,
  sector, market_cap, industry, country, is_adr, ceo, employees, beta, …).
  `fmp_ticker` records which ticker resolved (bare ADR first, e.g. `ASML` for
  `ASML.nl`, falling back to exchange-suffixed `ASML.AS`).
- **`GET /api/asset-profile/{symbol:path}`** (`db.get_asset_profile`) queries
  `assets` with **no source filter**, so it already returns enrichment for FXCM
  stock CFDs — e.g. `/api/asset-profile/RBLX.us` works **today, no backend
  change**. → The **Profile** and **Fundamentals** widgets can serve stock CFDs
  by calling asset-profile with the **raw CFD symbol** (no underlying-strip
  needed) and rendering in the stocks layout.
- **Search:** FXCM rows have `tradable=NULL` → excluded from `search_assets`
  (the Alpaca/crypto search). CFD lookup goes through
  `GET /api/fxcm/search-instruments` (queries `assets WHERE source='fxcm'`) —
  which is exactly what `AssetSearch source="fxcm"` (wired in Phase 2) already
  uses. Do **not** use `search_assets` for CFD.

**Phase 3 consequence — revised research-widget approach:** the original
`cfdUnderlying()` suffix-strip plan is **mostly superseded for Profile /
Fundamentals** — pass the raw CFD symbol straight to `/api/asset-profile` and
render as stocks. A resolver is still needed for the **Tipranks** widgets
(SmartScore / Sentiment / Analyst Ratings / Hedge Funds / Insiders / Related
Tickers / Holder Demographics), which hit `/api/research/*` by **US** ticker:
those only work for `.us` stock CFDs whose `fmp_ticker` is a bare US symbol;
everything else (non-US stock CFDs, FX, index, metal, commodity) shows the
notice. Knowing a CFD symbol's subtype client-side needs the instrument's
`asset_class`/`fxcm_type` — surface it via the boot classifier cache
(`lib/asset-class.ts`, fed from the FXCM instrument list) or a small lookup;
don't assume the suffix alone.

## Current-state facts (verified at spec time — re-verify if stale)
- `VERSION` was `1.6.8` when this spec was written. Each `claude/` commit bumps
  **Z** (see `CLAUDE.md` workflow rules).
- `AssetClass = "stocks" | "crypto"` — `frontend/src/lib/workspace/registry.tsx`
  (~line 69). `Silo = AssetClass` — `frontend/src/lib/workspace/actions.ts:32`.
- `App.tsx` renders Workspace at ~line 589–609 with `assetClass={alpacaSilo}`
  (the bug). `alpacaSilo` is `activeClass === "crypto" ? "crypto" : "stocks"`
  (~line 274) — coerces `cfd → stocks`.
- `Workspace.tsx` persistence + channels:
  - `CHANNEL_DEFAULTS` (~line 174) keyed by `AssetClass`: `stocks`/`crypto` only.
  - `SiloChannels = Record<AssetClass, Record<string, string>>` (~line 171);
    `loadChannels` empty seed is `{ stocks: {}, crypto: {} }` (~line 180).
  - Layout persistence key `workspace_layouts_{ac}_v2`; channels key
    `workspace_channels_v1`. Both partition by `AssetClass`, so adding `"cfd"`
    to the type gives CFD its own persisted slot for free (no migration).

### Widget reusability matrix (verified)

| Widget surface | CFD-ready today? | Notes |
|---|---|---|
| `Positions.tsx` | ✅ yes | `assetClass="cfd"` → CFD branch; `bare`/`dense`/`compact`/`symbol` present. |
| `Activities.tsx` | ✅ yes | `cfd` branch → `useFxcmClosedTrades`; `bare`/`dense`/`symbol`. |
| `TVChartWidget.tsx` | ✅ yes | TV datafeed (`lib/tv-datafeed.ts`) branches on `getAssetClass()==="cfd"`; no `assetClass` prop needed. |
| `CfdPriceChart.tsx` | ✅ yes | Standalone; props `instrument`, optional `livePrice`, `onOpenChart`. CFD analogue of Mini-chart. No `responsive` prop. |
| `AssetSearch.tsx` | ✅ yes | `source="fxcm"` routes to `searchFxcmInstruments`, tags `asset_class:"cfd"`. |
| `PortfolioHero.tsx` | ✅ yes | `CfdPortfolioHero` sub-component (props: `isMobile`). Not a widget yet but a reuse precedent. |
| `AccountPanel.tsx` | ❌ no | `assetClass: "stocks" \| "crypto"` only; needs a `cfd` branch via `useFxcmAccount`. |
| `Orders.tsx` | ❌ no | Alpaca-only. CFD has a separate `FxcmOrders.tsx` blotter (standalone; takes `bare`, no `symbol`/`dense` yet). |
| `Watchlist.tsx` | ❌ no | stocks/crypto only; CFD uses `useFxcmWatchlistQuery` + FXCM add/remove. |
| `OrderTicketInline.tsx` | ❌ no | Alpaca-only; **no inline CFD ticket exists** — only `FxcmOrderSheet` (a modal). New layer-2 component required. |
| Research widgets (Profile/Fundamentals/SmartScore/Trending/Sentiment/Analysts/HedgeFunds/Insiders/RelatedTickers/HolderDemographics) | partial | Profile/Fundamentals work for stock CFDs via `/api/asset-profile` (raw symbol). Tipranks widgets need US-ticker resolution. See "Data model update". |

### FXCM hooks available (`frontend/src/data/hooks.ts`)

`useFxcmAccount`, `useFxcmPositions`, `useFxcmPrices`, `useFxcmOrders`,
`useFxcmClosedTrades`, `useFxcmSubmitOrder`, `useFxcmCancelOrder`,
`useFxcmModifyOrder`, `useFxcmWatchlistQuery`, `useFxcmWatchlistAdd`,
`useFxcmWatchlistRemove`, `useFxcmClosePosition`, `useFxcmBars`,
`useFxcmInstruments`, `useFxcmDisplayNames`, `useFxcmUnderlyingUnit`. All take
an `enabled` flag — gate them off when the silo isn't CFD (don't hit the bridge
from the stocks/crypto canvas).

### AI-control sources of truth (keep in sync — five places)

Per `docs/workspace.md` → "AI / Ask-anything control". The placeable-widget enum
and the silo enum live in:
- `backend/app/ai/tools_workspace.py` — `WORKSPACE_WIDGET_KINDS` (~line 15) and
  `_SILO_PROP` (~line 38, `enum: ["stocks", "crypto"]`).
- `frontend/src/lib/workspace/actions.ts` — `WidgetId` union + `WIDGET_IDS`.
- `frontend/src/lib/workspace/registry.tsx` — `WIDGET_COMPONENTS` + `WIDGET_CATALOG`.
- `frontend/src/lib/ask-intent/detectors.ts` — `WORKSPACE_WIDGETS` map (~line 247)
  + `watchSilo()` (~line 284, returns `crypto`/`stocks` only).

## The module pattern (must follow — see docs/workspace.md)

Three layers: **engine** (hooks/data) → **feature component** (presentational,
location-agnostic, props in / callbacks out, lives in `components/`, knows
nothing about Workspace) → **Workspace adapter** (`registry.tsx`, the only layer
that touches Dockview / channels / `LinkHeader`). Evolve shared components with
**additive, default-off props** — never change a default for the new silo. A
feature component importing from `lib/workspace/` or calling `useWorkspace()` is
a smell.

---

## Phase 1 — CFD as a first-class Workspace silo (the unblock) — ✅ LANDED

Smallest change that makes the CFD canvas correct. After this phase the
CFD-ready widgets (Chart, Positions, Activity) work; the others render an
interim `CfdPending` notice (no wrong-silo data) until Phases 2–3.

- [x] `registry.tsx`: `export type AssetClass = "stocks" | "crypto" | "cfd";`
- [x] `App.tsx`: pass `assetClass={activeClass}` (not `alpacaSilo`) to
      `<Workspace>`.
- [x] `Workspace.tsx`: added `cfd` to `CHANNEL_DEFAULTS`
      (`{ main: "EUR/USD", blue: "GBP/USD", green: "XAU/USD", amber: "US30" }`)
      and to `loadChannels` empty seed (`{ stocks: {}, crypto: {}, cfd: {} }`).
- [x] **TVChartWidget**: threaded an `assetClass` prop → `createDatafeed({
      getAssetClass, getSearchAssetClass })` (mirrors `TVPlatform`). Without this
      the Chart widget defaulted `getAssetClass` to `""` and never routed to
      FXCM — the spec's "Chart shows EUR/USD via FXCM" goal needed it. The
      `ChartWidget` adapter passes `assetClass` from `useWorkspace()`.
- [x] **Interim `CfdPending` guards** (new tiny helper in `registry.tsx`): the
      Alpaca-only widgets render a "not wired for CFD yet" notice when
      `assetClass === "cfd"` instead of passing `cfd` through (which would show
      *stock* data — the wrong-silo bug). The ternary's false branch narrows the
      type back to `stocks|crypto`, so the feature-component signatures are
      untouched (Phases 2–3 widen them properly and delete the guard). Guarded:
      **Orders, Account, Watchlist, Profile, Fundamentals, Mini chart, Trade
      ticket**.
- [x] Typecheck clean (`npx tsc -b`, exit 0). `npm install` was needed first
      (fresh container).

**Verify Phase 1 (runtime — pending user sanity-check):** CFD silo → Workspace
pill → canvas shows CFD defaults; a Chart widget on Main shows EUR/USD via the
FXCM datafeed; Positions/Activity widgets show FXCM data; the guarded widgets
show the interim notice; switching back to stocks/crypto still shows their own
layouts (separate persistence slot).

**Known interim gaps after Phase 1 (handled in 2–3):**
- The research/market widgets **not** guarded (News, Earnings, Trending,
  SmartScore, Sentiment, Analyst Ratings, Hedge Funds, Insiders, Related
  Tickers, Holder Demographics) will attempt their normal fetch for a CFD
  symbol (e.g. `EUR/USD`) and likely show an error/empty state. These are
  market-data, not wrong-silo *account* data, so they were left for Phase 3
  (underlying resolution + per-silo Add-menu gating). Acceptable interim.
- The amber CFD accent on the canvas chrome is inherited from `App.tsx`
  `siloAccent` on the `.app` wrapper — verify visually at sanity-check.

## Phase 2 — CFD branches in shared feature components (additive) — ✅ LANDED

- [x] **`AccountPanel.tsx`**: split into per-silo sub-components
      (`AlpacaAccountPanel` / `CfdAccountPanel`) so each calls only its own hook
      (React hooks rule — `useAccount` has no `enabled` flag). CFD branch reads
      `useFxcmAccount` + `useFxcmOrders`: equity, day P/L (basis = equity −
      day_pl), balance, used/free margin, total P/L, open-order count. Shared
      `Equity` headline extracted; Alpaca path unchanged.
- [x] **`FxcmOrders.tsx`**: additive `bare` (drop card chrome) + `dense` (force
      stacked cards via `useMobile() || dense`) props. `symbol` filter already
      existed. Default-off keeps the Portfolio screen unchanged.
- [x] **`OrdersWidget`** (`registry.tsx`): renders `<FxcmOrders symbol dense
      bare />` when `cfd`, else `<Orders>`.
- [x] **`Watchlist.tsx`**: split into `AlpacaWatchlist` / `CfdWatchlist`.
      `CfdWatchlist` uses `useFxcmWatchlistQuery` + `useFxcmWatchlistAdd/Remove`,
      `AssetSearch source="fxcm"`, `useFxcmDisplayNames` labels, and renders a
      **List** of `CfdWatchlistRow`s (display name · mid price at per-instrument
      `digits` · live spread via `fmtSpread`). **List-only for v1** — the
      SparkCard grid + Cards/List toggle are deferred (needs per-instrument
      daily bars via `useFxcmBars`); see Phase 3 / BACKLOG.
- [x] **`LinkHeader` + channel-chip `AssetSearch`** (`registry.tsx` +
      `Workspace.tsx` `ChannelChip`): pass `source={cfd ? "fxcm" : "alpaca"}` so
      symbol pickers search FXCM instruments in the CFD silo.

**Interim guards removed:** Orders, Account, Watchlist now render real CFD data.
Still `CfdPending` (Phase 3): Profile, Fundamentals, Mini chart, Trade ticket.

**Verify Phase 2 (runtime — pending):** Account widget shows FXCM
equity/margin; Orders widget shows the FXCM blotter and filters by channel;
Watchlist widget lists the FXCM watchlist (List view) and add/remove
round-trips; header + channel-chip search in CFD returns FXCM instruments.

**Deferred to Phase 3 / BACKLOG:** CFD Watchlist **Cards** view (SparkCard +
daily-bars sparkline) and the Cards/List/Auto toggle.

## Phase 3 — CFD widgets, research resolution & per-silo menu — ✅ LANDED

- [x] **Mini-chart in CFD**: `MiniChartWidget` renders `<CfdPriceChart
      instrument={symbol} />` in the CFD silo (the lightweight-charts CFD
      analogue; `PriceChart` has no CFD branch).
- [x] **`FxcmOrderTicketInline.tsx`** (new, `components/trade/`): inline CFD
      ticket (`{ instrument }`) — Buy/Sell · Market/Entry · amount · rate,
      reusing `useFxcmSubmitOrder` and the SE/LE derivation from `FxcmOrderSheet`
      (logic duplicated rather than extracted — surgical; revisit if the sheet
      changes). `TradeWidget` routes to it when `cfd`.
- [x] **Profile / Fundamentals in CFD** (no resolver needed): both already key
      off the DB row's `asset_class`, and `/api/asset-profile/{symbol:path}`
      serves FXCM stock CFDs directly. Widened their `assetClass` prop to accept
      `cfd`; adapters gate to **stock CFDs** (`isStockCfdSymbol` — dot-suffix
      test) and show a notice for FX/index/metal/commodity. Graceful component
      notice still covers stock CFDs lacking FMP.
- [x] **Case-safe symbols** (`normSym`): stock CFDs carry a case-sensitive
      lowercase suffix (`RBLX.us`); all symbol derivations preserve raw case in
      the CFD silo. (Was an upper-casing bug that would have broken the
      classifier cache + API lookups.)
- [x] **Stock-CFD test + US-underlying resolver** (`lib/asset-class.ts`):
      `isStockCfdSymbol` (dot-suffix) and `cfdUsUnderlying` (`.us` → bare US
      ticker). The dot-suffix test replaced the planned classifier-subtype
      lookup — simpler and reliable (only stock CFDs carry a dot).
- [x] **Tipranks widgets** (SmartScore, Sentiment, Analyst Ratings, Hedge Funds,
      Insiders, Related Tickers, Holder Demographics): shared `cfdResearch()`
      resolver — US stock CFDs (`.us`) → bare US ticker; everything else blocked
      with the existing notice. Trending stays notice-only in CFD.
- [x] **News / Earnings in CFD**: News uses the underlying ticker for stock
      CFDs, else the market feed (label reads "Market"); Earnings resolves
      per-symbol to the US underlying for stock CFDs, else a "no earnings"
      notice. Market mode unchanged.

**Skipped (low value, documented):**
- **Per-silo Add-menu gating** — unnecessary given the "show research for stock
  CFDs" decision: every widget is reachable in CFD with graceful notices, which
  is exactly how the **crypto** silo already behaves (research widgets show a
  stocks-only notice there too). Adding silo gating would diverge from that
  established pattern for no functional gain.
- **Dedicated CFD preset** — the **Trader** first-run preset already works in
  CFD (Chart · Positions · Trade · Account · Orders · News · Activity all
  resolve). A fresh CFD silo boots into a working Trader layout. If a tailored
  CFD preset is wanted later, add it to `PRESETS` with a `silos` filter in
  `LayoutsMenu`.

**Verify Phase 3 (runtime — pending):** Trade widget places a CFD order; Mini
chart shows the selected instrument; a Profile/Fundamentals widget linked to a
`.us` stock CFD (e.g. `RBLX.us`) shows the company data and the same widget on
`EUR/USD` shows the notice; a SmartScore widget on `RBLX.us` shows Tipranks data
and on `EUR/USD` the notice.

## Phase 4 — AI / Ask-anything control parity

- [ ] `tools_workspace.py`: `_SILO_PROP` enum → `["stocks", "crypto", "cfd"]`;
      update the description. Confirm no other backend silo gate rejects `cfd`.
- [ ] `detectors.ts`: teach `watchSilo()` to detect CFD intent (FXCM symbols via
      the `isCfdSymbol` cache / fiat-pair regex), returning `"cfd"` when the
      requested symbols are CFD instruments. Keep stocks/crypto behaviour.
- [ ] Keep the placeable-widget enum synced across the five sources of truth
      (above) — no new widget ids are strictly required (CFD reuses the existing
      ids), but if a `cfdchart` id is added in Phase 3 it must be added here too.
- [ ] `App.tsx` controller bridge (`enterWorkspace`): it already switches silos
      via `switchAssetClass(silo)`; confirm it accepts `"cfd"`.

**Verify Phase 4:** Ask-anything "watch EUR/USD, GBP/USD and gold with charts and
an account panel" while in (or naming) the CFD silo builds a CFD canvas.

---

## Cross-cutting gotchas

- **Gate every FXCM hook with `enabled`** so the stocks/crypto canvas never hits
  the bridge, and the CFD canvas only fetches when mounted. The hooks already
  take the flag.
- **Bridge-offline degradation**: `/api/fxcm/*` returns 503 when the JVM is down.
  Widgets must show the same inline offline/empty state the CFD Discover/Portfolio
  surfaces use — don't crash the panel.
- **Precision**: prefer `digits`/`point_size` from the live `/prices` row over
  the `cfdDigits()`/`cfdPriceScale()` heuristic (see `docs/fxcm.md` →
  "Per-instrument price precision"). `fmtSpread(bid, ask, point_size)` for
  spread display.
- **Display names**: raw `name` (e.g. `XAU/USD`) for all API calls; `display_name`
  (e.g. `Gold`) is display-only via `useFxcmDisplayNames`.
- **DB-only FXCM endpoints** (`display-names`, `underlying-units`,
  `search-instruments`) go via `API_BASE` (Vercel), not `STREAM_BASE` (Render) —
  `AssetSearch source="fxcm"` already does this. Don't reroute them.
- **`workspace_layouts_cfd_v2`** will be created fresh; no v1→v2 migration exists
  for CFD (there was never a v1 CFD key). Fine — `loadLayouts` returns null and
  the default preset builds.

## Workflow (per CLAUDE.md — strict)

- All work on `claude/cfd-silo-workspace-integration-BtckL`. Surgical, additive
  edits only; no reformatting of surrounding code.
- **Bump `VERSION` Z by 1 on every commit** to this branch. Frontend version
  syncs via `npm run sync-version` (auto pre-build).
- Keep `requirements.txt` (root + backend) in sync if any backend dep is added
  (none expected here).
- Typecheck before each commit: `cd frontend && npx tsc -b`.
- Do **not** merge to `main` or open a PR without explicit user approval.

## Suggested commit slicing

1. Phase 1 (type widen + App wiring + channel defaults) — one commit, verifiable.
2. AccountPanel CFD branch.
3. Orders/FxcmOrders widget branch.
4. Watchlist CFD branch.
5. Header/channel AssetSearch source=fxcm.
6. Mini-chart→CfdPriceChart + instrument-subtype lookup (`cfdSubtype`).
7. Profile/Fundamentals via asset-profile + Tipranks US-ticker resolution.
8. Per-silo Add-menu gating + CFD preset.
9. AI control parity (backend + detectors).

Each commit should leave the app green (`tsc -b` clean, no silo regressions).

## Definition of done

- CFD silo Workspace renders CFD data across Chart, Mini-chart, Positions,
  Orders, Activity, Account, Watchlist, Trade.
- Research widgets resolve stock/crypto-CFD underlyings; show the notice for
  FX/index/metal/commodity instruments.
- Per-silo persistence works (CFD layouts/channels independent of stocks/crypto).
- Ask-anything can build/drive a CFD canvas.
- `tsc -b` clean; stocks/crypto Workspace behaviour unchanged.
- `docs/workspace.md` updated (CFD silo + any new widget/preset); this spec's
  checkboxes ticked or the file removed once shipped.
