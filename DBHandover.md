# DBHandover — Postgres asset catalogue

**Single source of truth for the database layer.** Read this top-to-bottom and
you know exactly where the DB stands. Read `CLAUDE.md` first for repo-wide rules
and `docs/landmines.md` → "Asset catalogue" for the gotchas.

- **One-line status:** A Supabase Postgres `assets` table holds the full Alpaca
  universe (base identity) plus per-source enrichment — **crypto fully enriched;
  stock universe enrichment backfilling via FMP (Nasdaq-100 + ongoing).** The
  catalogue now powers live app features: the watchlist autocomplete, chart
  search, and the bot's `find_symbol` all read `db.search_assets`, which only
  surfaces enriched + tradable rows (the **visibility rule**).

---

## Goal

Give the platform a structured, queryable catalogue of every tradable
instrument so the **Ask-anything bot** can screen/look up assets from SQL
(fast, cheap, controllable) instead of `web_search`, and so a future
catalogue/screener UI has data to render. Longer arc: semantic search
(pgvector) over descriptions/news.

---

## Schema — one `assets` table

Created by `backend/sql/002_assets.sql`, run **once** in the Supabase SQL editor
(no auto-create). One row per Alpaca symbol; each row's `asset_class` decides
which enrichment source fills it — **sources never mix within a row.**

| Group | Columns | Source |
| --- | --- | --- |
| Base identity | `symbol`, `alpaca_id`, `name`, `asset_class`, `exchange`, `status`, `tradable`, `marginable`, `shortable`, `fractionable`, `attributes[]`, `min_order_size`, `min_trade_increment`, `price_increment` | Alpaca (all rows) |
| Common enrichment | `description`, `website`, `logo_url`, `market_cap` | per `asset_class` |
| Stock-only | `sector`, `industry`, `country`, `city`, `state`, `ipo_date`, `isin`, `cik`, `is_etf`, `is_adr`, `is_fund`, `is_actively_trading`, `ceo`, `employees`, `phone`, `beta`, `dcf`, `dcf_diff` | FMP |
| Crypto-only | `coingecko_id`, `hashing_algorithm`, `genesis_date`, `categories[]`, `whitepaper_url`, `github_url`, `circulating_supply`, `total_supply`, `max_supply`, `market_cap_rank`, `ath_usd`, `ath_date`, `atl_usd`, `atl_date` | CoinGecko |
| Metadata | `seeded_at`, `enriched_at`, `enrichment_source` (`fmp` \| `coingecko`) | — |

`dcf`/`dcf_diff` aren't in FMP's stable profile (separate endpoint) — left null.

---

## Data sources & code map

| File | Role |
| --- | --- |
| `backend/app/db.py` | pg8000 (pure-Python, 3.14/Vercel-safe) access. Per-op connections from `DATABASE_URL`; `DbUnavailable` when unset. Writes: `bulk_upsert_assets`, `upsert_asset_enrichment` (crypto), `upsert_stock_enrichment` (FMP). Reads: `search_assets` (visibility-filtered), `get_asset`, `crypto_symbols`, `enriched_/unenriched_stock_symbols`, `enriched_crypto_symbols`. |
| `backend/app/alpaca/trading.py` | `get_all_assets_for_seed()` → full us_equity + crypto list; `_full_asset_dict` captures base fields. `_enum_value` extracts the wire value from Alpaca SDK enums (see landmines). |
| `backend/app/coingecko.py` | Crypto enrichment. Static **base-ticker → coingecko-id** map (BTC/USD, BTC/USDT … → `bitcoin`), Demo-key header when `COINGECKO_API_KEY` set, 429 backoff. |
| `backend/app/fmp.py` | Stock enrichment via FMP's **stable** `/profile` (single-symbol). Maps ~20 columns. |
| `backend/app/seed.py` | `run_seed(force, base)` — Alpaca base upsert + CoinGecko crypto enrich; `enrich_stocks(symbols, limit, force)` — FMP stock enrich (explicit list or next `limit` un-enriched). Both resumable. |
| `backend/app/main.py` | Endpoints: `/api/assets` (search), `/api/assets/{symbol}` (both DB-backed w/ Alpaca fallback), and the dev seeders below. |
| `backend/sql/002_assets.sql` | The `assets` schema + indexes. Drops the legacy `company_profiles` table. |

---

## Dev seeders (Render-only)

Postgres :5432 is unreachable from the sandbox and the owner's laptop, so
**seeding only runs from prod/Render.** Both endpoints sit behind
`require_configured` and are idempotent + resumable.

