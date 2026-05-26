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

Provider hasn't shared the rate limit officially, but observed behaviour
is documented below.

## Provider limits (observed)

One-off probe run 2026-05-26 against the live `TR_FXCM` partner key.
200 calls total — Phase A sequential baseline (40), Phase B parallel
burst with 10 concurrent workers (160). **Zero 429s, zero errors** across
both phases. Rate ceiling is therefore strictly **above 16.6 calls/sec
sustained** — the actual cap is unknown because we didn't hit it.

### Phase A — sequential baseline (40 calls)

5 symbols × 8 endpoints (NVDA / TSLA / AAPL / MSFT / GOOGL), one call at
a time. Reflects the latency a single user sees on a cold cache.

| Endpoint | p50 (ms) | p95 (ms) | Avg payload |
|---|---:|---:|---:|
| `smartScore` | 194 | 606 | 0.7 KB |
| `stocks/overview` | 269 | 290 | 0.3 KB |
| `analysts` | 179 | 213 | 3.3 KB |
| `bloggerConsensus` | 191 | 254 | 0.3 KB |
| `newsSentiment` | 177 | 199 | 2.5 KB |
| `InvestorSentiment` | 189 | 383 | 5.5 KB |
| `hedgefunds` | 270 | 282 | **50.5 KB** |
| `insiders` | 192 | 212 | 26.3 KB |

Wall time 13.0 s for 40 calls → **3.1 calls/sec** ceiling when serial
(i.e. bounded by per-call latency, not provider throttling).

### Phase B — parallel burst (160 calls, 10 workers)

20 symbols × 8 endpoints fanned across 10 concurrent workers. Reflects
the load a busy multi-user moment would produce.

| Endpoint | p50 (ms) | p95 (ms) | Avg payload |
|---|---:|---:|---:|
| `smartScore` | 468 | 1,141 | 0.7 KB |
| `stocks/overview` | 481 | 947 | 0.3 KB |
| `analysts` | 477 | **1,766** | 3.3 KB |
| `bloggerConsensus` | 482 | **1,872** | 0.3 KB |
| `newsSentiment` | 439 | 900 | 2.5 KB |
| `InvestorSentiment` | 600 | 888 | 5.5 KB |
| `hedgefunds` | 441 | 856 | 33.2 KB |
| `insiders` | 444 | 742 | 36.6 KB |

Wall time 9.7 s for 160 calls → **16.6 calls/sec** sustained, no
throttling, no errors.

### What this means operationally

- **Rate ceiling is comfortable.** We sustained 16.6 calls/sec for ten
  seconds with no 429s. Even a busy moment (5 users each loading 6
  research widgets simultaneously = 30 calls/burst) sits well under the
  observed throughput.
- **Concurrency penalty is real.** p95 ~1–2 s under 10-way load vs ~200–
  600 ms serial. Snappy UX after cache warm-up matters; the in-process
  TTL design handles this fine for repeat views.
- **Bandwidth, not rate, is the watch-item.** `hedgefunds` (33–50 KB)
  and `insiders` (26–37 KB) dominate. A whole-symbol research view fans
  out ~80 KB across the bundle — fine on desktop, worth caching
  aggressively per the DB-cache plan.
- **No tail surprises.** Worst p99 was `bloggerConsensus` at 1,872 ms.
  No timeouts (15 s client timeout), no 5xx, no 401 outside the known
  `consensusOverTime` tier wall.
- **Daily ceiling unknown but unlikely to bite.** At 16.6 calls/sec
  sustained that's 1.4M calls/day in theory; we'll be three orders of
  magnitude below that in normal use. Daily cap is a non-issue until we
  invent a reason to poll constantly.

### Re-probing

`/tmp/tr_probe.py` (one-off, not committed) is the canonical script.
Re-run when the token changes, the partner tier changes, or we suspect
the provider has tightened limits. Update the table above with new
numbers + the date of the run; keep the old numbers in a changelog at
the bottom of this section if multiple runs disagree.

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
| Workspace **Hedge Funds** widget (per-symbol, stocks-only) | `/api/research/hedge-funds/{symbol}` → `hedgefunds/{ticker}` | `components/research/HedgeFundsCard.tsx` + `HedgeFundsWidget`. Signal headline (rating + confidence), last-Q net, count of funds covered, quarterly trend (last 4 quarters), top movers list (sorted by abs shares traded). 6h TTL — 13F cadence is quarterly. |
| AI bot read tool `get_hedge_funds` | same | One symbol arg. Returns signal + holdings_history + institutional_holdings. |
| Workspace **Insiders** widget (per-symbol, stocks-only) | `/api/research/insiders/{symbol}` → `insiders/{ticker}` | `components/research/InsidersCard.tsx` + `InsidersWidget`. Trend + confidence signal (stock vs sector), discretionary vs uninformative counts, monthly buy/sell bars (last 6 months), recent named transactions. 4h TTL — Form-4 filings within 2 business days. |
| AI bot read tool `get_insiders` | same | One symbol arg. Returns confidence_signal + monthly + transactions. |

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
