import { usePortfolioHistory } from "../data/hooks";

const money = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD" });

const last = (a: number[] | undefined) =>
  a && a.length ? a[a.length - 1] : 0;

export default function PortfolioSummary() {
  const { data: h, error, isPending } = usePortfolioHistory("1M", "1D");

  const equity = last(h?.equity);
  const pl = last(h?.profit_loss);
  const plpc = last(h?.profit_loss_pct);
  const up = pl >= 0;

  return (
    <div className="bg-panel border border-border rounded-lg p-4">
      <h2 className="text-[13px] uppercase tracking-wide text-muted m-0 mb-3">Portfolio (1M)</h2>
      {error && <div className="text-red text-[13px]">{error.message}</div>}
      {!error && isPending && <div className="text-xs text-muted">Loading…</div>}
      {h && (
        <>
          <div className="flex justify-between py-1.5 text-[14px]">
            <span className="text-muted">Equity</span>
            <span className="tabular-nums">{money(equity)}</span>
          </div>
          <div className="flex justify-between py-1.5 text-[14px]">
            <span className="text-muted">Period P/L</span>
            <span
              className="tabular-nums"
              style={{ color: up ? "var(--green)" : "var(--red)" }}
            >
              {up ? "+" : ""}
              {money(pl)} ({(plpc * 100).toFixed(2)}%)
            </span>
          </div>
          <div className="flex justify-between py-1.5 text-[14px]">
            <span className="text-muted">Base Value</span>
            <span className="tabular-nums">{money(h.base_value)}</span>
          </div>
        </>
      )}
    </div>
  );
}
