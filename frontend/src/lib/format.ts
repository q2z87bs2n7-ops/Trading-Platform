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

export const pct = (n: number) =>
  `${n >= 0 ? "+" : ""}${(n * 100).toFixed(2)}%`;

export const compact = (n: number): string => {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
};
