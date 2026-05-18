import { useClock } from "../data/hooks";

const when = (ts: number) => new Date(ts * 1000).toLocaleString();

export default function MarketClock() {
  const { data: c, error, isPending } = useClock();

  return (
    <div className="panel">
      <h2>Market</h2>
      {error && <div className="error">{error.message}</div>}
      {!error && isPending && <div className="tag">Loading…</div>}
      {c && (
        <>
          <div className="row">
            <span className="label">Status</span>
            <span
              className="price"
              style={{ color: c.is_open ? "var(--green)" : "var(--red)" }}
            >
              {c.is_open ? "OPEN" : "CLOSED"}
            </span>
          </div>
          <div className="row">
            <span className="label">Next Open</span>
            <span className="tag">{when(c.next_open)}</span>
          </div>
          <div className="row">
            <span className="label">Next Close</span>
            <span className="tag">{when(c.next_close)}</span>
          </div>
        </>
      )}
    </div>
  );
}
