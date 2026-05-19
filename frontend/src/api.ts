import type {
  Account,
  Activity,
  Asset,
  Bar,
  CalendarDay,
  MarketClock,
  MostActivesResponse,
  MoversResponse,
  NewsArticle,
  Order,
  PortfolioHistory,
  Position,
  Quote,
  ReplaceOrderInput,
  SubmitOrderInput,
} from "./types";

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
  getJSON<{ symbols: string[]; feed: string; paper: boolean }>("/api/config");

export const getAccount = () => getJSON<Account>("/api/account");

export const getBars = (symbol: string, timeframe = "1Day", limit = 120) =>
  getJSON<{ symbol: string; bars: Bar[] }>(
    `/api/bars?symbol=${encodeURIComponent(symbol)}&timeframe=${timeframe}&limit=${limit}`,
  );

export const getNews = (symbol: string, limit = 10) =>
  getJSON<{ symbol: string; news: NewsArticle[] }>(
    `/api/news?symbol=${encodeURIComponent(symbol)}&limit=${limit}`,
  );

export const getMovers = (top = 10) =>
  getJSON<MoversResponse>(`/api/movers?top=${top}`);

export const getMostActives = (top = 10, by: "volume" | "trades" = "volume") =>
  getJSON<MostActivesResponse>(`/api/most-active?top=${top}&by=${by}`);

export const getQuotes = (symbols: string[]) =>
  getJSON<{ quotes: Quote[] }>(
    `/api/quotes?symbols=${encodeURIComponent(symbols.join(","))}`,
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

export const getCalendar = (start?: string, end?: string) =>
  getJSON<{ calendar: CalendarDay[] }>(
    `/api/calendar?start=${start ?? ""}&end=${end ?? ""}`,
  );

export const getAsset = (symbol: string) =>
  getJSON<Asset>(`/api/assets/${encodeURIComponent(symbol)}`);

export const searchAssets = (search: string, limit = 25) =>
  getJSON<Asset[]>(
    `/api/assets?search=${encodeURIComponent(search)}&limit=${limit}`,
  );

export const getWatchlist = () =>
  getJSON<{ symbols: string[] }>("/api/watchlist");

export const addToWatchlist = (symbol: string) =>
  sendJSON<{ symbols: string[] }>("POST", "/api/watchlist", { symbol });

export const removeFromWatchlist = (symbol: string) =>
  sendJSON<{ symbols: string[] }>(
    "DELETE",
    `/api/watchlist/${encodeURIComponent(symbol)}`,
  );

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
  sendJSON<Order>("DELETE", `/api/positions/${encodeURIComponent(symbol)}`);

export const closeAllPositions = () =>
  sendJSON<{ closed: string[] }>("DELETE", "/api/positions");

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
  const qs = encodeURIComponent(symbols.join(","));
  const es = new EventSource(`${STREAM_BASE}/api/stream?symbols=${qs}`);
  es.onmessage = (e) => {
    try {
      onQuote(JSON.parse(e.data) as Quote);
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
