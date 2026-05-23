# Supabase / Company-Catalogue — Handover

Handover for a fresh agent continuing the Postgres + company-info work on
branch **`claude/alpacas-asset-api-catalogue-noWg1`**. Read `CLAUDE.md` first
(workflow + architecture rules); this doc is the task-specific context.

## TL;DR

- **Goal:** add Postgres (Supabase) persistence, starting with a
  company-info **enrichment cache** behind `GET /api/assets/{symbol}/profile`.
  Longer arc: a browsable asset catalogue/screener and DB-backed tools for the
  **Ask-anything bot** (incl. pgvector semantic search later).
- **State:** Phase 1 is **committed & pushed** to this branch (`VERSION`
  `0.41.3`). Code imports cleanly; the route is registered.
- **Why testing is incomplete:** Phase 1 was built in a cloud sandbox that
  **blocks outbound Postgres (port 5432) and blocks Yahoo (datacenter IP)**.
  Your local desktop almost certainly does **not** have those blocks — so your
  first job is to **run it locally and verify** (see "Verify locally").

## Why Postgres (the owner's goals)

Learning curve (transferable SQL), opening up options, improving client
experience, and improving the Ask-anything bot. Chose **Supabase** for the
dashboard/DX + built-in pooler + pgvector. (`CLAUDE.md` already earmarked
"Postgres (Supabase/Neon)" as the backlogged persistence layer.)

## What's on the branch (Phase 1, committed)

| File | What it does |
| --- | --- |
| `backend/app/db.py` | pg8000 (pure-Python, 3.14-safe) Postgres layer. Per-op connections from `DATABASE_URL`. `DbUnavailable` when unset/unreachable. `fetch_profile` / `upsert_profile` / auto `ensure_schema`. |
| `backend/app/profiles.py` | `get_company_profile(symbol)` — DB-cached write-through (weekly TTL), falls back to live Yahoo when no DB. Yahoo `quoteSummary` via crumb+cookie. Raises `ProfileNotFound`. |
| `backend/app/config.py` | `database_url`, `database_ssl_insecure`, `db_configured` added. |
| `backend/app/main.py` | `GET /api/assets/{symbol:path}/profile` — declared **before** the catch-all `{symbol:path}` route so `:path` doesn't swallow `/profile`. No Alpaca keys required. |
| `backend/.env.example` | `DATABASE_URL` placeholder + comment. |
| `requirements.txt` + `backend/requirements.txt` | `pg8000==1.31.5` (in **both** — dual-requirements trap). |
| `backend/sql/001_company_profiles.sql` | `company_profiles` schema (mirrors the inline `ensure_schema` SQL; for manual run in the Supabase SQL editor). |

## Supabase project

- Project: **Craig's Projects**, region **us-west-1**, ref
  `romipzjlevqjinygwqcc`. *(An earlier us-east-2 project `cpoesynolegpzdohybaf`
  was also created — pick one, delete the other to avoid confusion.)*
- **Use the Session pooler** connection string (IPv4, proxied **free**):
  ```
  postgresql://postgres.romipzjlevqjinygwqcc:[YOUR-PASSWORD]@aws-1-us-west-1.pooler.supabase.com:5432/postgres
  ```
  Do **not** use *Direct connection* (IPv6-only on free tier) or *Transaction
  pooler* (IPv6 by default; IPv4 needs a paid add-on).

### Security ⚠️
The DB password was pasted into chat during setup — **rotate it** (Supabase →
Settings → Database → Reset database password; pick an alphanumeric password to
avoid URL-encoding). Put the real `DATABASE_URL` only in:
1. local `backend/.env` (gitignored — never commit it),
2. Render env vars, 3. Vercel env vars (Production/Preview).
GitHub Pages is frontend-only — no DB access.

## Verify locally (do this first)

```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env          # then set DATABASE_URL (rotated) in .env
uvicorn app.main:app --reload --port 8000
# in another shell:
curl -s localhost:8000/api/assets/AAPL/profile | python -m json.tool
```
- The `company_profiles` table is **auto-created on first request**
  (`db.ensure_schema`); or run `backend/sql/001_company_profiles.sql` in the
  Supabase SQL editor.
- Confirm: first call hits the provider; second call is served from the DB
  cache (check `updated_at`, and that a row exists in the Supabase table editor).
- If TLS fails on the pooler cert, set `DATABASE_SSL_INSECURE=true` in `.env`
  (TLS stays on, cert verification off) — but try verified first.

## OPEN DECISION — data provider (Yahoo vs FMP)

The enricher currently uses **Yahoo `quoteSummary`** (keyless). Risk found in
the sandbox: Yahoo returns **`403 Host not in allowlist`** from datacenter IPs.

- **Local (residential IP):** Yahoo will *probably* work — verify with the curl
  above.
- **Production:** Vercel + Render are **datacenter IPs**, so Yahoo may be
  blocked there even if it works on your laptop. (The existing `indices.py`
  uses Yahoo's *chart* endpoint, which is less protected; `quoteSummary` is
  guarded harder.)

**Recommended:** if Yahoo 403s in your cloud prod, switch to **Financial
Modeling Prep** (free key, datacenter-friendly, richer: description, sector,
industry, market cap, logo). To wire it:
1. Add `fmp_api_key: str = ""` + `fmp_configured` to `config.py`; add
   `FMP_API_KEY=` to `.env.example`.
2. In `profiles.py` add `_fetch_fmp(symbol)` hitting
   `https://financialmodelingprep.com/api/v3/profile/{symbol}?apikey=...` and a
   `_map_fmp(...)` to the same profile dict shape; prefer FMP when the key is
   set, else fall back to Yahoo.
No new Python dep (just `requests`), so no requirements change.

## Workflow rules (from CLAUDE.md — don't skip)

- Work on this `claude/` branch; **bump `VERSION` Z on every commit**.
- Surgical edits only; no rewrites; minimal comments (why, not what).
- New deps go in **both** `requirements.txt` files; **no C extensions**
  (Python 3.14 / Vercel). pg8000 is pure-Python on purpose.
- Keep graceful degradation (503-style) when `DATABASE_URL`/keys are unset.
- Don't put model identifiers in commits/PRs/code. Don't open a PR unless asked.

## Next phases (not started)

- **Phase 2 — DB-backed Ask-bot tools:** add `get_company_profile` /
  `screen_assets` to the Ask-anything tool set (`backend/app/ai/tools_read.py`
  + the assembler in `ai/tools.py`; executed in `ai/router.py`). Lets the bot
  answer "find healthcare stocks over $10B" from SQL instead of web_search.
- **Phase 3 — pgvector RAG:** enable `vector` extension, store embeddings of
  company descriptions/news, add semantic "similar to X" retrieval.
- **Catalogue/screener UI:** front-end surface over the enriched universe
  (the original branch intent: a browsable, filterable instrument catalogue).
