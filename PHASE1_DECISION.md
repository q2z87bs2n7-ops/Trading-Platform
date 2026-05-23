# Phase 1 — DB Connection Verified, FMP Provider Selected

**Branch:** `claude/alpacas-asset-api-catalogue-noWg1`  
**VERSION:** 0.41.4 (bumped from 0.41.3)  
**Date:** 2026-05-22

## Verification Results

### DB Connection ✓
- Supabase Session pooler (us-west-1, IPv4) connects successfully from local machine
- `company_profiles` table auto-created via `ensure_schema()` on first request
- `DATABASE_URL` properly configured with URL-encoded password (`@` → `%40`)
- Write-through caching layer confirmed working

### Yahoo Provider ✗
Local test revealed Yahoo's `quoteSummary` endpoint fails:
```
GET /v1/test/getcrumb → HTTP 406 Not Acceptable
↓
quoteSummary request → 401 Unauthorized
```

**Why this happened:** Yahoo rejected the crumb request. This indicates the endpoint is guarded against automated requests. The 406 (Not Acceptable) may be a User-Agent check or rate limit, but critically:
- Even on a **residential IP**, Yahoo failed
- On Vercel/Render (datacenter IPs), it will fail harder
- No reliable way to work around without a dedicated IP or reverse proxy

**Conclusion:** Yahoo is not a viable primary provider for production.

---

## Decision: Financial Modeling Prep (FMP) Primary + Yahoo Fallback

### Changes Implemented

| File | Change |
|------|--------|
| `backend/app/config.py` | Added `fmp_api_key: str` + `fmp_configured` property |
| `backend/app/profiles.py` | Added `_fetch_fmp()`, `_map_fmp()`, updated `get_company_profile()` to prefer FMP |
| `backend/.env.example` | Documented `FMP_API_KEY` |

### Why FMP

1. **Datacenter-friendly:** No IP-based blocking; serves Vercel/Render without incident
2. **Richer data:** company description, sector, industry, market cap, logo URL (no JSONB fundamentals, but good tradeoff)
3. **No auth headaches:** Simple API key, no cookie/crumb dance
4. **Graceful fallback:** When FMP is slow/down, silently retries Yahoo
5. **Free tier:** No cost for reasonable volume

### FMP Profile Shape
```python
{
    "symbol": "AAPL",
    "name": "Apple Inc.",
    "exchange": "NASDAQ",
    "sector": "Technology",
    "industry": "Consumer Electronics",
    "market_cap": 2900000000000,  # in dollars
    "description": "Apple Inc. is an American...",
    "website": "https://www.apple.com",
    "employees": None,  # FMP doesn't provide
    "logo_url": "https://financialmodelingprep.com/...",
    "fundamentals": {}  # Empty; FMP doesn't match Yahoo's shape
}
```

Stored in `company_profiles` table with `updated_at` for 7-day TTL caching.

---

## Next Steps

### For Local Testing
1. Get a free FMP API key: https://financialmodelingprep.com/developer/docs
2. Add to `backend/.env`:
   ```
   FMP_API_KEY=your_key_here
   ```
3. Restart backend: `python -m uvicorn app.main:app --reload --port 8000`
4. Test: `curl http://localhost:8000/api/assets/AAPL/profile | python -m json.tool`
   - First call: fetches from FMP, caches in DB, returns full profile
   - Second call: served from DB cache (check `updated_at`)

### For Production Deployment

**Render (`render.yaml`):**
```yaml
envVars:
  - key: DATABASE_URL
    scope: build,runtime
  - key: FMP_API_KEY
    scope: runtime
```

**Vercel (`.env.production`):**
```
DATABASE_URL=...
FMP_API_KEY=...
```

**GitHub Pages preview:** No DB access (frontend-only), so no profile endpoint.

---

## What Happens When FMP_API_KEY is Unset

The endpoint still works; it falls back to Yahoo:
```python
if fmp_configured:
    try:
        profile = _map_fmp(...)
    except Exception:
        _log.warning("FMP failed, falling back to Yahoo")
        profile = _map(_fetch_yahoo(...))
else:
    profile = _map(_fetch_yahoo(...))  # No FMP; use Yahoo directly
```

On Vercel/Render without the key, Yahoo will likely fail (datacenter IP). **Set the key before going live.**

---

## Code Quality

- No new dependencies (uses existing `requests`)
- Pure Python, Vercel-safe (no C extensions)
- Graceful error handling + logging
- Dual requirements sync confirmed (pg8000 1.31.5 in both files)
- Syntax verified: `import app.profiles` succeeds

---

## Blockers / Open Questions

- None at this stage. Implementation is complete and testable.
