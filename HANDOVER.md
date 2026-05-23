# Handover — Postgres + Company Catalogue (Phase 1)

**Single source of truth for this branch.** Read this top-to-bottom and you
know exactly where things stand. Read `CLAUDE.md` first for repo-wide rules.

- **Branch:** `claude/alpacas-asset-api-catalogue-noWg1`
- **VERSION:** 0.41.6
- **One-line status:** Phase 1 code is written and committed, but **NOT yet
  verified end-to-end through the actual code path** (DB write + provider
  fetch). The blockers are environmental, not code — see "Why nothing is
  verified."

---

## Goal

Add Postgres (Supabase) persistence to the platform, starting with a
**company-info enrichment cache** behind `GET /api/assets/{symbol}/profile`.
Motivation: learning SQL, opening up product options, better client experience,
and (later) DB-backed tools for the Ask-anything bot. Longer arc: a
browsable/filterable asset catalogue + screener, then semantic search (pgvector).

`CLAUDE.md` already earmarks "Backlogged Postgres (Supabase/Neon)" as the
persistence layer — this is that work starting.

---

## What's implemented (committed on this branch)

| File | Role |
| --- | --- |
| `backend/app/db.py` | pg8000 (pure-Python, 3.14/Vercel-safe) Postgres layer. Per-operation connections from `DATABASE_URL`. `DbUnavailable` when unset/unreachable. `fetch_profile` / `upsert_profile`; `company_profiles` table auto-created via `_ensure_schema` on first use. |
| `backend/app/profiles.py` | `get_company_profile(symbol)` — DB-cached write-through (7-day TTL). **Provider: Financial Modeling Prep only** (`stable/profile`); requires `FMP_API_KEY`. Raises `ProfileNotFound` for unknown symbols, `ProfileUnavailable` (→ 503) when the key is unset. |
| `backend/app/config.py` | Added `database_url`, `database_ssl_insecure`, `fmp_api_key` (+ `db_configured` / `fmp_configured` properties). |
| `backend/app/main.py` | `GET /api/assets/{symbol:path}/profile` — declared **before** the catch-all `{symbol:path}` route so `:path` doesn't swallow `/profile`. No Alpaca keys required (independent, like `/api/indices`). |
| `backend/sql/001_company_profiles.sql` | `company_profiles` schema (mirrors the inline `_ensure_schema` SQL; for manual run in the Supabase SQL editor). |
| `backend/.env.example` | Documents `DATABASE_URL` + `FMP_API_KEY`. |
| `requirements.txt` + `backend/requirements.txt` | `pg8000==1.31.5` in **both** (dual-requirements trap — see `CLAUDE.md`). |

### Flow
```
GET /api/assets/{symbol}/profile
  → get_company_profile(symbol)
     1. DB cache hit & fresh (<7d)?  → return it
     2. live fetch:  FMP stable/profile (_fetch_fmp/_map_fmp)
     3. write-through to company_profiles (if DB reachable)
     4. return profile
```

### Profile shape
`symbol, name, exchange, sector, industry, market_cap, description, website,
employees, logo_url, fundamentals (jsonb), updated_at`. FMP populates
everything except `fundamentals` (the `stable/profile` endpoint carries no
fundamentals block — left `{}` for a later source).

---

## Why nothing is verified end-to-end (environment, not code)

Three different environments, three different limits — this is the crux:

| Environment | HTTPS (FMP) | Postgres :5432 | Notes |
| --- | --- | --- | --- |
| **Cloud agent sandbox** (Claude Code on web) | ❌ blocked by egress **allowlist** ("Host not in allowlist") unless the env network policy is set to **Full/Custom** | ❌ raw TCP times out (not proxied; likely stays blocked even on Full) | Default policy is "Trusted". |
| **Owner's local machine** | ✅ open | ❌ corporate firewall blocks 5432 | Can test providers, not the DB write. |
| **Prod (Render / Vercel)** | ✅ open | ✅ open | **Only place the full path runs.** |
| **Supabase web SQL editor** | n/a | ✅ | Used to confirm the DB exists (`SELECT 1`) + run schema. |

What that means for verification status:

- **DB write-through path: UNRUN.** Only `SELECT 1` was run in Supabase's web
  editor. The pg8000 code has never connected from anywhere (sandbox + local
  both block 5432).
- **Yahoo: removed.** It was the original provider but `getcrumb` returns **406**
  (anti-scraping, IP-reputation based) from both the local machine and the cloud
  sandbox, and would fail the same way from Render/Vercel. Dropped entirely — FMP
  is now the sole provider.
