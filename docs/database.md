# Asset catalogue (Postgres / Supabase)

Reference for the database layer. The main Postgres table is `assets`
(Supabase), holding the full Alpaca universe (base identity) plus per-source
enrichment. It powers the watchlist autocomplete, chart search, `/api/assets`,
and the AI bot's catalogue tools (`find_symbol`, `get_asset_profile`,
`screen_assets`). A second, tiny `app_settings` key/value table holds the
**maintenance** and **force_stop** switches read by `/api/status` (created by
`backend/sql/003_app_settings.sql`, run once; flip the relevant row in the
Supabase SQL editor — graceful maintenance auto-recovers, force_stop is a
terminal boot. Full command reference in that SQL file and CLAUDE.md
"Maintenance / force-stop switches"). A third table, `fxcm_instruments`, holds
FXCM instrument metadata (display name, type, currency, session, timezone,
underlying unit, search aliases) for the ~501 instruments on account 501 —
created by `backend/sql/004_fxcm_instruments.sql`, populated once via
`POST /api/_dev/seed-fxcm-instruments` (see below).

Companions: `CLAUDE.md` for repo-wide rules, `docs/landmines.md` →
"Asset catalogue / Postgres" for the hard-won gotchas, and
`backend/sql/002_assets.sql` for the authoritative DDL.

---

## Schema

Authoritative definition: **`backend/sql/002_assets.sql`** — run **once** in the
Supabase SQL editor (no auto-create). One row per Alpaca symbol; each row's
`asset_class` decides which enrichment source fills it — **sources never mix
within a row.**

| Group | Columns | Source |
| --- | --- | --- |
| Base identity | `symbol`, `alpaca_id`, `name`, `asset_class`, `exchange`, `status`, `tradable`, `marginable`, `shortable`, `fractionable`, `attributes[]`, `min_order_size`, `min_trade_increment`, `price_increment` | Alpaca (all rows) |
| Common enrichment | `description`, `website`, `logo_url`, `market_cap` | per `asset_class` |
| Stock-only | `sector`, `industry`, `country`, `city`, `state`, `ipo_date`, `isin`, `cik`, `is_etf`, `is_adr`, `is_fund`, `is_actively_trading`, `ceo`, `employees`, `phone`, `beta`, `dcf`, `dcf_diff` | FMP |
| Stock fundamentals | `pe_ratio`, `ps_ratio`, `pb_ratio`, `ev_to_ebitda`, `peg_ratio`, `gross_margin`, `operating_margin`, `net_margin`, `roe`, `roic`, `debt_to_equity`, `current_ratio`, `eps_diluted`, `book_value_per_share`, `free_cash_flow`, `revenue_growth_yoy`, `eps_growth_yoy`, `dividend_yield`, `payout_ratio`, `latest_fiscal_year`, `reported_currency`, `financials_annual` (JSONB, ≤5yr trend), `fundamentals_enriched_at` | FMP (annual) |
| Crypto-only | `coingecko_id`, `hashing_algorithm`, `genesis_date`, `categories[]`, `whitepaper_url`, `github_url`, `circulating_supply`, `total_supply`, `max_supply`, `market_cap_rank`, `ath_usd`, `ath_date`, `atl_usd`, `atl_date` | CoinGecko |
| Metadata | `seeded_at`, `enriched_at`, `enrichment_source` (`fmp` \| `coingecko`) | — |

`dcf`/`dcf_diff` aren't in FMP's stable profile (separate endpoint) — left null.
`market_cap` is **BIGINT** — bind integers, not floats, in queries.
The **Stock fundamentals** group was added directly in the Supabase SQL editor
(`ALTER TABLE assets ADD COLUMN …`), **not** via a tracked `.sql` — `002_assets.sql`
predates it, so re-creating the DB from that file alone misses these columns.
Margins/ratios/yield/growth are stored as **fractions** (0.21 = 21%);
`fundamentals_enriched_at` is a separate stamp from `enriched_at` so the
fundamentals backfill resumes independently of the profile enrichment.

---

## Code map

