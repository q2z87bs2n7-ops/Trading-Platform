# Trading Platform: Development Effort & Cost Estimation

## Executive Summary

Building this **paper-trading dashboard** from scratch would require **8–12 months** for a team of 2–3 full-stack developers, with estimated costs of **$200k–$350k** (USD). The platform is production-grade with sophisticated features (real-time streaming, AI integration, multi-asset-class silos) and strict infrastructure requirements.

---

## Project Scope & Complexity

### Codebase Metrics
- **Frontend:** ~12,900 lines (React + TypeScript)
- **Backend:** ~4,000 lines (FastAPI + Alpaca integration)
- **Total:** ~17,000 lines of source code
- **Dependencies:** Minimal and focused (13 npm packages, 8 Python packages)
- **Deployment targets:** 3 (Vercel, Render, GitHub Pages)

### Core Features Breakdown

#### 1. **Backend API (1,200 hrs)**
- **Alpaca Integration** (300 hrs)
  - Account, positions, orders, portfolio endpoints
  - Paper-trade constraint enforcement
  - Dual asset-class silos (stocks/crypto) with symbol normalization
  - Paper account only — no live path
  
- **Real-Time Streaming** (350 hrs) — *load-bearing complexity*
  - Dual WebSocket hubs (`StockDataStream` + `CryptoDataStream`)
  - Server-Sent Events relay layer
  - Automatic fallback to polling when unavailable
  - Process-local state; no distributed pub/sub
  - Single-instance constraint on Render
  
- **Data Aggregation** (250 hrs)
  - Multi-source integration: Alpaca, Yahoo Finance (indices), IEX (quotes)
  - P/L curve reconstruction from FILL activities (FIFO lots)
  - Per-silo portfolio history (Alpaca has no asset-class breakdowns)
  - Market clock, calendar, news feeds
  
- **AI Integration** (200 hrs)
  - Anthropic Claude API client (Ask anything + ChartBot)
  - Tool-use loop with read/draw/action tool split
  - Session persistence under 256 KB budget
  - Web search (optional), fallback behavior when unsupported
  - Multi-turn context preservation
  
- **Watchlist & Persistence** (100 hrs)
  - Alpaca-hosted watchlists (`primary`, `primary-crypto`)
  - Asset search, validation, tradability checks

---

#### 2. **Frontend UI (1,800 hrs)**
- **Core Navigation & Modes** (300 hrs)
  - Splash screen (asset class picker, account hub)
  - Three-pill mode toggle (Discover, Portfolio, Chart)
  - Silo-aware context switching
  
- **Discover Mode** (400 hrs)
  - Stocks variant: holdings hero, indices marquee, watchlist cards, inline chart, gainers/losers/most-active tabs, market news
  - Crypto variant: crypto ticker, holdings hero, watchlist cards, chart, BTC news
  - Market summaries (AI-generated per silo, cached per window)
  
- **Portfolio Mode** (350 hrs)
  - P/L hero with reconstructed net P/L curve
  - Positions strip (filtered by asset class)
  - Open orders table + full activities blotter
  - Status bar with market clock, buying power
  
- **Charting** (450 hrs) — *sophisticated integration*
  - Full TradingView Charting Library wrapping
  - Custom chrome: top bar (timeframe, chart type, indicators), themed drawing rail
  - Blotter below (positions/orders/activity, asset-class filtered)
  - Broker integration (price-line overlays for open orders/positions)
  - Datafeed (`tv-datafeed.ts`), Broker (`tv-broker.ts`) wiring
  - AI drawings persistence (per-symbol UUID mapping)
  
- **Order Entry** (300 hrs)
  - Unified form state (`useOrderTicket`)
  - Floating TradeBar pill (all modes)
  - Order sheet modal (market/limit/stop/stop-limit/trailing, bracket/OCO)
  - Crypto constraints (TIF, no trailing stops, no extended hours, non-margin BP)
  - Live quote, est. notional, validation
  - Modify / Close position flows
  
- **Ask Anything Bar** (250 hrs)
  - Local regex-based intent parser (no LLM)
  - 9 intent types (order, close, portfolio, movers, news, orders, chart, market_summary, fallback)
  - Fallback to Claude API (optional, gated by settings)
  - Multi-turn session context
  - Tool-driven responses (card compositing)
  
- **ChartBot Side Panel** (150 hrs)
  - Violet accent, 380px right edge
  - Hybrid client/server tool execution
  - Chart drawings, studies, symbol/resolution changes
  - Session persistence, screenshot capability
  
- **Styling & Theme** (100 hrs)
  - Calm v2 oklch token set (light + dark)
  - Tailwind + custom utilities
  - Responsive design, responsive mobile support

---

