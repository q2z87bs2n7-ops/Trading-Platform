# Tipranks

Per-request research data (analyst consensus, hedge-fund flow, insider
transactions, sentiment) from the Tipranks external partner API. **Not**
an asset-catalogue enrichment source — these are live-fetched per ticker
view, not bulk-seeded into Postgres.

**Status (POC):** `trendingStocks` is wired as one Discover module + one
Workspace widget; the other 8 endpoints are inventoried below for future
work and follow the same client/route shape when they're added.

## Base & auth

- **Base URL:** `https://api.tipranks.com` (backed by
  `tr-external-api-wa.azurewebsites.net` — surfaces in error bodies)
- **Auth is via query string, not headers**, despite the `X-` prefix on
  the param names. Both required on every call:
  - `X-APIKey=TR_FXCM` — partner identifier (not secret; same value for all
    callers on this partner)
  - `X-APIToken=<token>` — the actual secret
- Missing/invalid token → `401 {"message":"Authorization has been denied
  for this request."}`. No `WWW-Authenticate` hint, no separate error
  shape for tier-restricted endpoints (see consensusOverTime gotcha below).
- **Env vars (proposed):** `TIPRANKS_API_KEY` (the `TR_FXCM` partner ID)
  and `TIPRANKS_API_TOKEN` (the secret). Both server-side only — same
  rule as Alpaca/FMP/Anthropic, never reach the browser.

## Endpoint inventory

Probed 2026-05-26 with TSLA. All paths return JSON. `bytes` is the TSLA
response size as a rough complexity tell.

| Endpoint | Verb | Status | Bytes | Notes |
|---|---|---|---|---|
| `/api/smartScore/{tickers}` | GET | ✅ 200 | 660 | Composite score + component breakdowns. `{tickers}` is **plural** — comma-separate for batch (`smartScore/tsla,aapl,nvda` → array of 3). |
| `/api/stocks/overview` | GET | ✅ 200 | 273 | Price targets + buy/sell/hold counts. Needs ticker as **either** `?tickers=tsla` (query, comma-batchable) **or** path-suffixed `/tsla`. Both shapes return identical data. |
| `/api/stocks/consensusOverTime/{ticker}` | GET | ❌ **401** | — | **Tier-restricted on the `TR_FXCM` key.** Endpoint exists (drop the ticker → 404), but same credentials that authenticate the other 9 endpoints get `Authorization has been denied` here. Tried uppercase, alt-casing, `?numOfMonths=6` — all 401. Ask the provider whether this needs an upgrade or a different signature. |
| `/api/analysts/{ticker}` | GET | ✅ 200 | 3.3 KB | Per-analyst recs: name, firm, recommendation, date, expert UID. |
| `/api/stocks/bloggerConsensus/{ticker}` | GET | ✅ 200 | 360 | Bull/bear ratios + per-site distribution (SeekingAlpha, Motley Fool, …). |
| `/api/Stocks/InvestorSentiment/{ticker}` | GET | ✅ 200 | 1.2 KB | **Capital-S `Stocks`** — case-sensitive on this one path. Portfolio counts + 7/30-day holding change. |
| `/api/hedgefunds/{ticker}` | GET | ✅ 200 | 27 KB | Richest payload. Signal data + per-fund position history. |
| `/api/insiders/{ticker}` | GET | ✅ 200 | 16 KB | Yearly insider transactions, monthly buckets, named insiders. |
| `/api/stocks/newsSentiment/{ticker}` | GET | ✅ 200 | 2.5 KB | Stock + sector sentiment (positive/neutral/negative ratios). |
| `/api/stocks/trendingStocks` | GET | ✅ 200 | 3 KB | No ticker; returns top trending list with consensus + average PT. |

## Conventions

- **Symbols accepted in lowercase** (the sample URL used `tsla`).
  Responses always normalise to uppercase (`"ticker":"TSLA"`). Pick one
  at the client layer and stick with it — lowercase matches the sample.
- **Casing of path segments is mixed.** Almost everything is
  `lowerCamelCase` segments under `/api/stocks/...`, but `InvestorSentiment`
  lives under capital-S `Stocks`. Don't normalise — keep the exact
  per-endpoint casing in the client.
- **Crypto:** untested. Tipranks's product is equities-focused; assume
  no crypto coverage and gate the surfaces silo-side unless the provider
  confirms otherwise.

## Batch support

Two endpoints take comma-separated tickers and return arrays:

- `smartScore/tsla,aapl,nvda` → 2 KB (vs 660 B single)
- `stocks/overview?tickers=tsla,aapl,nvda` → 816 B (vs 273 B single)

Useful for portfolio / watchlist views where the N+1 alternative would
burn rate limit. The other 8 endpoints are single-ticker only.

## Tier limits / cost