| File | Role |
| --- | --- |
| `backend/app/db.py` | pg8000 (pure-Python, 3.14/Vercel-safe) access. Per-op connections from `DATABASE_URL`; `DbUnavailable` when unset. Writes: `bulk_upsert_assets`, `upsert_asset_enrichment` (crypto), `upsert_stock_enrichment` (FMP), `upsert_fundamentals` (FMP annual), `upsert_fxcm_instruments`. Reads: `search_assets` (visibility-filtered), `get_asset`, `get_asset_profile`, `screen_assets`, `crypto_symbols`, `enriched_/unenriched_stock_symbols`, `enriched_crypto_symbols`, `fundamentals_enriched_/fundamentals_target_symbols`. Holds `CRYPTO_CATEGORY_MAP` (screen whitelist). |
| `backend/app/alpaca/trading.py` | `get_all_assets_for_seed()` → full us_equity + crypto list; `_full_asset_dict` captures base fields. `_enum_value` extracts the wire value from Alpaca SDK enums (see landmines). |
| `backend/app/coingecko.py` | Crypto enrichment. Static **base-ticker → coingecko-id** map (BTC/USD, BTC/USDT … → `bitcoin`), Demo-key header when `COINGECKO_API_KEY` set, 429 backoff. |
| `backend/app/fmp.py` | Stock enrichment via FMP's **stable** `/profile` (single-symbol). Maps ~20 columns; translates dot-class symbols to dash for the query (`BRK.B`→`BRK-B`). Also `map_fundamentals` off `income-statement`+`cash-flow-statement`+`ratios` (annual): derives margins/growth from the statements, pulls valuation/quality ratios with alias fallbacks (stable field names vary). |
| `backend/app/seed.py` | Onboarding: `run_seed(force, base)` — Alpaca base upsert + CoinGecko crypto enrich. Per-widget **refresh routines** (background daemon via `_start_background`): `refresh_profile_stocks`, `refresh_profile_crypto`, `refresh_fundamentals` (each `include_missing` to also onboard), plus aggregate `refresh_all_stocks` (profile+fundamentals) and `refresh_all_crypto`. `refresh_alpaca` re-pulls Alpaca base/trading status; `check_new_symbols` diffs Alpaca's live list against `db.all_symbols()` (read-only new-listing check). `enrich_stocks`/`enrich_fundamentals` remain as the per-symbol executors the refreshers loop over. |
| `backend/app/main.py` | Endpoints: `/api/assets` (search), `/api/assets/{symbol}` (both DB-backed w/ Alpaca fallback), and the dev seeders below. |
| `backend/app/ai/tools_read.py`, `ai/router.py` | The AI catalogue tools (`get_asset_profile`, `screen_assets`) — schemas + server-side execution. |

---

## Onboarding & refresh routines (dev endpoints)

Postgres :5432 is unreachable from the sandbox and the owner's laptop, so these
**only run from prod/Render.** All sit behind `require_configured`. There are two
concepts: **onboarding** (add NEW Alpaca rows + their first enrichment) and the
per-widget **refresh routines** (re-pull the DB values an already-enriched card
shows). On the paid FMP **Starter** tier (single-symbol, 300/min, no daily cap),
real throughput is ~100/min — a full stock pass is ~1.5–2.5 hr.

### Onboarding & Alpaca status

```bash
# Base identity for the whole Alpaca universe (~14 min) + CoinGecko crypto enrich.
curl -X POST "https://<render-url>/api/_dev/seed-assets"
# Crypto enrich only — skip the slow base upsert (~45s). &force=true re-does all.
curl -X POST "https://<render-url>/api/_dev/seed-assets?base=false"

# Refresh Alpaca BASE IDENTITY + TRADING STATUS for every row (tradable,
# active/inactive on delisting, marginable/shortable/fractionable, has_options,
# crypto increments) and onboard new listings. Background (the base upsert is
# ~14 min), so it returns immediately. This is the only routine that updates the
# Alpaca-sourced fields — the FMP/CoinGecko refreshers don't touch them.
curl -X POST "https://<render-url>/api/_dev/refresh-alpaca"

# Fast READ-ONLY check for new listings / IPOs: Alpaca symbols not yet in the DB.
# Seconds (no upsert). GET. Onboard what it finds with refresh-alpaca, then
# refresh-all-stocks?include_missing=true / refresh-all-crypto to enrich them.
curl "https://<render-url>/api/_dev/new-symbols"
```