#### 3. **Infrastructure & Deployment (600 hrs)**
- **Vercel** (200 hrs)
  - FastAPI → Vercel serverless (`api/index.py` shim)
  - Frontend build & static hosting
  - Environment variable management
  - Production workflow setup
  
- **Render Relay** (200 hrs)
  - Docker image from repo root (`backend/Dockerfile`)
  - Always-on streaming container
  - Single-instance constraint enforcement
  - Restart handling, logging
  
- **GitHub Pages Previews** (100 hrs)
  - Static frontend-only builds per `claude/**` branch
  - Auto-publish workflow
  - Preview pointing to prod backend
  
- **CI/CD & Automation** (100 hrs)
  - GitHub Actions workflows (prod deploy, preview builds, linting)
  - Secret/variable management
  - Requirement file sync checks
  - Version bumping automation

---

#### 4. **Quality & Testing (500 hrs)**
- **Frontend** (250 hrs)
  - Type checking (`tsc`)
  - Integration tests (quote streams, order submission, chart interactions)
  - E2E scenarios (order lifecycle, silo switching, theme toggle)
  - *Missing: automated testing framework (today: manual only)*
  
- **Backend** (150 hrs)
  - Alpaca client mocking
  - Stream hub tests
  - P/L curve validation
  - Tool-use loop tests
  
- **Load & Performance** (100 hrs)
  - Real-time stream sizing (concurrent users, message throughput)
  - Frontend bundle analysis (charting library is large)
  - API response time profiling

---

#### 5. **Documentation & Onboarding (200 hrs)**
- Architecture walkthrough (silos, streaming, AI integration)
- CLAUDE.md hardening (current: excellent)
- Deployment runbook
- Alpaca API quirks & constraints
- TradingView Charting Library integration notes
- Team onboarding training

---

## Timeline Estimate

### Phase 1: Foundation (Weeks 1–8) — 320 hrs
- Backend skeleton (FastAPI, Alpaca client, basic endpoints)
- Frontend scaffold (React, Vite, Tailwind, basic routing)
- Local dev setup, CI scaffolding
- **Output:** Quotes, account info, basic position listing

### Phase 2: Order Entry & Core Trading (Weeks 9–16) — 480 hrs
- Full order entry (all order types, validation, crypto constraints)
- Order & position management (modify, cancel, close)
- P/L calculations
- **Output:** Functional paper trading, but no charting or streaming yet

### Phase 3: Discover & Streaming (Weeks 17–24) — 520 hrs
- Watchlists and asset search
- Real-time streaming (dual hubs, fallback polling)
- Discover mode (holdings, news, movers, tickers)
- **Output:** Full Discover experience, live quotes

### Phase 4: Charting & Advanced UI (Weeks 25–32) — 620 hrs
- TradingView integration (wrapping, broker, datafeed)
- Portfolio mode with P/L curve
- Chart mode with drawing persistence
- Advanced CSS/theme system
- **Output:** Full three-mode UI, charting working

### Phase 5: AI & Polish (Weeks 33–40) — 400 hrs
- Ask anything parser & intent routing
- ChartBot integration & session persistence
- AI market summaries
- Edge case fixes, UX polish
- **Output:** AI surfaces live, silo-aware throughout

### Phase 6: Infrastructure & Hardening (Weeks 41–48) — 300 hrs
- Vercel deployment (prod frontend + serverless API)
- Render relay for streaming
- GitHub Pages previews
- Load testing, optimization
- **Output:** Production-ready on all three platforms

---

## Cost Breakdown (USD)

### Salary Model (2–3 FTE, 48 weeks)
| Role | Weeks | Fully Loaded Hourly | Cost |
| --- | --- | --- | --- |
| Senior Full-Stack (lead) | 48 | $95 | $136,320 |
| Full-Stack #2 | 48 | $75 | $108,000 |
| Junior / DevOps (part-time) | 24 | $50 | $24,000 |
| **Subtotal** | | | **$268,320** |

### Infrastructure & Services (12 months)
| Item | Cost |
| --- | --- |
| Render (always-on relay) | $7 /month × 12 = **$84** |
| Vercel (hobby tier) | $0 / month (included in Vercel Pro if needed: +$20/mo) |
| Anthropic API credits (estimated) | ~$500–$1,500 (ChartBot usage + Ask anything fallback) |
| Alpaca paper account | $0 (free) |
| Domain (optional) | $12 / year |
| GitHub (included) | $0 |
| **Subtotal** | **~$2,000–$3,000** |

### Third-Party Licenses & Fees
| Item | Cost |
| --- | --- |
| TradingView Charting Library | $500–$2,000 (one-time, depending on plan) |
| Anthropic API (pilot/enterprise) | Negotiable (not in hobby credits) |
| **Subtotal** | **$500–$2,000** |

