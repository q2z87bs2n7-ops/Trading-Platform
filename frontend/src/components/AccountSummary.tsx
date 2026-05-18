import { useAccount } from "../data/hooks";

const money = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD" });

export default function AccountSummary() {
  const { data: acct, error, isPending } = useAccount();

  return (
    <div className="panel">
      <h2>Account</h2>
      {error && <div className="error">{error.message}</div>}
      {!error && isPending && <div className="tag">Loading…</div>}
      {acct && (
        <>
          <div className="row">
            <span className="label">Equity</span>
            <span className="price">{money(acct.equity)}</span>
          </div>
          <div className="row">
            <span className="label">Cash</span>
            <span className="price">{money(acct.cash)}</span>
          </div>
          <div className="row">
            <span className="label">Buying Power</span>
            <span className="price">{money(acct.buying_power)}</span>
          </div>
          <div className="row">
            <span className="label">Portfolio Value</span>
            <span className="price">{money(acct.portfolio_value)}</span>
          </div>
          <div className="row">
            <span className="label">Status</span>
            <span className="tag">{acct.status}</span>
          </div>
        </>
      )}
    </div>
  );
}
