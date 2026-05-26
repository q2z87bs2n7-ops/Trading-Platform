# AI surfaces

Two AI surfaces; **accent colour is the tell** — **teal = local intent parser**
(free, instant); **violet = real Claude API call** (Anthropic credits, slow).
`CLAUDE.md` has the one-paragraph summary + tunables; this is the full wiring.
For runtime gotchas (prefix-cache markers, web-search self-heal, the hybrid
tool loop) see `docs/landmines.md` → "AI chat".

## Ask anything (teal — local intent parser)

`components/ask/`, available in all modes. Opened by the "Ask anything" pill or a
global `Cmd+K` / `Ctrl+K` listener in `App.tsx`. `lib/ask-intent/` is a
confidence-scored router (detectors → scoring → router) returning one of 10 typed
intents (`order`, `close`, `portfolio`, `movers`, `news`, `orders`, `chart`,
`market_summary`, `workspace`, `fallback`); each renders an `AskResultCard`
composing existing hooks.

**Silo-aware:** `AskBar` takes the active `assetClass`; `parseIntent(text,
assetClass)` recognises crypto pairs (`BTC/USD`) and normalises bare coins →
`COIN/USD` in the crypto silo, and the cards behave per silo (portfolio/news/movers
filter to the silo; crypto movers are derived client-side from the crypto tickers
since Alpaca has no crypto screener).

`fallback` intents optionally POST to `/api/ai/ask` (gated by `askAiEnabled` in
`app_settings_v1`, default off — off renders the `AiDisabledNotice`; trimmed tool
set — `read_only_tools()` in `backend/app/ai/tools.py`; the active `asset_class`
is sent so the model steers to the right symbols/news). The fallback bot defaults
to the active silo but **can** answer cross-silo / whole-account questions on
request — `get_positions`/`get_orders`/`get_account` are whole-account, and
`get_watchlist`/`find_symbol` take an `asset_class` arg to target the other silo;
the system context tells it not to pull the other silo proactively.

### Action tools (Ask-anything only, not ChartBot)

- `add_to_watchlist`/`remove_from_watchlist` — bulk, validate tradability first;
  themed lists like "top 10 pharma" come from model knowledge, with `web_search`
  for current/ranked lists.
- `generate_report` (positions/orders/activities/pnl → CSV) and `export_csv`
  (any other readable data — bars/quotes/news/custom tables — the model fetches
  then passes as rows). Both surface as a download via `AskResponse.reports`;
  CSVs are built in `backend/app/ai/reports.py`.

### Workspace control

`ai/tools_workspace.py`: `set_workspace_layout`, `set_channel_instrument`,
`add_workspace_widget`, `remove_workspace_widget`, `build_workspace_layout`.
These don't run server-side — each *queues a client directive* into
`AskResponse.workspace_actions` (same deferred-artifact pattern as `reports`)
which the frontend `FallbackCard` replays against the lazy Workspace via the
`lib/workspace/controller.ts` singleton (App registers mode/silo hooks; Workspace
registers an imperative handle on `onReady`). The bot can resolve symbols
(`find_symbol`/`screen_assets` — the latter now screens/sorts on stock
fundamentals too: P/E, dividend yield, net margin, ROE, revenue growth) then
`build_workspace_layout` a responsive custom
grid ("watch the 7 best tech names"); the request carries a `viewport` hint and
the app auto-switches into Workspace mode (desktop-only).

