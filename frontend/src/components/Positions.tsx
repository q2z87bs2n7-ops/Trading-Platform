import { useClosePosition, useCloseAllPositions, usePositions } from "../data/hooks";

const money = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD" });
const pct = (n: number) => `${(n * 100).toFixed(2)}%`;

const signed = (n: number) => (n >= 0 ? "var(--green)" : "var(--red)");

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
      {rows && rows.length > 0 && (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Symbol</th>
                <th>Qty</th>
                <th>Avg</th>
                <th>Mark</th>
                <th>Day</th>
                <th>Value</th>
                <th>Unreal P/L</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => {
                const short = p.side?.toLowerCase().includes("short");
                return (
                  <tr key={p.symbol}>
                    <td>
                      <span className="sym">{p.symbol}</span>
                      {short && <span className="muted"> SHORT</span>}
                    </td>
                    <td>{p.qty}</td>
                    <td>{money(p.avg_entry_price)}</td>
                    <td>{money(p.current_price)}</td>
                    <td style={{ color: signed(p.change_today) }}>
                      {p.change_today >= 0 ? "+" : ""}
                      {pct(p.change_today)}
                    </td>
                    <td>{money(p.market_value)}</td>
                    <td style={{ color: signed(p.unrealized_pl) }}>
                      {p.unrealized_pl >= 0 ? "+" : ""}
                      {money(p.unrealized_pl)} ({pct(p.unrealized_plpc)})
                    </td>
                    <td>
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
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
