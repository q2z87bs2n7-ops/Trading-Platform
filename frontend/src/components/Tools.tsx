import { useState } from "react";

import { useMostActives, useMovers } from "../data/hooks";
import type { Mover, MostActiveStock } from "../types";
import ErrorBanner from "./ErrorBanner";
import News from "./News";

const pct = (n: number) =>
  `${n >= 0 ? "+" : ""}${(n * 100).toFixed(2)}%`;

const money = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD" });

const compactNum = (n: number) =>
  n.toLocaleString("en-US", { notation: "compact", maximumFractionDigits: 1 });

function MoverRow({
  m,
  onSelect,
  selected,
}: {
  m: Mover;
  onSelect: (s: string) => void;
  selected: string;
}) {
  const up = m.percent_change >= 0;
  return (
    <button
      type="button"
      onClick={() => onSelect(m.symbol)}
      className={`w-full flex justify-between py-1 text-[13px] bg-transparent border-0 p-0 cursor-pointer text-left${
        selected === m.symbol ? " text-accent" : ""
      }`}
    >
      <span className="font-semibold">{m.symbol}</span>
      <span className="flex gap-3 tabular-nums">
        <span className="text-muted">{money(m.price)}</span>
        <span
          style={{ color: up ? "var(--green)" : "var(--red)" }}
          className="min-w-[70px] text-right"
        >
          {pct(m.percent_change)}
        </span>
      </span>
    </button>
  );
}

function ActiveRow({
  a,
  onSelect,
  selected,
}: {
  a: MostActiveStock;
  onSelect: (s: string) => void;
  selected: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(a.symbol)}
      className={`w-full flex justify-between py-1 text-[13px] bg-transparent border-0 p-0 cursor-pointer text-left${
        selected === a.symbol ? " text-accent" : ""
      }`}
    >
      <span className="font-semibold">{a.symbol}</span>
      <span className="flex gap-3 tabular-nums text-muted">
        <span>vol {compactNum(a.volume)}</span>
        <span>{compactNum(a.trade_count)} trades</span>
      </span>
    </button>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-panel border border-border rounded-lg p-3">
      <h2 className="text-[13px] uppercase tracking-wide text-muted m-0 mb-2">
        {title}
      </h2>
      {children}
    </div>
  );
}

export default function Tools({
  selected,
  onSelect,
}: {
  selected: string;
  onSelect: (symbol: string) => void;
}) {
  const [activeBy, setActiveBy] = useState<"volume" | "trades">("volume");
  const movers = useMovers(10);
  const actives = useMostActives(10, activeBy);

  return (
    <div
      className="grid gap-4 mt-4"
      style={{ gridTemplateColumns: "1fr 1fr 1fr" }}
    >
      <Panel title="Top Gainers">
        {movers.error && <ErrorBanner message={movers.error.message} />}
        {!movers.error && movers.isPending && (
          <div className="text-xs text-muted">Loading…</div>
        )}
        {movers.data?.gainers.map((m) => (
          <MoverRow key={m.symbol} m={m} onSelect={onSelect} selected={selected} />
        ))}
      </Panel>

      <Panel title="Top Losers">
        {movers.error && <ErrorBanner message={movers.error.message} />}
        {!movers.error && movers.isPending && (
          <div className="text-xs text-muted">Loading…</div>
        )}
        {movers.data?.losers.map((m) => (
          <MoverRow key={m.symbol} m={m} onSelect={onSelect} selected={selected} />
        ))}
      </Panel>

      <Panel title="Most Active">
        <div className="flex gap-1 mb-2">
          <button
            type="button"
            onClick={() => setActiveBy("volume")}
            className={`btn btn-mini${activeBy === "volume" ? " active" : ""}`}
            style={{ opacity: activeBy === "volume" ? 1 : 0.6 }}
          >
            Volume
          </button>
          <button
            type="button"
            onClick={() => setActiveBy("trades")}
            className={`btn btn-mini${activeBy === "trades" ? " active" : ""}`}
            style={{ opacity: activeBy === "trades" ? 1 : 0.6 }}
          >
            Trades
          </button>
        </div>
        {actives.error && <ErrorBanner message={actives.error.message} />}
        {!actives.error && actives.isPending && (
          <div className="text-xs text-muted">Loading…</div>
        )}
        {actives.data?.most_actives.map((a) => (
          <ActiveRow key={a.symbol} a={a} onSelect={onSelect} selected={selected} />
        ))}
      </Panel>

      <div style={{ gridColumn: "1 / -1" }}>
        <News symbol={selected} />
      </div>
    </div>
  );
}
