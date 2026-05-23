# DBHandover — Postgres asset catalogue

**Single source of truth for the database layer.** Read this top-to-bottom and
you know exactly where the DB stands. Read `CLAUDE.md` first for repo-wide rules
and `docs/landmines.md` → "Asset catalogue" for the gotchas.

- **One-line status:** A Supabase Postgres `assets` table holds the full Alpaca
  universe (base identity) plus per-source enrichment — **crypto fully enriched,
  the Nasdaq-100 enriched for stocks, the rest of the stock universe un-enriched
  by design.** Nothing in the app reads it yet; that's the next phase.

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
| `backend/app/db.py` | pg8000 (pure-Python, 3.14/Vercel-safe) access. Per-op connections from `DATABASE_URL`; `DbUnavailable` when unset. `bulk_upsert_assets`, `upsert_asset_enrichment` (crypto), `upsert_stock_enrichment` (FMP), `crypto_symbols`, `enriched_crypto_symbols`, `enriched_stock_symbols`. |
| `backend/app/alpaca/trading.py` | `get_all_assets_for_seed()` → full us_equity + crypto list; `_full_asset_dict` captures base fields. `_enum_value` extracts the wire value from Alpaca SDK enums (see landmines). |
| `backend/app/coingecko.py` | Crypto enrichment. Static **base-ticker → coingecko-id** map (BTC/USD, BTC/USDT … → `bitcoin`), Demo-key header when `COINGECKO_API_KEY` set, 429 backoff. |
| `backend/app/fmp.py` | Stock enrichment via FMP's **stable** `/profile` (single-symbol). Maps ~20 columns. |
| `backend/app/seed.py` | `run_seed(force, base)` — Alpaca base upsert + CoinGecko crypto enrich; `enrich_stocks(symbols, force)` — FMP stock enrich. Both resumable. |
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

# Stock enrich — explicit, budgeted symbol list (FMP free tier = 250/day).
curl -X POST "https://<render-url>/api/_dev/enrich-stocks?symbols=AAPL,MSFT,NVDA"
```

---

## Current state (seeded in prod)

- **Base:** 13,802 rows (13,729 us_equity + 73 crypto), clean enum values.
- **Crypto:** 73/73 enriched (CoinGecko), all columns validated.
- **Stocks:** the Nasdaq-100 (~101 securities incl. GOOGL/GOOG) enriched (FMP).
  The remaining ~13.6k us_equity rows are base-only by design.

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

## Deferred (next decisions, not yet built)

1. **Seeding strategy.** There is intentionally **no proactive backfill** — the
   stock seeder takes explicit symbols. Decide what/when to seed (S&P 500? whole
   exchanges? lazy on-demand? scheduled refresh?) and how to prioritise within
   the FMP 250/day cap. Also decide a staleness/refresh policy (there is no TTL
   anymore — `enriched_at` exists for visibility only).
2. **Use the data (app code).** `screen_assets` + `get_company_profile` tools in
   the Ask-anything set (`ai/tools_read.py` + `ai/tools.py`, executed in
   `ai/router.py`) so the bot screens from SQL; a catalogue/screener UI + a
   company card on Discover/Chart.
3. **pgvector RAG** — embed descriptions/news for "similar to X".

---

## History note

This replaces the original Phase-1 design (a lazy `company_profiles` cache
behind `GET /api/assets/{symbol}/profile`, FMP-only, 7-day TTL). That table,
endpoint, and `profiles.py` were removed in favour of the unified `assets`
catalogue — don't reintroduce them.
