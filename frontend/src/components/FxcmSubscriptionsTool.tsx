import { useState } from "react";

import * as api from "../api";
import { showToast } from "../lib/toast";

// Developer tool (Settings → Developer): surface the FXCM subscription status
// (T / V / D) of every instrument and, prominently, of the user's watchlist —
// the set Scalp trades. An instrument that stays D can't be promoted to T from
// here (the demo account just lacks its market-data subscription), so seeing it
// explains "no live price" without guessing. Fetches on demand (it hits the
// bridge for the full ~500-instrument list).

const STATUS_META: Record<string, { label: string; color: string }> = {
  T: { label: "Tradable · live", color: "var(--pos)" },
  V: { label: "Priced · view-only", color: "oklch(72% 0.18 55)" },
  D: { label: "Not subscribed", color: "var(--neg)" },
};

function StatusDot({ status }: { status: string }) {
  const color = STATUS_META[status]?.color ?? "var(--mute)";
  return (
    <span
      className="inline-flex items-center gap-1.5 tabular-nums"
      style={{ color, fontSize: 11, fontWeight: 600 }}
    >
      <span style={{ width: 7, height: 7, borderRadius: 999, background: color }} aria-hidden />
      {status || "?"}
    </span>
  );
}

interface Snapshot {
  counts: Record<string, number>;
  watchlist: { instrument: string; status: string }[];
}

export default function FxcmSubscriptionsTool() {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<Snapshot | null>(null);

  async function check() {
    setLoading(true);
    try {
      const [instruments, wl] = await Promise.all([
        api.getFxcmInstruments(),
        api.getFxcmWatchlist().catch(() => [] as Awaited<ReturnType<typeof api.getFxcmWatchlist>>),
      ]);
      const statusByInstrument = new Map<string, string>();
      const counts: Record<string, number> = {};
      for (const i of instruments) {
        const st = (i.status || "?").toUpperCase();
        statusByInstrument.set(i.instrument, st);
        counts[st] = (counts[st] || 0) + 1;
      }
      const watchlist = wl
        .map((p) => ({ instrument: p.instrument, status: statusByInstrument.get(p.instrument) ?? "?" }))
        // Surface the problem ones (anything not Tradable) first.
        .sort((a, b) => (a.status === "T" ? 1 : 0) - (b.status === "T" ? 1 : 0));
      setData({ counts, watchlist });
    } catch (e) {
      showToast(`Subscription check failed: ${(e as Error).message}`, "error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-col min-w-0">
          <span className="text-[13px] font-medium">FXCM subscriptions</span>
          <span className="text-[12px] mt-0.5 leading-snug" style={{ color: "var(--mute)" }}>
            T/V/D status per instrument. A watchlist row stuck on D has no live
            price and can't be promoted here (account data-subscription limit).
          </span>
        </div>
        <button
          type="button"
          onClick={check}
          disabled={loading}
          className="text-[12px] font-medium cursor-pointer shrink-0"
          style={{
            padding: "5px 10px",
            background: "transparent",
            border: "1px solid var(--border-2)",
            color: "var(--text-2)",
            borderRadius: "var(--r)",
            opacity: loading ? 0.6 : 1,
          }}
        >
          {loading ? "Checking…" : data ? "Refresh" : "Check"}
        </button>
      </div>

      {data && (
        <>
          {/* Global counts */}
          <div className="flex items-center gap-3 flex-wrap text-[11px]">
            {Object.entries(data.counts)
              .sort((a, b) => b[1] - a[1])
              .map(([st, n]) => (
                <span key={st} className="inline-flex items-center gap-1.5">
                  <StatusDot status={st} />
                  <span className="tabular-nums" style={{ color: "var(--mute)" }}>{n}</span>
                </span>
              ))}
          </div>

          {/* Watchlist (the Scalp set) */}
          <div
            className="rounded-card overflow-hidden"
            style={{ border: "1px solid var(--hairline)", maxHeight: 220, overflowY: "auto" }}
          >
            <div
              className="px-2.5 py-1.5 text-[10.5px] uppercase font-semibold"
              style={{ color: "var(--mute)", letterSpacing: "0.05em", background: "var(--panel-2)" }}
            >
              Watchlist · {data.watchlist.length}
            </div>
            {data.watchlist.length === 0 ? (
              <div className="px-2.5 py-3 text-[12px]" style={{ color: "var(--mute)" }}>
                No watchlist instruments.
              </div>
            ) : (
              data.watchlist.map((r) => (
                <div
                  key={r.instrument}
                  className="px-2.5 py-1.5 flex items-center justify-between gap-3"
                  style={{ borderTop: "1px solid var(--hairline)" }}
                  title={STATUS_META[r.status]?.label ?? "Unknown"}
                >
                  <span className="text-[12px] font-medium truncate">{r.instrument}</span>
                  <StatusDot status={r.status} />
                </div>
              ))
            )}
          </div>

          <div className="text-[10.5px] leading-snug" style={{ color: "var(--mute)" }}>
            T = tradable/live · V = priced, view-only · D = not subscribed.
          </div>
        </>
      )}
    </div>
  );
}
