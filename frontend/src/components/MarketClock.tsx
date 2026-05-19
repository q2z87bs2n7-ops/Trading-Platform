import { useClock } from "../data/hooks";

const when = (ts: number) => new Date(ts * 1000).toLocaleString();

export default function MarketClock() {
  const { data: c, error, isPending } = useClock();

  return (
    <div className="bg-panel border border-border rounded-lg p-4">
      <h2 className="text-[13px] uppercase tracking-wide text-muted m-0 mb-3">Market</h2>
      {error && <div className="text-red text-[13px]">{error.message}</div>}
      {!error && isPending && <div className="text-xs text-muted">Loading…</div>}
      {c && (
        <>
          <div className="flex justify-between py-1.5 text-[14px]">
            <span className="text-muted">Status</span>
            <span
              className="tabular-nums"
              style={{ color: c.is_open ? "var(--green)" : "var(--red)" }}
            >
              {c.is_open ? "OPEN" : "CLOSED"}
            </span>
          </div>
          <div className="flex justify-between py-1.5 text-[14px]">
            <span className="text-muted">Next Open</span>
            <span className="text-xs text-muted">{when(c.next_open)}</span>
          </div>
          <div className="flex justify-between py-1.5 text-[14px]">
            <span className="text-muted">Next Close</span>
            <span className="text-xs text-muted">{when(c.next_close)}</span>
          </div>
        </>
      )}
    </div>
  );
}