- **FMP: confirmed working** from the cloud sandbox (HTTPS egress now open).
  Legacy v3 returns **403 ("Legacy Endpoint")**; the **stable** endpoint returns
  200 with full data (`name/exchange/sector/industry/market_cap/description/
  website/logo_url/employees`). `_fetch_fmp` uses `stable` — verified for
  AAPL/NVDA/TSLA, an unknown-symbol → `ProfileNotFound`, and unset-key →
  `ProfileUnavailable` (503). The DB write-through layer around it is still
  UNRUN (5432 blocked everywhere but prod).

---

## ✅ Resolved — the FMP endpoint bug

`profiles._fetch_fmp` used FMP's **legacy** endpoint
(`/api/v3/profile/{symbol}`), which returns **403 ("Legacy Endpoint")** for new
free-tier keys. Switched to the **stable** API
(`/stable/profile?symbol={symbol}`) — confirmed 200 with the free key. JSON
field names are identical (`companyName`, `exchange`, `sector`, `industry`,
`marketCap`, `description`, `website`, `image`), and `stable` additionally
returns `fullTimeEmployees`, now mapped to `employees`.

---

## How to test

### Locally (validates FMP, NOT the DB write)
```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env        # set DATABASE_URL + FMP_API_KEY (see Secrets below)
python -m uvicorn app.main:app --reload --port 8000
curl -s localhost:8000/api/assets/AAPL/profile | python -m json.tool
```
With 5432 blocked locally, the DB read/write will raise `DbUnavailable` and the
code falls back to a live (uncached) fetch — so a successful curl proves the
**provider** works; it does **not** prove caching.

### From a cloud agent (only if the env network policy is loosened)
Edit the environment (cloud icon → **Network access**) → set **Full**, or
**Custom** + allow `financialmodelingprep.com`. Start a **fresh session**
(running sandboxes don't pick up the change). HTTPS will then work; 5432
likely still won't.

### Full path (DB write-through): only in prod
Deploy to Render/Vercel with env vars set, then hit
`/api/assets/AAPL/profile` twice and confirm the 2nd call's `updated_at` is
unchanged (served from cache), and a row exists in the Supabase table editor.

---

## Deployment checklist

- **Render** (always-on relay) and **Vercel** (serverless API) both need
  `DATABASE_URL` and `FMP_API_KEY` in their env vars.
- `pg8000` is already in **both** requirements files (Vercel reads root,
  Render/local read `backend/`).
- GitHub Pages is frontend-only — no DB, no profile endpoint there.
- Table auto-creates on first request, or run
  `backend/sql/001_company_profiles.sql` in the Supabase SQL editor.

---

## Secrets (rotate — they were exposed)

Set these **only** in local `backend/.env` (gitignored) + Render + Vercel env
vars. **Never commit them.**

- **`DATABASE_URL`** — Supabase **Session pooler** (IPv4, free):
  `postgresql://postgres.romipzjlevqjinygwqcc:<PASSWORD>@aws-1-us-west-1.pooler.supabase.com:5432/postgres`
  (Do not use Direct/IPv6 or the Transaction pooler.) Use an alphanumeric
  password to avoid URL-encoding; if it has special chars, URL-encode them
  (`@`→`%40`). Optional `DATABASE_SSL_INSECURE=true` only if the pooler trips
  cert verification.
- **`FMP_API_KEY`** — free Financial Modeling Prep key.
- ⚠️ Both the DB password and the FMP key were pasted in chat / committed to a
  now-deleted handover file. **Rotate both** (Supabase → Settings → Database →
  reset password; FMP dashboard → regenerate key) before this carries anything
  real.

Supabase project: **Craig's Projects**, region **us-west-1**, ref
`romipzjlevqjinygwqcc`. (An earlier us-east-2 project `cpoesynolegpzdohybaf`
was also created — delete whichever you're not using.)

---

## Workflow rules (from CLAUDE.md — follow these)

- Work on this `claude/` branch; **bump `VERSION` Z on every commit**.
- Surgical edits only; no rewrites; minimal comments (why, not what).
- New deps go in **both** requirements files; **no C extensions** (Python 3.14
  / Vercel). pg8000 is pure-Python on purpose.
- Keep graceful degradation (503-style) when keys/DB are unset.
- Don't put model identifiers in commits/PRs/code. Don't open a PR unless asked.

---

## Next phases (not started)

1. **Finish + verify Phase 1:** fix the FMP endpoint, deploy, confirm
   write-through caching works in prod.
2. **Phase 2 — DB-backed Ask-bot tools:** add `get_company_profile` /
   `screen_assets` to the Ask-anything tool set (`backend/app/ai/tools_read.py`
   + assembler `ai/tools.py`; executed in `ai/router.py`). Lets the bot answer
   "find healthcare stocks over $10B" from SQL instead of web_search.
3. **Phase 3 — pgvector RAG:** enable the `vector` extension, embed company
   descriptions/news, add semantic "similar to X" retrieval.
4. **Catalogue/screener UI:** front-end surface over the enriched universe.
