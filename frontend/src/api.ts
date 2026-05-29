import type {
  Account,
  Activity,
  Asset,
  AssetProfile,
  FxcmAccount,
  FxcmBar,
  FxcmClosedTrade,
  FxcmOrder,
  FxcmPrice,
  FxcmPosition,
  Bar,
  CalendarDay,
  EarningsResponse,
  EconomicResponse,
  IndicesResponse,
  MarketClock,
  MarketNewsResponse,
  MostActiveResponse,
  MoversResponse,
  NewsItem,
  Order,
  PnlHistory,
  PortfolioHistory,
  Position,
  Quote,
  AnalystRatingsResponse,
  HedgeFundsResponse,
  HolderDemographicsResponse,
  InsidersResponse,
  RelatedTickersResponse,
  ReplaceOrderInput,
  SentimentResponse,
  SmartScoreResponse,
  Snapshot,
  SubmitOrderInput,
  TrendingResearchResponse,
} from "./types";
import type { SiloedAction } from "./lib/workspace/actions";

// Empty for local dev (Vite proxy) and Vercel prod (same origin). Set to
// the Vercel prod URL at build time for the GitHub Pages dev previews,
// which have no backend of their own.
const API_BASE = (import.meta.env.VITE_API_BASE ?? "").replace(/\/$/, "");

// The real-time stream needs a persistent host, which is usually NOT the
// serverless API base (Vercel can't hold the connection open). Point this
// at the relay deployment; if unset, streaming is skipped and the app
// falls back to polling getQuotes.
const STREAM_BASE = (
  import.meta.env.VITE_STREAM_BASE ??
  import.meta.env.VITE_API_BASE ??
  ""
).replace(/\/$/, "");

// FastAPI returns `detail` as a string (HTTPException) or an array of
// validation errors (422). Flatten both to a readable message.
function formatDetail(detail: unknown, status: number): string {
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((d: { msg?: string }) => d?.msg ?? JSON.stringify(d))
      .join("; ");
  }
  return `Request failed: ${status}`;
}

async function getJSON<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(formatDetail(body.detail, res.status));
  }
  return res.json() as Promise<T>;
}

async function sendJSON<T>(
  method: "POST" | "PATCH" | "DELETE",
  path: string,
  body?: unknown,
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(formatDetail(errBody.detail, res.status));
  }
  return res.json() as Promise<T>;
}

export const getConfig = () =>
  getJSON<{
    symbols: string[];
    feed: string;
    paper: boolean;
    anthropic_model: string;
    ai_max_tool_iterations: number;
  }>("/api/config");

export interface AppStatus {
  version: string;
  maintenance: boolean;
  message: string;
  force_stop: boolean;
  force_stop_message: string;
}
export const getStatus = () => getJSON<AppStatus>("/api/status");

export const getAccount = () => getJSON<Account>("/api/account");

export const getBars = (symbol: string, timeframe = "1Day", limit = 120) =>
  getJSON<{ symbol: string; bars: Bar[] }>(
    `/api/bars?symbol=${encodeURIComponent(symbol)}&timeframe=${timeframe}&limit=${limit}`,
  );

export const getBarsBatch = (symbols: string[], timeframe = "1Day", limit = 30) =>
  getJSON<{ bars: Record<string, Bar[]> }>(
    `/api/bars/batch?symbols=${encodeURIComponent(symbols.join(","))}&timeframe=${timeframe}&limit=${limit}`,
  );

export const getMovers = (top = 10) =>
  getJSON<MoversResponse>(`/api/movers?top=${top}`);

export const getMostActive = (top = 10, by = "volume") =>
  getJSON<MostActiveResponse>(`/api/most-active?top=${top}&by=${by}`);

export const getQuotes = (symbols: string[]) =>
  getJSON<{ quotes: Quote[] }>(
    `/api/quotes?symbols=${encodeURIComponent(symbols.join(","))}`,
  );

export const getSnapshots = (symbols: string[]) =>
  getJSON<{ snapshots: Snapshot[] }>(
    `/api/snapshots?symbols=${encodeURIComponent(symbols.join(","))}`,
  );

export const getPositions = () =>
  getJSON<{ positions: Position[] }>("/api/positions");

export const getPosition = (symbol: string) =>
  getJSON<Position>(`/api/positions/${encodeURIComponent(symbol)}`);

