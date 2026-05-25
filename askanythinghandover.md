# Handover — "Ask anything" intent-router rework

> Self-contained brief for the agent taking over this task. Read it top to
> bottom, then read `CLAUDE.md`, `docs/landmines.md`, and `BACKLOG.md`.
> **You may delete this file before the final merge to `main` — it's onboarding,
> not repo documentation.**

## TL;DR
Make the "Ask anything" bar route precisely. Today the local regex parser
(`frontend/src/lib/ask-intent.ts`) over-fires canned responses and hijacks
queries that should go to the AI (it treats any short non-stopword word as a
ticker and matches keywords anywhere in a sentence). Rework it into a
**confidence-scored, AI-aware router** with **full-catalogue symbol validation**,
a **force-AI escape hatch**, and a **Vitest routing corpus**. Plan is P1→P4 below.

## Git state (read carefully)
- **Your branch: `claude/ask-router-rework`** — branched off `main`, clean
  baseline, `VERSION` 0.50.1. Develop here.
- `main` = commit `00b1fd3` = v0.50.1. It has: the bot rename, Ask-anything
  Workspace control, the 3 AI toggles, and a trimmed BACKLOG. It does **not**
  have the parser stopgap (deliberately).
- There is a **stale** branch `claude/ask-anything-workspace-controls-OWamQ` whose
  tip (`4ec0519`, v0.50.2) holds a *stopgap* parser patch from UAT. **Ignore it.**
  Your rework rewrites that file properly and supersedes the stopgap; do not merge
  or cherry-pick it. (If you ever look: it hardcoded a `CRYPTO_BASES` set and
  anchored `watch` — your P1/P2 replace both.)

## Repo conventions you MUST follow (from CLAUDE.md)
- Work on the `claude/` branch; **never push to `main` without explicit user
  approval**; merges to `main` are **fast-forward only**.
- Bump root `VERSION` patch (Z) by 1 on **every** branch commit. Promotion to
  `main` bumps Y and resets Z.
- `cd frontend && npx tsc -b` must pass before committing UI changes.
- Any new Python dep goes in **both** `requirements.txt` and
  `backend/requirements.txt` (CI fails on divergence).
- No model identifiers in commits/PRs/code. Surgical, additive edits; don't
  reformat surrounding code. Don't open PRs unless asked.
- Commit messages end with the session footer the harness expects.

## Context — what already shipped (don't redo; it's on `main`)
- **Bot rename** Cmd*→Ask*: `components/ask/` (was `cmd/`), `AskBar`,
  `lib/ask-intent.ts`, setting key `askAiEnabled`. The ⌘K/Ctrl-K hotkey + badge
  stayed; only the *naming* changed.
- **Ask-anything Workspace control**: the bot can set channel instruments, apply
  presets, add/remove widgets, and build custom responsive grids. Pattern: backend
  `ai/tools_workspace.py` tools queue client directives into
  `AskResponse.workspace_actions`; the frontend replays them via
  `lib/workspace/controller.ts` against the lazy canvas. Chart widgets gained a
  standalone **None** channel mode (own symbol via `params.symbol`). There's also a
  deterministic local `workspace` intent in `ask-intent.ts`.
- **Three per-surface AI toggles** in `lib/settings.ts` —
  `marketSummaryAiEnabled` / `askAiEnabled` / `chartbotEnabled` — **all default
  OFF** (opt-in; no Anthropic credits until enabled). A disabled surface renders
  the shared `components/AiDisabledNotice.tsx`.

