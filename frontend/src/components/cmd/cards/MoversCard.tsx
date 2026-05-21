import { useMovers } from "../../../data/hooks";
import { pct } from "../../../lib/format";
import type { Mover } from "../../../types";
import CmdResultCard from "../CmdResultCard";

function MoversList({ title, rows }: { title: string; rows: Mover[] }) {
  return (
    <div>
      <div
        className="text-[11px] uppercase mb-2"
        style={{ color: "var(--mute)", letterSpacing: "0.04em" }}
      >
        {title}
      </div>
      <div className="grid gap-1.5" style={{ gridTemplateColumns: "1fr 1fr" }}>
        {rows.map((m, i) => {
          const up = m.percent_change >= 0;
          return (
            <div
              key={m.symbol}
              className="flex items-center justify-between px-2 py-1 text-[13px]"
              style={{ background: "var(--panel-2)", borderRadius: 6 }}
            >
              <span className="flex items-center gap-2 min-w-0">
                <span
                  className="font-mono text-[11px]"
                  style={{ color: "var(--mute)" }}
                >
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="font-semibold">{m.symbol}</span>
              </span>
              <span
                className="font-mono tabular-nums text-[13px]"
                style={{ color: up ? "var(--pos)" : "var(--neg)" }}
              >
                {pct(m.percent_change)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function MoversCard({ kind }: { kind: "gainers" | "losers" | "both" }) {
  const movers = useMovers(8);
  if (!movers.data) {
    return (
      <CmdResultCard title="Movers">
        <div className="text-[13px]" style={{ color: "var(--mute)" }}>
          {movers.error ? movers.error.message : "Loading…"}
        </div>
      </CmdResultCard>
    );
  }
  return (
    <CmdResultCard title="Today's movers" meta="free IEX feed">
      <div className="flex flex-col gap-3">
        {(kind === "gainers" || kind === "both") && (
          <MoversList title="Top gainers" rows={movers.data.gainers} />
        )}
        {(kind === "losers" || kind === "both") && (
          <MoversList title="Top losers" rows={movers.data.losers} />
        )}
      </div>
    </CmdResultCard>
  );
}