export const getOrders = (status = "all", limit = 50) =>
  getJSON<{ orders: Order[] }>(`/api/orders?status=${status}&limit=${limit}`);

export const getActivities = (limit = 50) =>
  getJSON<{ activities: Activity[] }>(`/api/activities?limit=${limit}`);

export const getClock = () => getJSON<MarketClock>("/api/clock");

export const getPortfolioHistory = (period = "1M", timeframe = "1D") =>
  getJSON<PortfolioHistory>(
    `/api/portfolio/history?period=${period}&timeframe=${timeframe}`,
  );

export const getPnlHistory = (assetClass: "stocks" | "crypto", period = "ALL") =>
  getJSON<PnlHistory>(
    `/api/pnl-history?asset_class=${assetClass}&period=${period}`,
  );

export const getCalendar = (start?: string, end?: string) =>
  getJSON<{ calendar: CalendarDay[] }>(
    `/api/calendar?start=${start ?? ""}&end=${end ?? ""}`,
  );

export const getAsset = (symbol: string) =>
  getJSON<Asset>(`/api/assets/${symbol}`);

// Full catalogue enrichment for one symbol (sibling path to dodge the greedy
// `/api/assets/{symbol:path}` capture). Powers the Workspace Profile widget.
export const getAssetProfile = (symbol: string) =>
  getJSON<AssetProfile>(`/api/asset-profile/${symbol}`);

// Symbol/name search over the catalogue (DB-backed; ranked by market cap).
// assetClass: "" = all, "us_equity", or "crypto".
export const searchAssets = (query: string, assetClass = "") =>
  getJSON<Asset[]>(
    `/api/assets?search=${encodeURIComponent(query)}` +
      (assetClass ? `&asset_class=${assetClass}` : ""),
  );

export const getIndices = () => getJSON<IndicesResponse>("/api/indices");

export const getEarningsCalendar = (include: string[] = []) =>
  getJSON<EarningsResponse>(
    `/api/calendar/earnings${include.length ? `?include=${include.join(",")}` : ""}`,
  );

export const getSymbolEarnings = (symbol: string) =>
  getJSON<EarningsResponse>(`/api/calendar/earnings/${symbol}`);

export const getEconomicCalendar = (countries?: readonly string[]) => {
  const qs = countries && countries.length > 0 ? `?countries=${countries.join(",")}` : "";
  return getJSON<EconomicResponse>(`/api/calendar/economic${qs}`);
};

export const getTrendingResearch = () =>
  getJSON<TrendingResearchResponse>("/api/research/trending");

export const getSmartScore = (symbol: string) =>
  getJSON<SmartScoreResponse>(`/api/research/smart-score/${symbol}`);

export const getSentiment = (symbol: string) =>
  getJSON<SentimentResponse>(`/api/research/sentiment/${symbol}`);

export const getAnalystRatings = (symbol: string) =>
  getJSON<AnalystRatingsResponse>(`/api/research/analysts/${symbol}`);

export const getHedgeFunds = (symbol: string) =>
  getJSON<HedgeFundsResponse>(`/api/research/hedge-funds/${symbol}`);

export const getInsiders = (symbol: string) =>
  getJSON<InsidersResponse>(`/api/research/insiders/${symbol}`);

export const getRelatedTickers = (symbol: string) =>
  getJSON<RelatedTickersResponse>(`/api/research/related-tickers/${symbol}`);

export const getHolderDemographics = (symbol: string) =>
  getJSON<HolderDemographicsResponse>(
    `/api/research/holder-demographics/${symbol}`,
  );

// Full catalogue symbol universe per asset class (DB-backed; tradable +
// enriched). Fetched once and cached stale-while-revalidate to validate
// tickers in the Ask-anything router.
export interface AssetSymbols {
  us_equity: string[];
  crypto: string[];
}

export const getAssetSymbols = () =>
  getJSON<AssetSymbols>("/api/asset-symbols");

// ── Ask anything AI ────────────────────────────────────────────────────────
// One-shot Q&A against /api/ai/ask. The endpoint resolves backend read
// tools server-side; no frontend tool loop. 503 → "AI not configured"
// (env unset on the backend); the frontend keys off that to render a
// useful error rather than a generic crash.

export interface AiAskToolCall {
  name: string;
  ok: boolean;
}

export interface AiAskReport {
  filename: string;
  csv: string;
}

