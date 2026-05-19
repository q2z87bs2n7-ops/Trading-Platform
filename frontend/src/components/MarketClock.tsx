import { useClock } from "../data/hooks";
import ErrorBanner from "./ErrorBanner";

const when = (ts: number) => new Date(ts * 1000).toLocaleString();

export default function MarketClock() {
  const { data: c, error, isPending } = useClock();

  return (
    <div className="bg-panel border border-border rounded-lg p-3">
      <h2 className="text-[13px] uppercase tracking-wide text-muted m-0 mb-2">Market</h2>
      {error && <ErrorBanner message={error.message} />}
      {!error && isPending && <div className="text-xs text-muted">Loading…</div>}
      {c && (
        <>
          <div className="flex justify-between py-1 text-[13px]">
            <span className="text-muted">Status</span>
            <span
              className="tabular-nums"
              style={{ color: c.is_open ? "var(--green)" : "var(--red)" }}
            >
              {c.is_open ? "OPEN" : "CLOSED"}
            </span>
          </div>
          <div className="flex justify-between py-1 text-[13px]">
            <span className="text-muted">Next Open</span>
            <span className="text-xs text-muted">{when(c.next_open)}</span>
          </div>
          <div className="flex justify-between py-1 text-[13px]">
            <span className="text-muted">Next Close</span>
            <span className="text-xs text-muted">{when(c.next_close)}</span>
          </div>
        </>
      )}
    </div>
  );
}
