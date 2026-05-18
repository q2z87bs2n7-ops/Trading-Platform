import type { Account, Bar, Quote } from "./types";

async function getJSON<T>(url: string): Promise<T> {
  const res = await fetch(url);
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