```bash
# Base (Alpaca) + crypto (CoinGecko). ~15 min (base upsert dominates).
curl -X POST "https://<render-url>/api/_dev/seed-assets"

# Crypto enrich only — skips the slow base upsert (~45s). Add &force=true to
# re-enrich rows already done.
curl -X POST "https://<render-url>/api/_dev/seed-assets?base=false"

# Stock enrich — explicit symbol list...
curl -X POST "https://<render-url>/api/_dev/enrich-stocks?symbols=AAPL,MSFT,NVDA"
# ...or backfill the next N un-enriched stocks (options-listed first), repeat.
curl -X POST "https://<render-url>/api/_dev/enrich-stocks?limit=2500"
```

FMP free tier = single-symbol, 250/day. A paid **Starter** tier (300/min, same
key) enriches the whole universe in repeated `?limit=` chunks (~1.5–2.5 hr total
— sequential per-symbol latency, not the rate ceiling, is the floor).

---

## Current state (seeded in prod)

- **Base:** 13,802 rows (13,729 us_equity + 73 crypto), clean enum values.
- **Crypto:** 73/73 enriched (CoinGecko), all columns validated.
- **Stocks:** universe enrichment **backfilling** (Nasdaq-100 done first, then
  options-listed names via `?limit=` chunks). Un-enriched rows stay base-only
  and are hidden from search by the visibility rule until enriched.

---

## Constraints (the binding ones)

| Limit | Detail |
| --- | --- |
| Postgres :5432 | Reachable **only from prod** (Render/Vercel). Not the sandbox, not the laptop. |
| FMP free tier | **Single-symbol, 250 calls/day.** No comma-batch (`[]`); `profile-bulk` + `sp500-constituent` are 402 (paid). |
| CoinGecko | Keyless ~5–15/min (429s under load). Demo key → ~30/min, 10k/mo. |
| Supabase free | 500MB / 2 connections — irrelevant at this scale (the per-op connection pattern respects the 2-conn cap). |

---

## Visibility rule (search = enriched only)

