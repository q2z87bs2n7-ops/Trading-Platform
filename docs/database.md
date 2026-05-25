# Asset catalogue (Postgres / Supabase)

Reference for the database layer. The platform has **one** Postgres table,
`assets` (Supabase), holding the full Alpaca universe (base identity) plus
per-source enrichment. It powers the watchlist autocomplete, chart search,
`/api/assets`, and the AI bot's catalogue tools (`find_symbol`,
`get_asset_profile`, `screen_assets`).

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
| Crypto-only | `coingecko_id`, `hashing_algorithm`, `genesis_date`, `categories[]`, `whitepaper_url`, `github_url`, `circulating_supply`, `total_supply`, `max_supply`, `market_cap_rank`, `ath_usd`, `ath_date`, `atl_usd`, `atl_date` | CoinGecko |
| Metadata | `seeded_at`, `enriched_at`, `enrichment_source` (`fmp` \| `coingecko`) | — |

`dcf`/`dcf_diff` aren't in FMP's stable profile (separate endpoint) — left null.
`market_cap` is **BIGINT** — bind integers, not floats, in queries.

---

## Code map

| File | Role |
| --- | --- |
| `backend/app/db.py` | pg8000 (pure-Python, 3.14/Vercel-safe) access. Per-op connections from `DATABASE_URL`; `DbUnavailable` when unset. Writes: `bulk_upsert_assets`, `upsert_asset_enrichment` (crypto), `upsert_stock_enrichment` (FMP). Reads: `search_assets` (visibility-filtered), `get_asset`, `get_asset_profile`, `screen_assets`, `crypto_symbols`, `enriched_/unenriched_stock_symbols`, `enriched_crypto_symbols`. Holds `CRYPTO_CATEGORY_MAP` (screen whitelist). |
| `backend/app/alpaca/trading.py` | `get_all_assets_for_seed()` → full us_equity + crypto list; `_full_asset_dict` captures base fields. `_enum_value` extracts the wire value from Alpaca SDK enums (see landmines). |
| `backend/app/coingecko.py` | Crypto enrichment. Static **base-ticker → coingecko-id** map (BTC/USD, BTC/USDT … → `bitcoin`), Demo-key header when `COINGECKO_API_KEY` set, 429 backoff. |
| `backend/app/fmp.py` | Stock enrichment via FMP's **stable** `/profile` (single-symbol). Maps ~20 columns; translates dot-class symbols to dash for the query (`BRK.B`→`BRK-B`). |
| `backend/app/seed.py` | `run_seed(force, base)` — Alpaca base upsert + CoinGecko crypto enrich; `enrich_stocks(symbols, limit, force)` — FMP stock enrich (explicit list or next `limit` un-enriched). Both resumable. |
| `backend/app/main.py` | Endpoints: `/api/assets` (search), `/api/assets/{symbol}` (both DB-backed w/ Alpaca fallback), and the dev seeders below. |
| `backend/app/ai/tools_read.py`, `ai/router.py` | The AI catalogue tools (`get_asset_profile`, `screen_assets`) — schemas + server-side execution. |

---

## Populating the catalogue (seeders)

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

We're on the paid FMP **Starter** tier: single-symbol, 300/min (no 250/day free
cap). It enriches the whole universe in repeated `?limit=` chunks (~1.5–2.5 hr
total — sequential per-symbol latency, not the rate ceiling, is the floor).

For current row counts and coverage, run the verification queries below rather
than trusting a number in this doc (it would drift).

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
  enrichment columns, NULLs dropped). Direct resolution, not visibility-filtered.
  Backs `/api/asset-profile/{symbol}` (Workspace **Profile** widget) and the AI
  tool of the same name (both surfaces).
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
    `beta`, `exchange`, `ipo_after/before`, `market_cap` range.
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
   (`components/AssetProfile.tsx`, off `/api/asset-profile`) now consumes
   `get_asset_profile`. Still parked: a `screen_assets`-backed **screener**
   surface and any Discover/Chart company card.

History: this catalogue replaced an earlier lazy `company_profiles` cache
(FMP-only, 7-day TTL, behind `GET /api/assets/{symbol}/profile`). That table,
endpoint, and `profiles.py` were removed — don't reintroduce them.
