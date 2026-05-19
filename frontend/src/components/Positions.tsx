import { useClosePosition, useCloseAllPositions, usePositions } from "../data/hooks";

const money = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD" });
const pct = (n: number) => `${(n * 100).toFixed(2)}%`;

export default function Positions() {
  const { data, error, isPending } = usePositions();
  const close = useClosePosition();
  const closeAll = useCloseAllPositions();
  const rows = data?.positions;

  return (
    <div className="panel">
      <h2>
        Open Positions
        {rows && rows.length > 0 && (
          <button
            className="btn btn-mini btn-danger panel-action"
            type="button"
            disabled={closeAll.isPending}
            onClick={() =>
              window.confirm("Close ALL open positions?") && closeAll.mutate()
            }
          >
            close all
          </button>
        )}
      </h2>
      {error && <div className="error">{error.message}</div>}
      {!error && isPending && <div className="tag">Loading…</div>}
      {rows && rows.length === 0 && <div className="tag">No open positions</div>}
      {(close.error || closeAll.error) && (
        <div className="error">
          {((close.error || closeAll.error) as Error).message}
        </div>
      )}
      {rows &&
        rows.map((p) => {
          const up = p.unrealized_pl >= 0;
          const short = p.side?.toLowerCase().includes("short");
          const dayUp = p.change_today >= 0;
          return (
            <div className="row" key={p.symbol}>
              <span
                style={{ display: "flex", flexDirection: "column", gap: 2 }}
              >
                <span className="label">
                  {short ? "SHORT " : ""}
                  {p.symbol} · {p.qty} @ {money(p.avg_entry_price)}
                </span>
                <span className="tag">
                  mark {money(p.current_price)} · day {dayUp ? "+" : ""}
                  {pct(p.change_today)} · basis {money(p.cost_basis)}
                </span>
              </span>
              <span className="order-actions">
                <span
                  className="price"
                  style={{ color: up ? "var(--green)" : "var(--red)" }}
                >
                  {money(p.market_value)} ({up ? "+" : ""}
                  {money(p.unrealized_pl)} / {pct(p.unrealized_plpc)})
                </span>
                <button
                  className="btn btn-mini btn-danger"
                  type="button"
                  disabled={close.isPending}
                  onClick={() =>
                    window.confirm(`Close ${p.symbol} (${p.qty})?`) &&
                    close.mutate(p.symbol)
                  }
                >
                  close
                </button>
              </span>
            </div>
          );
        })}
    </div>
  );
}
