import { useEffect, useState } from "react";
import { getPortfolioHistory } from "../api";
import type { PortfolioHistory } from "../types";

const money = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD" });

const last = (a: number[] | undefined) =>
  a && a.length ? a[a.length - 1] : 0;

export default function PortfolioSummary() {
  const [h, setH] = useState<PortfolioHistory | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () =>
      getPortfolioHistory("1M", "1D")
        .then((d) => alive && (setH(d), setErr(null)))
        .catch((e) => alive && setErr(e.message));
    load();
    const id = setInterval(load, 60000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  const equity = last(h?.equity);
  const pl = last(h?.profit_loss);
  const plpc = last(h?.profit_loss_pct);
  const up = pl >= 0;

  return (
    <div className="panel">
      <h2>Portfolio (1M)</h2>
      {err && <div className="error">{err}</div>}
      {!h && !err && <div className="tag">Loading…</div>}
      {h && (
        <>
          <div className="row">
            <span className="label">Equity</span>
            <span className="price">{money(equity)}</span>
          </div>
          <div className="row">
            <span className="label">Period P/L</span>
            <span
              className="price"
              style={{ color: up ? "var(--green)" : "var(--red)" }}
            >
              {up ? "+" : ""}
              {money(pl)} ({(plpc * 100).toFixed(2)}%)
            </span>
          </div>
          <div className="row">
            <span className="label">Base Value</span>
            <span className="price">{money(h.base_value)}</span>
          </div>
        </>
      )}
    </div>
  );
}
