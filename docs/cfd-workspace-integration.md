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
| Research widgets (Profile/Fundamentals/SmartScore/Trending/Sentiment/Analysts/HedgeFunds/Insiders/RelatedTickers/HolderDemographics) | partial | Stocks-only data; per Decision #2, resolve via `cfdUnderlying()`. |

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

## Phase 1 — CFD as a first-class Workspace silo (the unblock)

Smallest change that makes the CFD canvas correct. After this phase the
CFD-ready widgets (Chart, Positions, Activity) already work; the others fall
through to their existing not-supported behaviour until Phase 2.

- [ ] `registry.tsx`: `export type AssetClass = "stocks" | "crypto" | "cfd";`
- [ ] `App.tsx` (~line 603): pass `assetClass={activeClass}` (not `alpacaSilo`)
      to `<Workspace>`. Confirm `activeClass` is in scope there (it is).
- [ ] `Workspace.tsx`: add `cfd` to `CHANNEL_DEFAULTS`
      (`{ main: "EUR/USD", blue: "GBP/USD", green: "XAU/USD", amber: "US30" }`)
      and to `loadChannels` empty seed (`{ stocks: {}, crypto: {}, cfd: {} }`).
- [ ] Verify the orange/amber CFD accent (`oklch(72% 0.18 55)`, set on the app
      shell in `App.tsx` `siloAccent`) carries into the full-bleed canvas. The
      Workspace `+ Add widget` / Apply buttons use `var(--accent)`; in CFD they
      should read amber.
- [ ] Typecheck: `cd frontend && npx tsc -b`. The `AssetClass` widening will
      surface every exhaustive switch / `Record<AssetClass, …>` that now misses
      a `cfd` arm — fix each (the `SiloChannels` record, any `satisfies`
      Record). This is the compiler doing the audit for you.

**Verify Phase 1:** CFD silo → Workspace pill → canvas shows CFD defaults; a
Chart widget on Main shows EUR/USD via the FXCM datafeed; Positions widget shows
FXCM positions; switching back to stocks/crypto still shows their own layouts
(separate persistence slot).

## Phase 2 — CFD branches in shared feature components (additive)

- [ ] **`AccountPanel.tsx`**: widen `assetClass` to include `"cfd"`; add a CFD
      branch using `useFxcmAccount` (gate `enabled` on `cfd`). Render equity,
      day P/L, used margin, free margin (mirror `CfdPortfolioHero`'s figures).
      Keep the stocks/crypto path byte-for-byte unchanged.
- [ ] **`FxcmOrders.tsx`**: add additive `bare`, `dense`, `symbol` props so it
      can render inside a panel (borderless, hairline row dividers) and filter by
      the linked instrument. Default-off keeps the Portfolio screen unchanged.
- [ ] **`OrdersWidget`** (`registry.tsx`): render `<FxcmOrders bare … />` when
      `assetClass === "cfd"`, else the existing `<Orders>`. (Adapter-level
      branch — the feature components stay separate, mirroring the
      `CfdPriceChart` vs `PriceChart` sibling precedent.)
- [ ] **`Watchlist.tsx`**: add a `cfd` branch — `useFxcmWatchlistQuery` for the
      list, `useFxcmWatchlistAdd`/`Remove` for mutations, `digits`/`fmtSpread`
      precision from the `/prices` row. The SparkCard sparkline needs CFD bars
      (`/api/fxcm/history` / `useFxcmBars`) or fall back to the **List** row view
      (simpler — recommended for v1; cards can come later). Keep the
      Cards/List/Auto toggle.
- [ ] **`LinkHeader` + channel-chip `AssetSearch`** (`registry.tsx` +
      `Workspace.tsx` `ChannelChip`): pass `source="fxcm"` and the right
      `assetClass` when the silo is CFD so symbol pickers search FXCM
      instruments, not Alpaca.

**Verify Phase 2:** Account widget shows FXCM equity/margin; Orders widget shows
the FXCM blotter and filters by channel; Watchlist widget lists the FXCM
watchlist and add/remove round-trips; every header search in CFD returns FXCM
instruments.

## Phase 3 — CFD widgets, research resolution & per-silo menu

- [ ] **Mini-chart in CFD**: route `MiniChartWidget` to render `<CfdPriceChart
      instrument={symbol} />` when `assetClass === "cfd"` (it's the CFD analogue;
      `PriceChart` has no CFD branch). Live tip can ride `useFxcmPrices`.
      Alternative: a dedicated `cfdchart` widget id — prefer reusing the
      Mini-chart slot to avoid growing the catalogue.
- [ ] **`FxcmOrderTicketInline.tsx`** (new, `components/trade/`): a layer-2
      inline CFD ticket (props: `{ instrument }`), reusing the order logic behind
      `FxcmOrderSheet` (extract a shared hook if the sheet has inline-able
      state). Then **`TradeWidget`** branches to it when `cfd`. This is the one
      genuinely new component.
- [ ] **`cfdUnderlying(symbol)` helper** (`lib/asset-class.ts` or a new
      `lib/cfd-underlying.ts`): returns `{ symbol, assetClass } | null`.
      - Stock CFD (suffix `.us`/`.de`/`.hk`/… or `instrument_type == 8`) → strip
        suffix → `{ symbol: "AAPL", assetClass: "stocks" }`. Reuse the suffix
        parsing already in `lib/fxcm-countries.ts` (it splits the `.cc` suffix).
      - Crypto CFD → `{ symbol, assetClass: "crypto" }`.
      - else → `null`.
- [ ] **Research-widget adapters** (`registry.tsx`): when `assetClass === "cfd"`,
      resolve `const u = cfdUnderlying(symbol)`; if `u` fetch against
      `u.symbol`/`u.assetClass`, else render the existing notice. Touches:
      Profile, Fundamentals, SmartScore, Sentiment, Analysts, HedgeFunds,
      Insiders, RelatedTickers, HolderDemographics, Trending, Earnings, News.
      (Trending has no symbol input — leave it notice-only in CFD.)
- [ ] **Per-silo Add-menu gating**: filter `WIDGET_CATALOG` by silo so CFD only
      surfaces widgets that make sense (charts, trade, account, positions,
      orders, activity, watchlist, news, + the research widgets since they now
      resolve underlyings). Cleanest approach: add an optional `silos?:
      AssetClass[]` field to `WidgetMeta` (absent = all silos) and filter in
      `AddWidgetMenu`. Keep stocks/crypto menus unchanged.
- [ ] **CFD preset(s)** (`presets.tsx`): a CFD "Trader" default — Chart ·
      Watchlist · Positions · Orders · Account. Presets are silo-agnostic in
      structure but seed channel symbols; ensure the seeds are valid CFD symbols
      or omit seeds (channels fall back to `CHANNEL_DEFAULTS.cfd`). Decide whether
      CFD gets its own first-run preset vs. reusing Trader (Trader references
      `trade`/`orders` which now resolve correctly in CFD).

**Verify Phase 3:** Trade widget places a CFD order; a Profile widget linked to
`AAPL.us` shows AAPL's company profile; the same widget linked to `EUR/USD`
shows the not-available notice; the CFD Add menu hides nothing nonsensical.

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
6. Mini-chart→CfdPriceChart + cfdUnderlying helper.
7. Research-widget underlying resolution.
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
