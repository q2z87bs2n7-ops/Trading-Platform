import type { FxcmClosedTrade } from "../types";

const round2 = (n: number) => Math.round(n * 100) / 100;

// Cumulative realized-P/L curve from FXCM closed trades. Unlike the Alpaca
// path (alpaca/pnl.py) no FIFO matching or historical-close valuation is
// needed: FCLite already nets each closed position into a realized `pl`
// (account ccy) stamped with a `close_time`, so the curve is just a
// day-grouped running sum anchored at 0 before the first close.
//
// `liveTip` (the account's current open unrealized P/L, i.e. equity − balance)
// is appended as a final point so the curve ends on the live figure — the same
// reason the stocks/crypto curve ends on live market value rather than a stale
// daily close. Returns [] when there's nothing to draw (caller shows a
// placeholder). Covers only the window the bridge's closed-position snapshot
// exposes (typically recent/session history).
export function buildClosedTradePnl(
  trades: FxcmClosedTrade[] | undefined,
  liveTip?: number,
): number[] {
  if (!Array.isArray(trades)) return [];
  const rows = trades
    .filter((t) => t.close_time && typeof t.pl === "number" && !isNaN(t.pl))
    .map((t) => ({ day: String(t.close_time).slice(0, 10), pl: t.pl as number }))
    .sort((a, b) => a.day.localeCompare(b.day));
  if (rows.length === 0) return [];

  const out: number[] = [0]; // entry anchor so a single day still draws a line
  let cum = 0;
  let curDay = rows[0].day;
  for (const r of rows) {
    if (r.day !== curDay) {
      out.push(round2(cum));
      curDay = r.day;
    }
    cum += r.pl;
  }
  out.push(round2(cum));

  if (typeof liveTip === "number" && !isNaN(liveTip)) {
    out.push(round2(cum + liveTip));
  }
  return out;
}
