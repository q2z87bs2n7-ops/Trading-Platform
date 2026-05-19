import { useAccount } from "../data/hooks";

const money = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD" });

export default function AccountSummary() {
  const { data: acct, error, isPending } = useAccount();

  return (
    <div className="bg-panel border border-border rounded-lg p-3">
      <h2 className="text-[13px] uppercase tracking-wide text-muted m-0 mb-2">Account</h2>
      {error && <div className="text-red text-[13px]">{error.message}</div>}
      {!error && isPending && <div className="text-xs text-muted">Loading…</div>}
      {acct && (
        <>
          <div className="flex justify-between py-1 text-[13px]">
            <span className="text-muted">Equity</span>
            <span className="tabular-nums">{money(acct.equity)}</span>
          </div>
          <div className="flex justify-between py-1 text-[13px]">
            <span className="text-muted">Cash</span>
            <span className="tabular-nums">{money(acct.cash)}</span>
          </div>
          <div className="flex justify-between py-1 text-[13px]">
            <span className="text-muted">Buying Power</span>
            <span className="tabular-nums">{money(acct.buying_power)}</span>
          </div>
          <div className="flex justify-between py-1 text-[13px]">
            <span className="text-muted">Portfolio Value</span>
            <span className="tabular-nums">{money(acct.portfolio_value)}</span>
          </div>
          <div className="flex justify-between py-1 text-[13px]">
            <span className="text-muted">Status</span>
            <span className="text-xs text-muted">{acct.status}</span>
          </div>
        </>
      )}
    </div>
  );
}
