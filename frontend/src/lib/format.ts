/** Shared formatters used across cards/components.
 *  Keep this file free of React / hook imports. */

export function relTime(ts: number): string {
  const diff = Math.max(0, Date.now() / 1000 - ts);
  if (diff < 60) return "now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

export const money = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD" });

export function fmtCryptoPrice(n: number): string {
  const abs = Math.abs(n);
  const dec = abs >= 1 ? 2 : abs >= 0.01 ? 4 : abs >= 0.0001 ? 6 : 8;
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: dec,
    maximumFractionDigits: dec,
  });
}

// Per-type digit precision for FXCM CFD instruments. JPY pairs trade in
// 3dp, metals in 4dp, indices in 1dp, stock-CFDs (`RBLX.us`-style) in 2dp,
// everything else (standard FX) in 5dp. The bridge sends `digits` per row
// when it can; this is the structural fallback when it doesn't.
export function cfdDigits(symbol: string): number {
  if (!symbol) return 5;
  if (/\.[a-z]{2,3}$/i.test(symbol)) return 2;
  if (symbol.includes("JPY")) return 3;
  if (/^XA[GU]\//.test(symbol)) return 4;
  if (symbol.includes("/")) return 5;
  return 1;
}

export function fmtCfdPrice(price: number | undefined, symbol?: string): string {
  if (price == null || Number.isNaN(price)) return "—";
  return price.toFixed(cfdDigits(symbol ?? ""));
}

export const pct = (n: number) =>
  `${n >= 0 ? "+" : ""}${(n * 100).toFixed(2)}%`;

export const compact = (n: number): string => {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
};