Delistings need no destructive prune: `refresh-alpaca` flips the row's `tradable`
to false, and the search **visibility rule** (`tradable = true`) then drops it
from discovery automatically.

### Refresh routines — one per widget/card (fire-and-forget)

Each routine **completes one card**: it re-fetches every DB field that widget
shows, **only for rows already enriched for that card**. All run in a background
daemon thread on Render and **return immediately** (`{"status":"started",…}`) —
fire once and disconnect; a second call of the same routine while it's running
returns `already_running`. `?include_missing=true` additionally **onboards** rows
that card hasn't enriched yet (e.g. a newly listed stock).

| Routine | Card it completes | Source | Curl |
| --- | --- | --- | --- |
| `refresh-profile-stocks` | **Profile** (stocks) | FMP `/profile` | `curl -X POST "https://<render-url>/api/_dev/refresh-profile-stocks"` |
| `refresh-profile-crypto` | **Profile** (crypto) | CoinGecko | `curl -X POST "https://<render-url>/api/_dev/refresh-profile-crypto"` |
| `refresh-fundamentals` | **Fundamentals** (stocks) | FMP statements | `curl -X POST "https://<render-url>/api/_dev/refresh-fundamentals"` |

**Aggregate flows** (supersets — run everything for a silo in one call, including
what the per-card routines above cover):

| Flow | Covers | Curl |
| --- | --- | --- |
| `refresh-all-stocks` | Profile **+** Fundamentals (FMP) | `curl -X POST "https://<render-url>/api/_dev/refresh-all-stocks"` |
| `refresh-all-crypto` | all crypto enrichment (CoinGecko) | `curl -X POST "https://<render-url>/api/_dev/refresh-all-crypto"` |

`refresh-all-crypto` matches `refresh-profile-crypto` today (Profile is crypto's
only enrichment source) and also picks up un-enriched crypto. Onboard new
instruments instead of just refreshing: add `?include_missing=true` (the
stocks/fundamentals routines and `refresh-all-stocks`). A sensible **monthly**
cadence is just the two aggregate flows (no built-in scheduler — trigger manually
or via an external cron).

For current row counts and coverage, run the verification queries below rather
than trusting a number in this doc (it would drift).

### FXCM instruments (one-time, no refresh)

Populates `fxcm_instruments` from `endpoints.fxcorporate.com/symbol/data`
cross-referenced against the bridge's account-501 instrument list. Synchronous
(small data). Run once after the table is created.

```bash
curl -X POST "https://<render-url>/api/_dev/seed-fxcm-instruments"
# {"upserted": 498, "skipped_no_metadata": 3, "account_instruments": 501}
```

---

## Visibility rule (search = enriched only)