## The problem (why this task exists)
`parseIntent` (`frontend/src/lib/ask-intent.ts`) was tuned pre-AI for max
**recall** of canned cards: it matches trigger keywords *anywhere* in a sentence
and `STOPWORDS` is a DENYLIST, so any word not on it (SEVEN, TECH, BEST) passes as
a ticker. With the AI fallback now present, that tolerance HIJACKS natural-language
queries (e.g. "what do you make of the best biotech names" → movers; "create a
layout to watch the seven best tech companies" → charts SEVEN/BEST/TECH). Users
resort to mashing words together to escape canned matches. This is the app's
biggest UX pain point.

Key facts (verified):
- AskBar (`components/ask/AskBar.tsx`) already has, synchronously, the user's live
  symbols via `usePositions`/`useWatchlist`/`useCryptoWatchlist` — but the user
  wants validation against the **whole catalogue**, not just their screens (the
  tool's value is asking about stocks not already on screen).
- Backend catalogue is Postgres (Supabase): `db.search_assets` (visibility rule =
  `tradable=true AND enrichment_source IS NOT NULL`), `db.get_asset`, and
  `db._symbols(asset_class, enriched)` (db.py:492) already returns the exact set
  we need. Routes live in `backend/app/main.py` (`/api/assets/{symbol:path}` at
  ~185, `/api/assets` search at ~269).
- The AI fallback is one-shot: `FallbackOrAiCard` in
  `components/ask/cards/FallbackCard.tsx` gates on `settings.askAiEnabled`
  (true → calls `/api/ai/ask`; false → shows the disabled notice).

## Approved plan (decisions are locked — build to these)
Decisions made with the user: (1) validate tickers against the **whole Postgres
catalogue**; (2) add a **force-AI escape hatch**; (3) add **Vitest + a routing
corpus**. Tolerance is **AI-aware**: strict when AI is on (send ambiguous to AI),
tolerant when AI is off (≈ today's recall).

### P1 — Full-catalogue symbol universe (smallest; do first)
- **Backend** (`backend/app/main.py`, `backend/app/db.py`): new
  `GET /api/asset-symbols` → `{ us_equity: string[], crypto: string[] }`.
  ⚠ **Do NOT name it `/api/assets/symbols`** — `/api/assets/{symbol:path}` is
  greedy and defined first; it would capture "symbols". Use the sibling path
  `/api/asset-symbols`. Add `db.list_symbols(asset_class)` as a thin public wrapper
  over `db._symbols(asset_class, enriched=True)` applying the same visibility rule
  as `search_assets` (`tradable=true AND enrichment_source IS NOT NULL`). Guard
  with `db.db_enabled()` / `DbUnavailable` → `{us_equity:[], crypto:[]}`.
- **Frontend** (`frontend/src/api.ts`, `data/queryClient.ts`, `data/hooks.ts`):
  `api.getAssetSymbols()`, `qk.assetSymbols`, `useAssetSymbols()` using
  **stale-while-revalidate**: `staleTime: 24h`; `initialData` read from
  localStorage `asset_symbols_v1 = { ts, us_equity, crypto }` for instant
  cold-start; persist-on-success. Serves instantly, refreshes silently ≤1×/day (and
  on a hard reload when stale); self-resets on malformed JSON or a bumped key
  version. **Staleness is harmless** — a brand-new ticker not yet in the set just
  routes to the AI. A `useSymbolUniverse()` returns `{ stocks: Set, crypto: Set,
  loaded: boolean }` (map FE `"stocks"` → backend `"us_equity"`). Payload ≈
  15–25 KB gzipped, fetched once.
- This **replaces the hardcoded crypto-coin heuristic** (a token in the crypto Set
  ⇒ crypto silo). Keep a tiny seed (BTC/ETH/SOL…) for the cold-load window.

### P2 — Confidence router (the core)
Refactor `lib/ask-intent.ts` → a `lib/ask-intent/` folder; keep a back-compat
`index.ts` barrel re-exporting `parseIntent`, `extractSymbols`, `Intent`,
`AssetClass` so the ~10 importers (AskBar, cards, the card files, TopBar,
useMarketSummary, api.ts) keep working unchanged.
- `types.ts` — `Intent`, `RouteContext = { assetClass, aiEnabled, symbolUniverse }`,
  `ScoredCandidate`.
- `symbols.ts` — move `toSymbol`/`findSymbol`/`extractSymbols`/`STOPWORDS`/
  `QUOTE_CCY`; add `isValidSymbol(tok, universe, silo)` and `isCryptoToken(tok,
  universe)` consulting the Sets.
- `detectors.ts` — each current matcher (order, close, portfolio, movers, news,
  orders, chart, market_summary, workspace) returns match facts instead of
  early-returning.
- `scoring.ts` — the confidence model (constants live here; tune numbers, not
  control flow).
- `router.ts` — `routeQuery(text, ctx): Intent`. `parseIntent(text, assetClass)` =
  `routeQuery(text, { assetClass, aiEnabled: false, symbolUniverse: empty })`
  (preserves today's tolerant behavior for un-migrated callers).

**Confidence model** (factors summed → clamp 0..1):
- **Coverage** (primary): matched non-stopword tokens ÷ total. Whole-query command
  ("top gainers", "buy 100 AAPL") ≈ 1.0; keyword buried in prose ≈ 0.15. This is
  the main hijack fix.
- **Start-anchoring**: +0.2 when the trigger is at string start.
- **Structured grammar**: order / set-channel / clean watch-list / explicit
  "chart X" get a high base (≈0.85) — rigid syntax is inherently confident.
- **Validated symbol**: +0.25 only if the token is in `symbolUniverse` for the
  silo — but **gated by coverage** (coverage < 0.4 ⇒ bonus 0) and **casing** (a
  lowercase prose mention never earns it unless the whole query is that one token).
  This is why a real-but-common ticker (TECH, BEST, ON, IT, ALL) buried in prose
  still loses.
- **Question/opinion penalty** (−0.5, both modes): trailing `?`, or
  `/\b(should i|worth|vs|versus|what do you (think|make)|tell me about|thoughts on|how about|is it a)\b/`. Extends today's start-only negative guard to
  mid-sentence/contraction cases it misses.

**Thresholds:** AI **on** → fire canned iff topScore ≥ **0.75**, else `fallback`
(→ AI). AI **off** → fire canned iff topScore ≥ **0.30** (≈ today's recall), else
`fallback` (→ the disabled notice). The same query can route differently by mode.

### P3 — Force-AI escape hatch (`components/ask/AskBar.tsx`)
- In `submit()`, strip a leading `/^(ai|ask):\s*/i` → force `{ type:"fallback" }`
  (bypasses scoring).
- Add a small "✦ Send to AI" button beside Send → `submit("ai: " + text)`.
- No `cards.tsx`/`FallbackCard.tsx` change — `FallbackOrAiCard` already gates on
  `askAiEnabled`, so forcing AI while it's off correctly shows the enable notice.

### P4 — Vitest + routing corpus
- Add devDep `vitest` (environment `node` — pure functions, no jsdom needed).
  `package.json` scripts: `"test": "vitest run"`, `"test:watch": "vitest"`. Add a
  `test` block to `frontend/vite.config.ts` (it currently imports `defineConfig`
  from "vite"; switch to `vitest/config` or add `/// <reference
  types="vitest/config" />`).
- Corpus at `frontend/src/lib/ask-intent/__tests__/router.test.ts` — table-driven
  over `{ input, assetClass, aiEnabled → expected }` with a stub universe
  (AAPL/NVDA/TSLA/TECH/BEST/ON + BTC/ETH/SOL). The corpus is the tuning gate. Seed
  rows (extend liberally):
  - "create a layout to watch the seven best tech companies" / stocks / ai → `fallback`
  - "what do you make of the best biotech names" / stocks / ai → `fallback`
  - "top gainers" / stocks / {on,off} → `movers`
  - "buy 100 AAPL at market" / stocks / ai → `order`
  - "AAPL" / stocks / ai → `chart`
  - "tell me about TECH" / stocks / ai → `fallback` (NOT chart)
  - "should I buy NVDA?" / stocks / {on,off} → `fallback`
  - "watch AAPL NVDA TSLA" / stocks / ai → `workspace`
  - "watch BTC ETH SOL" / stocks / ai → `workspace` (silo=crypto)
  - "ai: top gainers" / stocks / ai → `fallback` (forced)
  - "news on AAPL" / stocks / off → `news`
  - "portfolio" / stocks / {on,off} → `portfolio`

## Pitfalls / risks
- **Route collision**: `/api/asset-symbols` must NOT live under
  `/api/assets/{symbol:path}`.
- **Real-ticker-as-word** (TECH/BEST/ON are valid tickers): coverage-gating +
  casing + question penalty must override raw symbol validity. Test it.
- **AI-off regression**: users rely on current recall; the 0.30 floor + corpus
  rows asserting AI-off parity guard it.
- **Cold load**: before the universe loads (`loaded === false`), fall back to the
  uppercase/stopword heuristic and bias ambiguous → AI when AI is on; localStorage
  `initialData` makes this rare.
- **Don't carry over the stopgap's hardcoded `CRYPTO_BASES`** — it's replaced by
  the symbol universe.

## Verification
1. `cd frontend && npx tsc -b` clean; `npm test` green (corpus).
2. Backend: `GET /api/asset-symbols` returns both lists; spot-check a known ticker
   present and a junk token absent; confirm payload size + caching.
3. `npm run dev` matrix, **AI on**: the failure cases route to AI; legit commands
   ("portfolio", "buy 50 AMD", "AAPL", "top gainers", "news on TSLA", "watch AAPL
   NVDA") still fire canned instantly; "ai:" / Send-to-AI forces AI.
4. **AI off**: tolerant canned still fires; opinion/forced-AI queries show the
   enable notice.
5. Cross-silo "watch BTC ETH SOL" from stocks switches to crypto via the universe.

## First steps
1. Confirm with the user which branch you're on (should be
   `claude/ask-router-rework`) and that you've read this doc + `CLAUDE.md`.
2. `cd frontend && npm install` (fresh container), then build P1 (endpoint + hook +
   universe), `npx tsc -b`, manual check, commit (bump VERSION Z).
3. Then P2 → P3 → P4. Keep the AI-off path matching today's behavior (corpus is the
   regression guard). Do not push to `main` without explicit approval.

## Key files
- `backend/app/db.py` (add `list_symbols` over `_symbols`), `backend/app/main.py`
  (new `/api/asset-symbols`).
- `frontend/src/api.ts`, `frontend/src/data/{queryClient,hooks}.ts`.
- `frontend/src/lib/ask-intent.ts` → `lib/ask-intent/*` (+ `__tests__`).
- `frontend/src/components/ask/AskBar.tsx`.
- `frontend/vite.config.ts`, `frontend/package.json`.