A widget given both a `symbol` and a `channel` points that channel at the symbol,
so every panel on the channel (chart + profile + earnings + data) follows —
that's how the bot pins distinct instruments (≤4 channels); channel-linked panels
can't take a per-panel symbol otherwise. The placeable-widget enum
(`WORKSPACE_WIDGET_KINDS`) is the single source of truth for what the bot can
add/build; mirror any new widget into `WidgetId` / `WIDGET_IDS`
(`lib/workspace/actions.ts`) and the local `WORKSPACE_WIDGETS` map + add-regex
(`lib/ask-intent/detectors.ts`) so local commands resolve without an AI
round-trip (the **Earnings** and **Fundamentals** widgets follow this pattern;
Fundamentals is stocks-only — the bot links it to a stock channel). The same directive
shapes back a deterministic local `workspace` intent in `lib/ask-intent/` (e.g.
"watch AAPL NVDA TSLA", "trader layout", "set blue to NVDA", "add earnings for
AAPL") — no AI round-trip.

### Tool schema layout

These Workspace/action tools live in `ask_tools()`, not `TOOLS`. **Tool schemas
are split across `ai/tools_read.py` (backend), `ai/tools_draw.py` (frontend),
`ai/tools_action.py` (Ask-anything write/report) and `ai/tools_workspace.py`
(Ask-anything Workspace control); `ai/tools.py` is the assembler that builds
`TOOLS` (read then draw — order is load-bearing for prefix-cache hits) and
re-exports the public API (`TOOLS`/`read_only_tools`/`ask_tools`/…). Edit schemas
in the split files; never reorder `TOOLS`.**

**Multi-turn within a session:** `AskBar` keeps a running `apiHistory` and sends
prior fallback Q&A as `history` so follow-ups have context; it's session-only
(reset on close).

## AI market summary (violet — real Claude call)

`hooks/useMarketSummary.ts` + `MarketSummaryCard`, Discover hero. Auto-generates
a per-window summary via `/api/ai/ask` (gated by its own `marketSummaryAiEnabled`
toggle — off shows the `AiDisabledNotice`, no generation). Per silo: **stocks**
uses US market windows (open/midday/close EST) and US headlines; **crypto** uses
four 6-hour UTC windows (00–06 / 06–12 / 12–18 / 18–24 UTC) and BTC/crypto news;
labels show the UTC range explicitly so they are unambiguous for users in any
timezone. Cached per silo (`market_summary_v1` / `crypto_market_summary_v1`); the
`market_summary` intent card reads the matching cache.

## ChartBot side panel (violet — real Claude call)

`components/chat/`, Chart mode only, gated by `AI_CHAT_ENABLED` operator-side
**and** the user `chartbotEnabled` toggle — when the user toggle is off the panel
renders the `AiDisabledNotice` in its body instead of the transcript/composer.
380px violet right-edge panel. Hybrid tool-use loop in `backend/app/ai/router.py`:
backend-executed read tools run server-side; frontend-executed chart tools
(drawings, studies, symbol/resolution, screenshots, order viz) declared in the
same `tools.py` schema but dispatched in `lib/ai-client.ts` against
`lib/tv-drawings.ts`, with results folded into the next round (up to 10 outer
rounds). Session persists to `chartbot_session` under a 256 KB budget. System
prompt + tool schemas are cache-marked for Anthropic prefix cache hits — keep the
markers.

## Tunables

`AI_CHAT_ENABLED`, `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` (default
`claude-sonnet-4-6`), `AI_MAX_TOKENS` (4096), `AI_MAX_TOOL_ITERATIONS` (16),
`AI_WEB_SEARCH_ENABLED` (default `false` — Anthropic hosted web_search for the Ask
anything bot; requires the org to have web search enabled or the API 400s. The
bot is internal-first and self-heals: if web search is on but unsupported it drops
the tool and retries from its own tools/knowledge). 60s Anthropic client timeout;
auth/config errors surface as 503.

`/api/config` re-exports `anthropic_model` + `ai_max_tool_iterations` to the
frontend so `lib/ai-cost.ts` can render real per-surface cost estimates in
`AiDisabledNotice` (input + output token medians × published Anthropic
per-million-token rates, model family detected by substring). The notice's
"Turn on" CTA dispatches `trading-platform:open-settings` rather than
toggling the setting directly — explicit consent before credit spend.