export interface AiAskResponse {
  text: string;
  tool_calls: AiAskToolCall[];
  reports?: AiAskReport[];
  // Deferred client-side Workspace directives the bot wants applied (replayed
  // by the FallbackCard against the Workspace controller).
  workspace_actions?: SiloedAction[];
  usage: Record<string, unknown> | null;
  backend_stopped?: "" | "max_iterations";
}

export interface AiAskMessage {
  role: "user" | "assistant";
  content: unknown;
}

export const postAiAsk = (
  message: string,
  history: AiAskMessage[] = [],
  assetClass?: "stocks" | "crypto" | "cfd",
): Promise<AiAskResponse> =>
  sendJSON<AiAskResponse>("POST", "/api/ai/ask", {
    message,
    history,
    asset_class: assetClass,
    // Device hint so the bot can size custom Workspace grids to the viewport.
    viewport:
      typeof window !== "undefined"
        ? { width: window.innerWidth, height: window.innerHeight }
        : undefined,
  });

export const getMarketNews = (limit = 20) =>
  getJSON<MarketNewsResponse>(`/api/market-news?limit=${limit}`);

export const getNews = (symbol: string, limit = 10) =>
  getJSON<{ symbol: string; news: NewsItem[] }>(
    `/api/news?symbol=${encodeURIComponent(symbol.toUpperCase())}&limit=${limit}`,
  );

export const getWatchlist = () =>
  getJSON<{ symbols: string[] }>("/api/watchlist");

export const addToWatchlist = (symbol: string) =>
  sendJSON<{ symbols: string[] }>("POST", "/api/watchlist", { symbol });

export const removeFromWatchlist = (symbol: string) =>
  sendJSON<{ symbols: string[] }>("DELETE", `/api/watchlist/${symbol}`);

// Fire-and-forget ping to keep the Render relay warm (prevent spindown).
// Only fires when a dedicated relay is configured; no-ops on Vercel-only setups.
export function pingRelayHealth(): void {
  if (!STREAM_BASE || STREAM_BASE === API_BASE) return;
  fetch(`${STREAM_BASE}/api/health`).catch(() => {});
}

export const getCryptoWatchlist = () =>
  getJSON<{ symbols: string[] }>("/api/watchlist?asset_class=crypto");

export const addToCryptoWatchlist = (symbol: string) =>
  sendJSON<{ symbols: string[] }>("POST", "/api/watchlist?asset_class=crypto", { symbol });

export const removeFromCryptoWatchlist = (symbol: string) =>
  sendJSON<{ symbols: string[] }>("DELETE", `/api/watchlist/${symbol}?asset_class=crypto`);

export const getCryptoTickers = () =>
  getJSON<{ tickers: Snapshot[] }>("/api/crypto/tickers");

// --- Write path (Stage 2 backend). ---------------------------------------

export const submitOrder = (input: SubmitOrderInput) =>
  sendJSON<Order>("POST", "/api/orders", input);

export const replaceOrder = (id: string, input: ReplaceOrderInput) =>
  sendJSON<Order>("PATCH", `/api/orders/${encodeURIComponent(id)}`, input);

export const cancelOrder = (id: string) =>
  sendJSON<{ cancelled: string[] }>(
    "DELETE",
    `/api/orders/${encodeURIComponent(id)}`,
  );

export const cancelAllOrders = () =>
  sendJSON<{ cancelled: string[] }>("DELETE", "/api/orders");

export const closePosition = (symbol: string) =>
  sendJSON<Order>("DELETE", `/api/positions/${symbol}`);

export const closeAllPositions = () =>
  sendJSON<{ closed: string[] }>("DELETE", "/api/positions");

