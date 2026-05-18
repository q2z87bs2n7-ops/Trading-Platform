/**
 * THROWAWAY probe surface (open with #dev). Deliberately ugly: its only
 * job is to exercise every endpoint, place/cancel trades, search assets,
 * and watch quotes/positions/orders interact in real time so we can
 * assess data needs before any real frontend design. Delete before that.
 */
import { useEffect, useState } from "react";

import { getConfig } from "../api";
import {
  useAccount,
  useActivities,
  useAssetSearch,
  useCancelAllOrders,
  useCancelOrder,
  useCloseAllPositions,
  useClosePosition,
  useOrders,
  usePositions,
  useSubmitOrder,
} from "../data/hooks";
import { useLiveQuotes } from "../data/useLiveQuotes";
import type { SubmitOrderInput } from "../types";

const box: React.CSSProperties = {
  border: "1px solid #999",
  padding: 8,
  margin: 8,
  fontFamily: "monospace",
  fontSize: 12,
};

function Json({ v }: { v: unknown }) {
  return (
    <pre style={{ whiteSpace: "pre-wrap", margin: 0 }}>
      {JSON.stringify(v, null, 2)}
    </pre>
  );
}

export default function DevPanel() {
  const [symbols, setSymbols] = useState<string[]>([]);
  useEffect(() => {
    getConfig()
      .then((c) => setSymbols(c.symbols))
      .catch(() => setSymbols(["AAPL", "MSFT", "TSLA", "SPY"]));
  }, []);

  const account = useAccount();
  const positions = usePositions();
  const orders = useOrders("all");
  const activities = useActivities();
  const { quotes, error: quoteErr } = useLiveQuotes(symbols);

  const submit = useSubmitOrder();
  const cancel = useCancelOrder();
  const cancelAll = useCancelAllOrders();
  const close = useClosePosition();
  const closeAll = useCloseAllPositions();

  const [form, setForm] = useState<SubmitOrderInput>({
    symbol: "AAPL",
    side: "buy",
    type: "market",
    qty: 1,
  });
  const set = (p: Partial<SubmitOrderInput>) =>
    setForm((f) => ({ ...f, ...p }));

  const [search, setSearch] = useState("");
  const assets = useAssetSearch(search);

  return (
    <div style={{ fontFamily: "monospace" }}>
      <h2 style={{ margin: 8 }}>DEV PANEL — throwaway probe (#dev)</h2>

      <div style={box}>
        <strong>Account</strong> {account.isFetching ? "(loading)" : ""}
        {account.error ? (
          <div style={{ color: "red" }}>{String(account.error)}</div>
        ) : (
          <Json v={account.data} />
        )}
      </div>

      <div style={box}>
        <strong>Live quotes</strong>{" "}
        {quoteErr ? <span style={{ color: "orange" }}>{quoteErr}</span> : null}
        <Json v={quotes} />
      </div>

      <div style={box}>
        <strong>Order ticket</strong>
        <div>
          <input
            value={form.symbol}
            onChange={(e) => set({ symbol: e.target.value.toUpperCase() })}
            placeholder="symbol"
            size={8}
          />
          <select
            value={form.side}
            onChange={(e) => set({ side: e.target.value as "buy" | "sell" })}
          >
            <option value="buy">buy</option>
            <option value="sell">sell</option>
          </select>
          <select
            value={form.type}
            onChange={(e) =>
              set({ type: e.target.value as SubmitOrderInput["type"] })
            }
          >
            <option value="market">market</option>
            <option value="limit">limit</option>
            <option value="stop">stop</option>
            <option value="stop_limit">stop_limit</option>
            <option value="trailing_stop">trailing_stop</option>
          </select>
          <input
            type="number"
            value={form.qty ?? ""}
            onChange={(e) =>
              set({ qty: e.target.value ? Number(e.target.value) : undefined })
            }
            placeholder="qty"
            size={5}
          />
          <input
            type="number"
            value={form.limit_price ?? ""}
            onChange={(e) =>
              set({
                limit_price: e.target.value
                  ? Number(e.target.value)
                  : undefined,
              })
            }
            placeholder="limit"
            size={6}
          />
          <input
            type="number"
            value={form.stop_price ?? ""}
            onChange={(e) =>
              set({
                stop_price: e.target.value
                  ? Number(e.target.value)
                  : undefined,
              })
            }
            placeholder="stop"
            size={6}
          />
          <input
            type="number"
            value={form.trail_percent ?? ""}
            onChange={(e) =>
              set({
                trail_percent: e.target.value
                  ? Number(e.target.value)
                  : undefined,
              })
            }
            placeholder="trail %"
            size={6}
          />
          <button
            onClick={() => submit.mutate(form)}
            disabled={submit.isPending}
          >
            submit
          </button>
        </div>
        {submit.error ? (
          <div style={{ color: "red" }}>{String(submit.error)}</div>
        ) : null}
        {submit.data ? <Json v={submit.data} /> : null}
      </div>

      <div style={box}>
        <strong>Asset search</strong>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="symbol or name"
        />
        {assets.isFetching ? " (searching)" : ""}
        <Json v={assets.data ?? []} />
      </div>

      <div style={box}>
        <strong>Orders</strong>{" "}
        <button onClick={() => cancelAll.mutate()}>cancel all</button>
        {(orders.data?.orders ?? []).map((o) => (
          <div key={o.id}>
            <button onClick={() => cancel.mutate(o.id)}>x</button>{" "}
            {o.symbol} {o.side} {o.type} qty={o.qty} {o.status}
          </div>
        ))}
      </div>

      <div style={box}>
        <strong>Positions</strong>{" "}
        <button onClick={() => closeAll.mutate()}>close all</button>
        {(positions.data?.positions ?? []).map((p) => (
          <div key={p.symbol}>
            <button onClick={() => close.mutate(p.symbol)}>x</button>{" "}
            {p.symbol} qty={p.qty} P/L={p.unrealized_pl.toFixed(2)}
          </div>
        ))}
      </div>

      <div style={box}>
        <strong>Activities</strong>
        <Json v={activities.data?.activities ?? []} />
      </div>
    </div>
  );
}
