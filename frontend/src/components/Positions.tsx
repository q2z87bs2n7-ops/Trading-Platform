import { useClosePosition, useCloseAllPositions, usePositions } from "../data/hooks";

const money = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD" });
const pct = (n: number) => `${(n * 100).toFixed(2)}%`;

const signed = (n: number) => (n >= 0 ? "var(--green)" : "var(--red)");

const TH = "px-2 py-1 text-right font-medium text-[11px] uppercase tracking-wide text-muted border-b border-border whitespace-nowrap";
const TD = "px-2 py-1 text-right border-b border-white/5 whitespace-nowrap";

export default function Positions() {
  const { data, error, isPending } = usePositions();
  const close = useClosePosition();
  const closeAll = useCloseAllPositions();
  const rows = data?.positions;

  return (
    <div className="bg-panel border border-border rounded-lg p-3">
      <h2 className="text-[13px] uppercase tracking-wide text-muted m-0 mb-2">
        Open Positions
        {rows && rows.length > 0 && (
          <button
            className="btn btn-mini btn-danger float-right -mt-0.5"
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
      {error && <div className="text-red text-[13px]">{error.message}</div>}
      {!error && isPending && <div className="text-xs text-muted">Loading…</div>}
      {rows && rows.length === 0 && (
        <div className="text-xs text-muted">No open positions</div>
      )}
      {(close.error || closeAll.error) && (
        <div className="text-red text-[13px]">
          {((close.error || closeAll.error) as Error).message}
        </div>
      )}
      {rows && rows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[13px] tabular-nums">
            <thead>
              <tr>
                <th className={`${TH} text-left`}>Symbol</th>
                <th className={TH}>Qty</th>
                <th className={TH}>Avg</th>
                <th className={TH}>Mark</th>
                <th className={TH}>Day</th>
                <th className={TH}>Value</th>
                <th className={TH}>Unreal P/L</th>
                <th className={`${TH} text-center`}></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => {
                const short = p.side?.toLowerCase().includes("short");
                return (
                  <tr key={p.symbol} className="hover:bg-white/[0.03]">
                    <td className={`${TD} text-left`}>
                      <span className="text-text font-semibold">{p.symbol}</span>
                      {short && <span className="text-muted"> SHORT</span>}
                    </td>
                    <td className={TD}>{p.qty}</td>
                    <td className={TD}>{money(p.avg_entry_price)}</td>
                    <td className={TD}>{money(p.current_price)}</td>
                    <td className={TD} style={{ color: signed(p.change_today) }}>
                      {p.change_today >= 0 ? "+" : ""}
                      {pct(p.change_today)}
                    </td>
                    <td className={TD}>{money(p.market_value)}</td>
                    <td className={TD} style={{ color: signed(p.unrealized_pl) }}>
                      {p.unrealized_pl >= 0 ? "+" : ""}
                      {money(p.unrealized_pl)} ({pct(p.unrealized_plpc)})
                    </td>
                    <td className={`${TD} text-center`}>
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
