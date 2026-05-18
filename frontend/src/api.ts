import type {
  Account,
  Activity,
  Asset,
  Bar,
  CalendarDay,
  MarketClock,
  Order,
  PortfolioHistory,
  Position,
  Quote,
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

async function getJSON<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}));
    throw new Error(detail.detail || `Request failed: ${res.status}`);
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

// Subscribe to the real-time quote stream. Calls onQuote per tick and
// onError once if the stream can't be established (caller should then fall
// back to polling). Returns an unsubscribe function.
export function streamQuotes(
  onQuote: (q: Quote) => void,
  onError: () => void,
): () => void {
  const es = new EventSource(`${STREAM_BASE}/api/stream`);
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