### Contingency & Overhead (15%)
- Unexpected integrations, API changes, Alpaca SDK quirks: **~$50k**

### **Total Estimated Cost: $300k–$350k** (12 weeks lower-bound, 16 weeks typical)

---

## Key Risk Factors & Mitigations

### 1. **Alpaca API Instability** (Medium risk)
- **Risk:** Symbol normalization, crypto quirks (slash handling), data feed delays
- **Mitigation:** Extensive local mocking, fallback to polling, robust error boundaries

### 2. **TradingView Charting Library** (High complexity, medium risk)
- **Risk:** Large binary (committed to repo), limited documentation, tight Vercel cold-start timeout
- **Mitigation:** Lazy-load chart mode, optimize bundle, invest in integration testing

### 3. **Real-Time Streaming Reliability** (High risk)
- **Risk:** Process-local hubs, single Render instance, WebSocket fragility, CORS/VITE proxy issues
- **Mitigation:** Polling fallback (non-negotiable), health checks, circuit breakers, extensive e2e tests

### 4. **Browser Support** (Low–medium risk)
- **Risk:** Service workers, PWA, responsive mobile, TV library compatibility
- **Mitigation:** Modern browsers only (no IE11), test on iOS/Android, monitor error logs

### 5. **Crypto Silo Complexity** (Medium risk)
- **Risk:** Symbol normalization (`BTC/USD` vs `BTCUSD`), no Alpaca screener, margin constraints
- **Mitigation:** Single source of truth in `alpaca/client.py`, comprehensive normalization tests

### 6. **AI Integration Cost Control** (Low risk today, high if scaled)
- **Risk:** Unbounded Anthropic token usage, tool-use loops runaway
- **Mitigation:** Ask anything only (no ChartBot) for MVP, session budget cap (256 KB), max iterations (16)

---

## Cost Optimization Strategies

1. **Defer ChartBot to V2** (save ~150 hrs, ~$12k)
   - Ship Ask anything (local, free) first
   - Add ChartBot after MVP is stable

2. **Outsource TradingView Integration** (neutral; they handle complexity)
   - Paid Charting Library support, if available

3. **Use Render free tier initially** (save ~$84 /mo)
   - Limited dyno uptime, but sufficient for single-user hobby projects
   - Upgrade only if stream reliability needed for >1 concurrent user

4. **Skip GitHub Pages previews** (save ~40 hrs setup)
   - Reduces deployment complexity, but loses branch-level testing

5. **Reduce testing scope** (risky)
   - Automated testing is deferred; manual QA only
   - *Not recommended:* streaming bugs compound quickly

---

## Team Composition Recommendation

### MVP Phase (Weeks 1–24): 2 FTE
- **Senior Full-Stack Lead** (React/TypeScript, FastAPI/Python, DevOps)
  - Backend architecture, Alpaca integration, streaming hub
  - Mentoring junior; unblocking on third-party integrations
  
- **Full-Stack Engineer** (React focus)
  - Discover & Portfolio modes, order entry, themes
  - Frontend testing, CSS/accessibility

### Polish Phase (Weeks 25–48): 2.5 FTE
- Add **Part-Time DevOps/Render** to harden infrastructure

---

## Success Metrics (Post-Launch)

- All three modes functional and silo-aware
- Real-time stream live with polling fallback
- Sub-2s order confirmation
- No unplanned 503s on Vercel
- <500ms Ask anything intent parse
- <3s ChartBot response (when enabled)

---

## Assumptions

- **Single-user paper account** (no multi-tenancy)
- **Team has FastAPI & React experience** (ramp-up not costed)
- **Free Alpaca paper account** (no premium data feed)
- **Render as streaming relay** (no Kubernetes, no multi-instance)
- **No mobile app** (responsive web only)
- **No persistence layer** (Postgres backlogged; localStorage today)
- **Hobby-grade SLA** (best-effort, not 99.9%)
- **IEX data feed** (free; ~2–3% of volume)

---

## Conclusion

This is a **serious, production-grade project** for a **single person's paper trading**. The ~$300k estimate reflects:

1. **Real engineering complexity** (streaming, AI tool-use, TradingView, multi-silo architecture)
2. **Minimal dependencies** (focused stack, not a full SaaS template)
3. **Infrastructure automation** (CI/CD, three-tier deployment)
4. **Quality bar** (responsive, PWA, accessible, type-safe end-to-end)

**For a bootstrapped team:** phase the scope. Ship Ask anything + basic trading in 12–16 weeks for ~$100k; add ChartBot + charting in a second phase. **For a funded startup:** budget $300k–$400k for a polished, hardened product with full test coverage.