`db.search_assets` (the single search brain behind the watchlist autocomplete,
chart search, and the bot's `find_symbol`) returns only **tradable + enriched**
rows (`enrichment_source IS NOT NULL`). So the un-enriched long tail (SPAC
shells, warrants, dead OTC tickers) is hidden from discovery, and enrichment
status doubles as the curation filter — enrich a symbol and it becomes
searchable, with no code change. This is **search-only**: `get_asset` /
`get_asset_profile` (direct resolution, with Alpaca fallback) and anything the
user already references (positions, watchlist, open charts) are never filtered,
so existing holdings always render. `screen_assets` is also visibility-filtered.
To widen the visible universe, enrich more rows; to show everything, drop the
one clause.

---

## Reads & AI catalogue tools

- **`search_assets(query, asset_class, limit)`** — symbol/name search ranked by
  market cap, visibility-filtered. Backs `/api/assets`, watchlist + chart
  search, and the bot's `find_symbol`.
- **`get_asset(symbol)`** — 12-column identity row (direct resolution, Alpaca
  fallback). Backs `/api/assets/{symbol}`.
- **`get_asset_profile(symbol)`** — full single-symbol profile (all base +
  enrichment columns **including the stock-fundamentals group**, NULLs dropped;
  `financials_annual` JSON-parsed). Direct resolution, not visibility-filtered.
  Backs `/api/asset-profile/{symbol}` (Workspace **Profile** + **Fundamentals**
  widgets) and the AI tool of the same name (both surfaces).
- **`market_cap_map()`** — `{symbol: market_cap}` for the visible US-equity
  universe (`tradable` + enriched + has a cap). Used only by `calendar_fmp` to
  curate/rank the earnings calendar (see `docs/landmines.md` → "Earnings /
  economic calendars"); raises `DbUnavailable` like the other readers, which the
  caller swallows into an empty map (the calendar then falls back to the user's
  own symbols). The catalogue is read here as a cap lookup — calendar rows are
  never stored.
- **`screen_assets(...)`** — structured, parameterised, visibility-filtered
  filter returning a count + top-N envelope
  (`{total_matches, returned, has_more, sorted_by, filters_applied, results}`).
  - Stock filters: `sector` (11-GICS enum), `industry` (partial), `asset_type`
    (`stock`/`etf`/`adr`/`any`, default `stock` — excludes ETFs/funds),
    `beta`, `exchange`, `ipo_after/before`, `market_cap` range, plus annual
    fundamentals: `pe_min/max`, `dividend_yield_min`, `net_margin_min`,
    `roe_min`, `revenue_growth_min` (fractions, e.g. 0.2 = 20%) and the matching
    `pe_*`/`dividend_yield_desc`/`net_margin_desc`/`roe_desc`/`revenue_growth_desc`
    sorts.
  - Crypto filters: curated `category` (keys in `db.CRYPTO_CATEGORY_MAP` →
    raw CoinGecko tags); results collapse to one row per base coin (prefer
    `/USD`).
  - **Security:** the model supplies values only. `_screen_filters` validates
    enums, clamps numerics (≥0, rejects NaN/inf), floors `ipo_date` at 1980,
    caps `limit` at 50, and binds every value as a `%s` param into a fixed
    template — no model-shaped SQL. Keep the schema enums in `ai/tools_read.py`
    in sync with `_SCREEN_SECTORS` / `_SCREEN_EXCHANGES` / `CRYPTO_CATEGORY_MAP`.
  - Exposed to both AI surfaces via `READ_TOOLS` (keep read-before-draw order).

---

## Data-quality notes (these shape the code — don't "fix" them blind)

- **ETFs poison stock `sector`.** FMP labels ETFs `sector="Financial Services"`
  / `industry="Asset Management*"` (and they list on ARCA). They were ~1/3 of the
  enriched universe at last audit. `screen_assets` defaults `asset_type=stock`
  (excludes `is_etf`/`is_fund`) so sector screens aren't polluted; ETF
  `market_cap` is AUM, not company cap.
- **Crypto `categories` is mostly noise** (~half are "X Ecosystem/Native" tags;
  the loudest are index / VC-portfolio membership). Never expose the raw array
  for filtering — only the curated keys in `db.CRYPTO_CATEGORY_MAP`.
- **Crypto quote-pair duplication.** Each base coin appears against several quote
  currencies (BTC/USD, BTC/USDC, BTC/USDT) with identical enrichment, so screens
  dedupe to one row per base coin.
- **Dot-class symbols** (`BRK.B`, `BF.B`) need a dash for FMP (`BRK-B`);
  `fmp.fetch_profile` translates them. Un-translated, FMP returns `[]` and the
  row never enriches.
- **`ipo_date` has epoch garbage** (SPAC-merged names show 1970-01-01);
  `screen_assets` floors any IPO filter at 1980.
- **`has_options` has no variance** while the backfill runs options-listed names
  first — don't use it as a filter until enrichment extends past that set.
- **`market_cap` is BIGINT** — bind ints (a float like `1e10` → `10000000000.0`
  is rejected with `22P02`).

---

## Constraints

| Limit | Detail |
| --- | --- |
| Postgres :5432 | Reachable **only from prod** (Render/Vercel). Not the sandbox, not the laptop — verify via the Supabase SQL editor or deployed seeders. |
| FMP (Starter, paid) | **Single-symbol, 300/min** (no 250/day free cap). No comma-batch (`[]`); `profile-bulk` + `sp500-constituent` are 402 (need a higher tier). |
| CoinGecko | Keyless ~5–15/min (429s under load). Demo key → ~30/min, 10k/mo. |
| Supabase free | 500MB / 2 connections — fine at this scale (per-op connections respect the 2-conn cap). |

See `docs/landmines.md` → "Asset catalogue / Postgres" for the full debugging
log behind these (enum-`.value`, pg8000-not-psycopg, Yahoo quoteSummary 406,
the dual-requirements trap, etc.).

---

## Secrets (set in Render + Vercel env, never commit)

- **`DATABASE_URL`** — Supabase **Session pooler** URI (IPv4), not Direct/IPv6
  or the Transaction pooler. Alphanumeric password (else URL-encode). Optional
  `DATABASE_SSL_INSECURE=true` only if the pooler trips cert verification.
- **`FMP_API_KEY`** — Financial Modeling Prep key (stable `/profile`).
- **`COINGECKO_API_KEY`** — CoinGecko **Demo** key (optional; unset = keyless).

See `backend/.env.example` for the full env list. ⚠️ The DB password, FMP key,
and CoinGecko key have all been pasted in chat at some point — **rotate them**
before this carries anything real.

---

## Verification

```sql
-- enum values clean (no AssetClass.* / AssetExchange.*)
SELECT asset_class, exchange, status, COUNT(*) FROM assets
GROUP BY asset_class, exchange, status ORDER BY COUNT(*) DESC;

-- current coverage (replaces any hard-coded count)
SELECT asset_class, enrichment_source, COUNT(*) FROM assets
GROUP BY asset_class, enrichment_source ORDER BY 1, 3 DESC;

-- crypto fully enriched (expect 0)
SELECT COUNT(*) FROM assets WHERE asset_class='crypto' AND enrichment_source IS NULL;

-- stock sector spread (note: ETFs land in Financial Services — see notes)
SELECT sector, COUNT(*) FILTER (WHERE is_etf IS NOT TRUE) AS companies,
       COUNT(*) FILTER (WHERE is_etf IS TRUE) AS etfs
FROM assets WHERE enrichment_source='fmp' GROUP BY sector ORDER BY 2 DESC;
```

---

## Roadmap (parked — deferred by decision, May 2026)

1. **Refresh policy.** No TTL — `enriched_at` exists for visibility only; the
   *backfill* mechanism exists, an automated *refresh schedule* does not. Now
   **feasible** on the paid Starter tier (a full re-enrich is ~1.5–2.5 h, well
   under the 300/min ceiling) — parked by choice, not cost. market_cap/beta/IPO
   drift slowly and only feed screening buckets (not trades), so staleness is
   low-stakes; revisit a scheduled top-N (or full) refresh if it ever bites.
2. **"Similar to X."** Two ways: a cheap **structured peers** query (same
   sector/industry, nearest market-cap/beta — pure SQL, no new infra) or full
   **pgvector** semantic search over the stored FMP/CoinGecko descriptions (adds
   an embedding provider + key + backfill). Parked; prefer the structured version
   first if revived.
3. **Catalogue-grounded market summary.** Parked — the catalogue is *static*
   (no price/time-series), so it can't surface "what moved today"; the Discover
   summary already has movers + news. Marginal value.
4. **Catalogue/screener UI** — the Workspace **Profile** widget
   (`components/AssetProfile.tsx`, off `/api/asset-profile`) consumes
   `get_asset_profile`, and a **Fundamentals** widget (`components/Fundamentals.tsx`,
   same endpoint) now surfaces the FMP annual fundamentals; `screen_assets` also
   gained stock fundamentals filters/sorts (P/E, dividend yield, net margin, ROE,
   revenue growth). Still parked: a dedicated `screen_assets`-backed **screener**
   surface and any Discover/Chart company card.

History: this catalogue replaced an earlier lazy `company_profiles` cache
(FMP-only, 7-day TTL, behind `GET /api/assets/{symbol}/profile`). That table,
endpoint, and `profiles.py` were removed — don't reintroduce them.