Unknown — provider hasn't shared rate limits or per-call cost. **Probe
behaviour before designing the cache TTL** (the FMP precedent —
single-symbol-only, 300/min, 250/day on free — is the kind of thing
that's better discovered up front than mid-feature).

## Open questions

- **`consensusOverTime` 401.** Same key/token authenticates the other 9;
  this one consistently denies. Tier wall, different auth signature, or
  a deprecated path that didn't get cleaned out? Ask the provider.
- **Rate limits.** Per-minute? Per-day? Per-key vs per-token? Concurrent
  request cap? All unknown.
- **Sandbox / staging.** Is `TR_FXCM` already a sandbox partner ID, or
  is this prod data? The values returned (`smartScore`, hedge-fund flow)
  look real, so probably prod.
- **Crypto coverage.** Confirmed equities-only, or does it 404
  gracefully on a crypto symbol vs return stale data?

## Surfaces (wired)

| Surface | Endpoint | Where |
|---|---|---|
| Discover **Trending** card (stocks silo only) | `/api/research/trending` → `stocks/trendingStocks` | `components/discover/TrendingResearchCard.tsx`, slotted in `DiscoverPage.tsx` between Most Active and Earnings |
| Workspace **Trending** widget (stocks-only; crypto shows a notice) | same | `lib/workspace/registry.tsx` (`TrendingResearchWidget`) — reuses the Discover card via the `bare` prop |
| AI bot read tool `get_trending_stocks` | same | `backend/app/ai/tools_read.py` schema + `router.py` dispatch. Available to **both** the violet Ask anything fallback (`read_only_tools()`) and ChartBot (`TOOLS`). No arguments. Lets the bots answer "what's trending" and pre-resolve symbols when building workspaces around trending names. |
| Trending card **PT range + analyst count enrichment** | `/api/stocks/overview/{tickers}` (batched on trending's tickers) | Merged into `get_trending_stocks` in `backend/app/tipranks.py`; new fields `low_price_target`, `high_price_target`, `total_analysts` on `TrendingResearchRow`; rendered as a small sub-line under the avg PT. Note: avg PT itself stays from `trendingStocks` — overview's `priceTarget` is intentionally NOT used (each widget keeps its own source). |
| Workspace **SmartScore** widget (per-symbol, stocks-only) | `/api/research/smart-score/{symbol}` → `/api/smartScore/{symbol}` | `components/research/SmartScoreCard.tsx`; `SmartScoreWidget` in `lib/workspace/registry.tsx`. Default Main channel, no None. Composite score + 6 components (hedge-fund flow, blogger/news sentiment, insider activity, investor deltas). `fundamentals_*` fields are kept in the payload (for AI tool answers) but hidden in the UI — FMP/Fundamentals widget owns those. |
| AI bot read tool `get_smart_score` | same | `tools_read.py` schema + `router.py` dispatch. Available to both bots. Takes `symbol` arg. Lets the bots answer "what's the read on X" / "are hedge funds buying X". |
| Workspace **Sentiment** widget (per-symbol, stocks-only) | `/api/research/sentiment/{symbol}` — fans in 3 upstream calls (`stocks/bloggerConsensus`, `stocks/newsSentiment`, `Stocks/InvestorSentiment`) | `components/research/SentimentCard.tsx` + `SentimentWidget`. Default Main, no None. News block uses a 3-segment pos/neu/neg bar; blogger block shows bullish/bearish ratios + top sources; investor block shows portfolio holding stats + 7d/30d deltas. |
| AI bot read tool `get_sentiment_signals` | same | One symbol arg. Returns combined blogger + news (stock + sector) + investor blocks. |
| Workspace **Analyst Ratings** widget (per-symbol, stocks-only) | `/api/research/analysts/{symbol}` → `analysts/{ticker}` | `components/research/AnalystRatingsCard.tsx` + `AnalystRatingsWidget`. Paginated 8/page; dense breakpoint 380 drops the firm column. |
| AI bot read tool `get_analyst_ratings` | same | One symbol arg. Returns per-analyst rows (name, firm, recommendation, date). |

Backend client: `backend/app/tipranks.py` — in-process TTL cache (15min on
`trendingStocks`), graceful empty list when env vars unset (mirrors the FMP /
CoinGecko shape).

Add a new endpoint by following the same path: a `_norm_*` mapper + a cached
`get_*` in `tipranks.py`, a route under `/api/research/*` in `main.py`, an
`api.ts` getter + `types.ts` row shape + `data/hooks.ts` query + a layer-2
component, then expose via Discover and/or a Workspace adapter (don't forget
the 4 widget-id sync points — `registry.tsx`, `actions.ts`,
`tools_workspace.py`, `detectors.ts`).

## Security note

The credentials shared in chat (the `ghvp1348-…` token) sit in this
session's transcript. Rotate before treating it as production-grade. The
same warning that applies to the FMP key and DB password in
`docs/database.md` applies here.
