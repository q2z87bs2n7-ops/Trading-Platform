import { useEffect } from "react";

import { useClosePosition, usePositions } from "../../../data/hooks";
import { money, pct } from "../../../lib/format";
import AskResultCard from "../AskResultCard";

export function CloseCard({
  symbol,
  onDone,
}: {
  symbol: string;
  onDone: () => void;
}) {
  const positions = usePositions();
  const close = useClosePosition();
  const pos = (positions.data?.positions || []).find(
    (p) => p.symbol.toUpperCase() === symbol.toUpperCase(),
  );

  useEffect(() => {
    if (!close.isSuccess) return;
    const id = setTimeout(onDone, 900);
    return () => clearTimeout(id);
  }, [close.isSuccess, onDone]);

  if (positions.isPending) {
    return (
      <AskResultCard title={`Close ${symbol}`}>
        <div className="text-[13px]" style={{ color: "var(--mute)" }}>
          Loading position…
        </div>
      </AskResultCard>
    );
  }
  if (!pos) {
    return (
      <AskResultCard title={`Close ${symbol}`}>
        <div className="text-[13px]" style={{ color: "var(--mute)" }}>
          You have no open position in {symbol}.
        </div>
      </AskResultCard>
    );
  }

  const plUp = pos.unrealized_pl >= 0;
  return (
    <AskResultCard
      title={`Close ${symbol}`}
      meta={`${pos.qty} shares · ${pos.side}`}
    >
      <div className="grid gap-3 grid-cols-1 sm:grid-cols-2">
        <div className="flex flex-col">
          <span className="text-[11px] uppercase" style={{ color: "var(--mute)" }}>
            Market value
          </span>
          <span className="font-mono text-[16px] tabular-nums">
            {money(pos.market_value)}
          </span>
        </div>
        <div className="flex flex-col">
          <span className="text-[11px] uppercase" style={{ color: "var(--mute)" }}>
            Unrealized P&L
          </span>
          <span
            className="font-mono text-[16px] tabular-nums"
            style={{ color: plUp ? "var(--pos)" : "var(--neg)" }}
          >
            {plUp ? "+" : ""}
            {money(pos.unrealized_pl)} ({pct(pos.unrealized_plpc)})
          </span>
        </div>
      </div>
      {close.error && (
        <div
          className="text-[12px] mt-3 px-2 py-1"
          style={{
            color: "var(--neg)",
            background: "var(--neg-bg)",
            borderRadius: 6,
          }}
        >
          {(close.error as Error).message}
        </div>
      )}
      {close.isSuccess && (
        <div
          className="text-[12.5px] mt-3 px-3 py-2"
          style={{
            background: "var(--pos-bg)",
            color: "var(--pos)",
            borderRadius: 6,
          }}
        >
          Close order submitted.
        </div>
      )}
      <button
        type="button"
        disabled={close.isPending || close.isSuccess}
        onClick={() => close.mutate(pos.symbol)}
        className="w-full mt-4 text-[14px] font-semibold cursor-pointer border-0"
        style={{
          padding: "11px",
          borderRadius: "var(--r)",
          background: "var(--neg)",
          color: "white",
          opacity: close.isPending || close.isSuccess ? 0.6 : 1,
        }}
      >
        {close.isPending ? "Closing…" : `Close position`}
      </button>
    </AskResultCard>
  );
}
