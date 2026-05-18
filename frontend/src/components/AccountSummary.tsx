import { useEffect, useState } from "react";
import { getAccount } from "../api";
import type { Account } from "../types";

const money = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD" });

export default function AccountSummary() {
  const [acct, setAcct] = useState<Account | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () =>
      getAccount()
        .then((a) => alive && (setAcct(a), setErr(null)))
        .catch((e) => alive && setErr(e.message));
    load();
    const id = setInterval(load, 15000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  return (
    <div className="panel">
      <h2>Account</h2>
      {err && <div className="error">{err}</div>}
      {!acct && !err && <div className="tag">Loading…</div>}
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