// Backend stream events carry a `kind` discriminator. Bars include
// canonical OHLCV from Alpaca's 1-minute aggregates (no bid/ask
// approximation).
export interface BarTick {
  kind: "bar";
  symbol: string;
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

function warnNoRelay() {
  if (STREAM_BASE === API_BASE) {
    // No dedicated relay configured (VITE_STREAM_BASE unset): the stream
    // hits the serverless API base, which cannot hold SSE open, so it
    // will connect then drop straight to polling. Surface why.
    console.warn(
      "[stream] VITE_STREAM_BASE not set; /api/stream points at the " +
        "serverless API base and will fall back to polling. Set it to the " +
        "persistent relay host to enable real-time streaming.",
    );
  }
}

// Subscribe to the real-time quote stream for the given symbols. Calls
// onQuote per tick and onError once if the stream can't be established
// (caller should then fall back to polling). Returns an unsubscribe
// function. EventSource is receive-only, so a symbol-set change means
// closing this stream and opening a new one.
export function streamQuotes(
  symbols: string[],
  onQuote: (q: Quote) => void,
  onError: () => void,
): () => void {
  warnNoRelay();
  const qs = encodeURIComponent(symbols.join(","));
  const es = new EventSource(
    `${STREAM_BASE}/api/stream?symbols=${qs}&kinds=quote`,
  );
  es.onmessage = (e) => {
    try {
      const ev = JSON.parse(e.data) as Quote & { kind?: string };
      if (ev.kind && ev.kind !== "quote") return;
      onQuote(ev as Quote);
    } catch {
      /* ignore keepalive / malformed frames */
    }
  };
  es.onerror = () => {
    // Disable EventSource's own reconnect; we fall back to polling instead.
    es.close();
    onError();
  };
  return () => es.close();
}

// Subscribe to real-time 1-minute bars (Alpaca's `subscribe_bars` on
// the shared upstream). Each tick is a complete OHLCV bar, replacing
// the bid/ask approximation the TV datafeed used to do.
export function streamBars(
  symbols: string[],
  onBar: (b: BarTick) => void,
  onError: () => void,
): () => void {
  warnNoRelay();
  const qs = encodeURIComponent(symbols.join(","));
  const es = new EventSource(
    `${STREAM_BASE}/api/stream?symbols=${qs}&kinds=bar`,
  );
  es.onmessage = (e) => {
    try {
      const ev = JSON.parse(e.data) as BarTick;
      if (ev.kind !== "bar") return;
      onBar(ev);
    } catch {
      /* ignore keepalive / malformed frames */
    }
  };
  es.onerror = () => {
    es.close();
    onError();
  };
  return () => es.close();
}

// ── FXCM bridge API (/api/fxcm/*) ────────────────────────────────────────────
//
// FXCM endpoints live behind the Render relay (the Java bridge co-runs with
// FastAPI there). Vercel's serverless container has no bridge, so we hit the
// Render origin directly via STREAM_BASE instead of going through API_BASE.
// Locally STREAM_BASE is empty → relative URLs hit the Vite proxy as before.

async function getFxcmJSON<T>(path: string): Promise<T> {
  const res = await fetch(`${STREAM_BASE}${path}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(formatDetail(body.detail, res.status));
  }
  return res.json() as Promise<T>;
}

async function sendFxcmJSON<T>(
  method: "POST" | "PATCH" | "DELETE",
  path: string,
  body?: unknown,
): Promise<T> {
  const res = await fetch(`${STREAM_BASE}${path}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(formatDetail(errBody.detail, res.status));
  }
  return res.json() as Promise<T>;
}

export const getFxcmHealth = () =>
  getFxcmJSON<{ status: string; account: string }>("/api/fxcm/health");

export const getFxcmAccount = () =>
  getFxcmJSON<FxcmAccount>("/api/fxcm/account");

export const getFxcmPrices = (instrument?: string) =>
  getFxcmJSON<FxcmPrice[]>(
    `/api/fxcm/prices${instrument ? `?instrument=${encodeURIComponent(instrument)}` : ""}`,
  );

// Subscribe to the live FXCM price stream (Scalp mode + alert engine). Each SSE
// frame is an array of changed FxcmPrice rows (the subscribed/status-T set is
// driven server-side by the watchlist/view logic, not this connection). Calls
// onTick per frame; onError once if the stream can't be held open (caller falls
// back to polling /prices). Returns an unsubscribe. Hits STREAM_BASE (Render) —
// Vercel's serverless container can't hold SSE open.
export function streamFxcmPrices(
  onTick: (prices: FxcmPrice[]) => void,
  onError: () => void,
): () => void {
  warnNoRelay();
  const es = new EventSource(`${STREAM_BASE}/api/fxcm/stream`);
  es.onmessage = (e) => {
    try {
      const rows = JSON.parse(e.data) as FxcmPrice[];
      if (Array.isArray(rows) && rows.length) onTick(rows);
    } catch {
      /* ignore keepalive / malformed frames */
    }
  };
  es.onerror = () => {
    es.close();
    onError();
  };
  return () => es.close();
}

export const getFxcmWatchlist = () =>
  getFxcmJSON<FxcmPrice[]>("/api/fxcm/watchlist");

export const addFxcmWatchlistInstrument = (instrument: string) =>
  sendFxcmJSON<FxcmPrice[]>("POST", "/api/fxcm/watchlist", { instrument });

export const removeFxcmWatchlistInstrument = (instrument: string) =>
  sendFxcmJSON<FxcmPrice[]>("DELETE", `/api/fxcm/watchlist/${instrument}`);

// Report the CFD instruments currently on screen so the bridge subscribes them
// (status T → live prices) and returns stale ones to D. Best-effort.
export const setFxcmView = (instruments: string[]) =>
  sendFxcmJSON<{ view: number; subscribed: number }>("POST", "/api/fxcm/view", {
    instruments,
  });

export const getFxcmPositions = () =>
  getFxcmJSON<FxcmPosition[]>("/api/fxcm/positions");

export interface FxcmInstrument {
  instrument: string;
  offer_id?: string;
  status?: string;
}

// Bridge's /instruments returns raw FCLite InstrumentInfo with capitalized
// keys (Name/OfferId/Status) — unlike /watchlist /prices /positions which use
// lowercase. Normalize at the API edge so callers see the same shape across
// FXCM endpoints. (Bridge-side normalization is backlogged.)
export const getFxcmInstruments = async (filter?: { tradable?: boolean }): Promise<FxcmInstrument[]> => {
  const params = new URLSearchParams();
  if (filter?.tradable) params.set("tradable", "true");
  const qs = params.toString();
  const raw = await getFxcmJSON<{ Name?: string; OfferId?: string; Status?: string }[]>(
    `/api/fxcm/instruments${qs ? `?${qs}` : ""}`,
  );
  return raw
    .filter((i) => !!i.Name)
    .map((i) => ({ instrument: i.Name!, offer_id: i.OfferId, status: i.Status }));
};

export const getFxcmHistory = (
  instrument: string,
  timeframe = "H1",
  dateFrom?: string,
  dateTo?: string,
) => {
  const params = new URLSearchParams({ instrument, timeframe });
  if (dateFrom) params.set("from", dateFrom);
  if (dateTo) params.set("to", dateTo);
  return getFxcmJSON<FxcmBar[]>(`/api/fxcm/history?${params}`);
};

export interface FxcmOrderRequest {
  instrument: string;
  buy_sell: "B" | "S";
  amount: number;
  order_type?: "OM" | "SE" | "LE";
  rate?: number;
  stop?: number;
  limit?: number;
}

export const submitFxcmOrder = (order: FxcmOrderRequest) =>
  sendFxcmJSON<{ status: string; order_id?: string }>("POST", "/api/fxcm/order", order);

export const closeFxcmPosition = (tradeId: string | number, amount = 0) =>
  sendFxcmJSON<{ status: string; trade_id?: string }>("POST", "/api/fxcm/close", {
    trade_id: String(tradeId),
    amount,
  });

export const getFxcmOrders = () => getFxcmJSON<FxcmOrder[]>("/api/fxcm/orders");

export const cancelFxcmOrder = (orderId: string) =>
  sendFxcmJSON<{ status: string; order_id?: string }>(
    "DELETE",
    `/api/fxcm/order/${encodeURIComponent(orderId)}`,
  );

export const modifyFxcmOrder = (
  orderId: string,
  body: { rate?: number; stop?: number; limit?: number },
) =>
  sendFxcmJSON<{ status: string; order_id?: string }>(
    "PATCH",
    `/api/fxcm/order/${encodeURIComponent(orderId)}`,
    body,
  );

export const getFxcmClosedTrades = () =>
  getFxcmJSON<FxcmClosedTrade[]>("/api/fxcm/closed_trades");

// display-names and underlying-units are DB-only (no bridge) — use API_BASE (Vercel).
export const getFxcmDisplayNames = () =>
  getJSON<Record<string, string>>("/api/fxcm/display-names");

export const getFxcmUnderlyingUnits = () =>
  getJSON<Record<string, string>>("/api/fxcm/underlying-units");

export const searchFxcmInstruments = (q: string) =>
  getJSON<Array<{ name: string; display_name: string | null; description: string | null; type: string | null }>>(
    `/api/fxcm/search-instruments?q=${encodeURIComponent(q)}`,
  );
