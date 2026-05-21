import { useState } from "react";

import {
  useAddToWatchlist,
  useRemoveFromWatchlist,
  useSnapshots,
  useWatchlist,
} from "../../data/hooks";

const money = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD" });
const pct = (n: number) => `${n >= 0 ? "+" : ""}${(n * 100).toFixed(2)}%`;

interface Props {
  selected: string;
  onSelect: (s: string) => void;
}

export default function ChartWatchlist({ selected, onSelect }: Props) {
  const wl = useWatchlist();
  const add = useAddToWatchlist();
  const remove = useRemoveFromWatchlist();
  const symbols = wl.data?.symbols ?? [];
  const snaps = useSnapshots(symbols);
  const quotes = new Map(
    (snaps.data?.snapshots || []).map((s) => [s.symbol, s]),
  );
  const [input, setInput] = useState("");

  function submitAdd(e: React.FormEvent) {
    e.preventDefault();
    const v = input.trim().toUpperCase();
    if (!v) return;
    add.mutate(v);
    setInput("");
    onSelect(v);
  }

  return (
    <aside
      className="flex flex-col"
      style={{
        background: "var(--panel)",
        border: "1px solid var(--border)",
        borderRadius: "var(--r-lg)",
        boxShadow: "var(--shadow-sm)",
        width: 180,
        minWidth: 180,
        overflow: "hidden",
      }}
    >
      <div
        className="text-[11px] uppercase font-semibold px-3 py-2 flex items-center justify-between"
        style={{
          color: "var(--mute)",
          letterSpacing: "0.04em",
          borderBottom: "1px solid var(--hairline)",
        }}
      >
        <span>Watchlist</span>
        <span style={{ color: "var(--mute)" }} className="font-medium normal-case">
          {symbols.length}
        </span>
      </div>

      <form
        onSubmit={submitAdd}
        className="flex items-center gap-1 px-2 py-2"
        style={{ borderBottom: "1px solid var(--hairline)" }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value.toUpperCase())}
          placeholder="+ AAPL"
          className="flex-1 font-mono text-[12px] tabular-nums"
          style={{
            background: "var(--panel-2)",
            border: "1px solid var(--border)",
            borderRadius: 6,
            color: "var(--text)",
            padding: "4px 8px",
            minWidth: 0,
          }}
        />
        <button
          type="submit"
          disabled={!input.trim() || add.isPending}
          className="text-[12px] cursor-pointer"
          style={{
            background: "var(--accent-bg)",
            color: "var(--accent)",
            border: "1px solid var(--accent)",
            borderRadius: 6,
            padding: "4px 8px",
          }}
        >
          +
        </button>
      </form>

      <div className="flex-1 overflow-y-auto">
        {symbols.length === 0 && (
          <div
            className="text-[12px] px-3 py-4"
            style={{ color: "var(--mute)" }}
          >
            Add a symbol to track.
          </div>
        )}
        {symbols.map((sym) => {
          const q = quotes.get(sym);
          const dayPct =
            q?.prev_close && q.last_price
              ? (q.last_price - q.prev_close) / q.prev_close
              : 0;
          const up = dayPct >= 0;
          const isSel = sym === selected;
          return (
            <div
              key={sym}
              onClick={() => onSelect(sym)}
              role="button"
              className="group flex items-center justify-between px-3 py-2 cursor-pointer transition-colors"
              style={{
                background: isSel ? "var(--accent-bg)" : "transparent",
                borderLeft: `2px solid ${isSel ? "var(--accent)" : "transparent"}`,
              }}
            >
              <span
                className="text-[13px] font-semibold"
                style={{ color: isSel ? "var(--accent)" : "var(--text)" }}
              >
                {sym}
              </span>
              <span className="flex flex-col items-end ml-2">
                <span
                  className="font-mono text-[12px] tabular-nums leading-tight"
                  style={{ color: "var(--text-2)" }}
                >
                  {q?.last_price ? money(q.last_price) : "—"}
                </span>
                <span
                  className="font-mono text-[10.5px] tabular-nums leading-tight"
                  style={{ color: up ? "var(--pos)" : "var(--neg)" }}
                >
                  {q?.last_price ? pct(dayPct) : ""}
                </span>
              </span>
              <button
                type="button"
                aria-label={`Remove ${sym}`}
                onClick={(e) => {
                  e.stopPropagation();
                  remove.mutate(sym);
                }}
                className="ml-2 opacity-0 group-hover:opacity-100 cursor-pointer border-0 text-[12px]"
                style={{ background: "transparent", color: "var(--mute)" }}
              >
                ✕
              </button>
            </div>
          );
        })}
      </div>
    </aside>
  );
}