`db.search_assets` (the single search brain behind the watchlist autocomplete,
chart search, and the bot's `find_symbol`) returns only **tradable + enriched**
rows (`enrichment_source IS NOT NULL`). So the un-enriched long tail (SPAC
shells, warrants, dead OTC tickers) is hidden from discovery, and enrichment
status doubles as the curation filter — enrich a symbol and it becomes
searchable, with no code change. This is **search-only**: `get_asset` (direct
resolution, with Alpaca fallback) and anything the user already references
(positions, watchlist, open charts) are never filtered, so existing holdings
always render. To widen the visible universe, enrich more rows; to show
everything, drop the one clause.

---

## Secrets (set in Render + Vercel env, never commit)

- **`DATABASE_URL`** — Supabase **Session pooler** URI (IPv4):
  `postgresql://postgres.<ref>:<PASSWORD>@aws-1-...pooler.supabase.com:5432/postgres`.
  Not Direct/IPv6 or the Transaction pooler. Alphanumeric password (else
  URL-encode). Optional `DATABASE_SSL_INSECURE=true` only if the pooler trips
  cert verification.
- **`FMP_API_KEY`** — free Financial Modeling Prep key.
- **`COINGECKO_API_KEY`** — free CoinGecko **Demo** key (optional; unset =
  keyless).
- ⚠️ The DB password, FMP key, and CoinGecko key have all been pasted in chat at
  some point — **rotate them** before this carries anything real.

---

## Verification

```sql
-- enum values clean (no AssetClass.* / AssetExchange.*)
SELECT asset_class, exchange, status, COUNT(*) FROM assets
GROUP BY asset_class, exchange, status ORDER BY COUNT(*) DESC;

-- crypto fully enriched
SELECT COUNT(*) FROM assets WHERE asset_class='crypto' AND enrichment_source IS NULL;  -- 0

-- stock coverage + sector spread
SELECT sector, COUNT(*) FROM assets WHERE enrichment_source='fmp'
GROUP BY sector ORDER BY COUNT(*) DESC;
```

---

## Shipped since the catalogue landed

- **Search is DB-backed and visibility-filtered.** `db.search_assets` (ranked by
  market cap, name-searchable, enriched + tradable only) powers `/api/assets`,
  the watchlist autocomplete, the chart-tab search (desktop box + phone sheet),
  and the bot's `find_symbol`. `get_asset` (`/api/assets/{symbol}`) is DB-backed
  too (clean enum values, sector/logo/market_cap).
- **Stock backfill path** — `enrich-stocks?limit=N` (resumable, options-listed
  first); pairs with a paid FMP tier to enrich the universe.

## Deferred (next decisions, not yet built)

1. **Refresh policy.** No TTL — `enriched_at` exists for visibility only. Decide
   when/whether to re-enrich stale rows and pick up new listings (the seeding
   *backfill* mechanism exists; an automated *refresh schedule* does not).
2. **`screen_assets` tool** — a structured catalogue filter (sector / industry /
   market-cap range / category) in the Ask-anything set (`ai/tools_read.py` +
   `ai/tools.py`, executed in `ai/router.py`) so the bot screens from SQL, plus
   a catalogue/screener UI + company card on Discover/Chart. **Designed & data-
   audited — see "Research" below.**
3. **pgvector RAG** — embed descriptions/news for "similar to X".

---

## Research — `screen_assets` & DB×bot opportunities (data-grounded)

A data audit (live DB counts 2026-05-23; 88-symbol FMP profile sample mirroring
`map_stock_enrichment`; CoinGecko sample; screener-design literature review)
behind the deferred `screen_assets` work. **No code written yet** — this is the
spec a later session executes.

### Headline findings (ground these, don't re-assume)

- **ETFs poison stock `sector`.** 1,532 of 4,822 enriched stocks are ETFs, and
  **1,522 are mislabelled `sector="Financial Services"`** by FMP (so the raw
  "Financial Services" bucket is 2,026 but only ~504 are real fin-services
  companies). Every sector filter MUST separate ETFs via `is_etf`. ETF
  `market_cap` is AUM, not company cap; ETFs cluster into the `industry`
  "Asset Management*" rows (~1,591) and the ARCA exchange (918).
- **Crypto `categories` is 54% noise.** 189 distinct tags across 36 base coins;
  **103 are "X Ecosystem/Native" tags** and the loudest are index/VC-portfolio
  membership ("Coinbase 50 Index" 51, "GMCI Index" 50, "a16z Portfolio" 16).
  Useless raw → a **curated whitelist** is mandatory.
- **`has_options` has zero variance** (4,822/4,822 — backfill does options-listed
  first). Do NOT expose it as a filter until enrichment extends past the options
  universe.
- **Dot-class symbols are un-enriched** (`BRK.A`/`BRK.B`/`BF.B` all
  `enrichment_source=null`) — FMP's stable profile expects `BRK-B`, not `BRK.B`,
  so the single-symbol fetch returns `[]`. Coverage gap. (`SPY` is also
  un-enriched as of the audit — alphabetical backfill hasn't reached "S"; that
  one is transient.)
- **`ipo_date` has 107 pre-1980 rows incl. epoch garbage** (e.g. SPAC-merged
  `DJT` = 1970-01-02). Clamp to ≥1980 before any "recent IPO" filter (574 rows
  are ≥2023).

### Screenable fields (coverage of the 4,822 enriched stocks / 73 crypto rows)

- **Stocks — strong:** `market_cap` 100% (micro<300M 1,443 / small 1,367 / mid
  1,111 / large 837 / mega>200B 64), `beta` 100%, `sector` 99.9% (11 clean GICS
  values, *after* ETF separation), `ipo_date` 99.96% (clamp garbage),
  `is_etf`/`is_adr`/`is_fund` 100% non-null (1,532 / 208 / 21 true), `country`
  99.9%, `exchange` (NASDAQ 2,113 / NYSE 1,425 / ARCA 918 / BATS 224 / OTC 73 /
  AMEX 69). **Weak/skip:** `employees` 68%, `state` ~84%, `has_options` (no
  variance).
- **Crypto — strong:** `market_cap` / `market_cap_rank` 100%, `categories` 100%
  present (whitelist only). **Profile-only:** `max_supply` 66%,
  `whitepaper_url`/`github_url` 86%/84%. **Too sparse:** `genesis_date` /
  `hashing_algorithm` 27%. **Quote-pair duplication:** 73 rows = 36 coins × ~2
  pairs carrying identical categories — a screener MUST collapse to one row per
  base coin (prefer `/USD`).
- Useful crypto themes that survive the noise: Smart Contract Platform, Layer 1,
  DeFi, DEX/AMM, Meme/Dog-Themed, Stablecoin, AI, RWA, DePIN, Governance,
  PoW/PoS, Yield Farming, Exchange Tokens, Bitcoin Fork.

### `screen_assets` spec

- **Filters (data-supported):** common — `asset_class` (omit → active silo),
  `market_cap_min`/`max` (USD), `limit` (default 20, hard cap 50), `sort_by`
  (default `market_cap_desc`). Stocks — `sector` (enum, 11 GICS),
  **`asset_type` enum `["stock","etf","adr","any"]`, default `stock`** (this is
  the ETF fix), `beta_min`/`max`, `ipo_after`/`before` (clamp ≥1980), `exchange`
  (enum), `industry` (optional free-text validated server-side vs `DISTINCT
  industry` — 153 values, too many for a schema enum). Crypto — `category` (enum
  of ~15 curated theme keys mapped server-side to raw CoinGecko tags, e.g.
  `meme`→{Meme,Dog-Themed,4chan-Themed}); index/VC/ecosystem tags never exposed.
- **Response shape (token-economy):** count + top-N on a relevance key, lean
  columns, explicit overflow — `{total_matches, returned, has_more, sorted_by,
  filters_applied, results[]}`. ~6 cols/row × 20 rows ≈ 1–2k tokens (vs ~50k for
  a full dump). Crypto collapses to one row per base coin. Over-broad → add
  `bucket_counts` (by sector / cap tier). Empty → `suggestion` naming the
  too-tight filter + valid values.
- **Surfaces:** append to `ai/tools_read.py` `READ_TOOLS` (END, before
  `DRAW_TOOLS`) + `READ_TOOL_NAMES` → auto-exposed to **both** ChartBot (`TOOLS`)
  and Ask-anything (`read_only_tools()`), routed backend via `is_read_tool`,
  preserving read-before-draw. The teal regex parser needs no change (screening
  queries already fall through to `fallback` → `/api/ai/ask`). Adding any tool
  forces a one-time prefix-cache re-warm (tools precede the system breakpoint) —
  acceptable; the "ordering is load-bearing" rule is about not *reordering*
  existing tools, which appending doesn't do.
- **Prompt guidance:** teach the find/screen/profile boundary — `find_symbol`
  = resolve a *known* name/ticker; `screen_assets` = filter a *set* by
  attributes (state it screens only the curated/enriched universe and excludes
  ETFs unless `asset_type` says otherwise); each with a "do NOT use when…" line.
- **Security (parameterized-only):** model supplies values, never SQL. Validate
  enums against the known set, coerce+clamp numerics (≥0, reject NaN/inf) and
  dates (≥1980), cap `limit` at 50, assemble WHERE from a fixed whitelist with
  pg8000 placeholders, keep the visibility rule. Avoids the LangChain/LlamaIndex
  P2SQL classes (CVE-2025-1793) that came from letting the model shape query
  *structure*.

### Broader DB×bot opportunities (ranked value × effort)

1. **`get_asset_profile` tool — highest value / lowest effort.** `db.get_asset`
   returns only 12 search cols today; a full-row read answers "what
   sector/industry/CEO/IPO date is X", "BTC max supply / ATH / rank". One indexed
   lookup, near-zero tokens, very high hit-rate. **Ship first** (cheaper than
   `screen_assets`).
2. **`screen_assets`** — high / medium (the anchor above).
3. **Catalogue-grounded comparisons** — med-high / low; emergent from #1 +
   prompt ("compare NVDA vs AMD fundamentals" = two profile reads).
4. **Catalogue-driven watchlist suggestions** — med / low; emergent from #2 +
   existing `add_to_watchlist` (tradable-verified names vs model guesses).
5. **Catalogue-grounded AI market summary** — med / med.
6. **pgvector semantic search ("coins like Chainlink")** — high / high; defer.
7. **Refresh/freshness policy** — low-med / low; already deferred (#1 above).

### Phased plan (later coding session)

- **Phase 0 (hygiene, no tool):** build the crypto category whitelist dict from
  this audit; optional `fmp.fetch_profile` dash-symbol special-case
  (`BRK.B`→`BRK-B`) to close the dot-class gap; continue stock backfill toward
  ~6k so `SPY` et al. become searchable; ETF policy handled in-tool via
  `asset_type` (no migration).
- **Phase 1:** `get_asset_profile` (full-row `db` read + tool + dispatch +
  one prompt line). Smallest shippable win.
- **Phase 2:** `screen_assets` (parameterized builder, validation/clamping,
  base-coin dedupe, response envelope, schema, prompt guidance) → both surfaces.
- **Phase 3 (prompt-only):** comparisons + watchlist suggestions; optional
  Discover screener UI / company card.
- **Phase 4 (deferred):** pgvector semantic similarity; refresh schedule.

**Token economy:** screening/profile queries today fall to `/api/ai/ask` where
the bot guesses from training data or burns a `web_search` (multi-k tokens +
latency, 400s if the org hasn't enabled it). These tools replace that with one
deterministic ~1–2k-token call grounded in the *tradable* universe — est. 1–2
fewer `web_search` round-trips per query, plus better accuracy.

> ⚠️ The `FMP_API_KEY` used for the sampling is a live paid key that was pasted
> in chat during this research — rotate it (per "Secrets" above).

---

## History note

This replaces the original Phase-1 design (a lazy `company_profiles` cache
behind `GET /api/assets/{symbol}/profile`, FMP-only, 7-day TTL). That table,
endpoint, and `profiles.py` were removed in favour of the unified `assets`
catalogue — don't reintroduce them.
