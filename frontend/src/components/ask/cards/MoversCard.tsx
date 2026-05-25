import { useCryptoTickers, useMovers } from "../../../data/hooks";
import type { AssetClass } from "../../../lib/ask-intent";
import { pct } from "../../../lib/format";
import type { Mover, Snapshot } from "../../../types";
import AskResultCard from "../AskResultCard";

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

type Kind = "gainers" | "losers" | "both";

// Alpaca has no crypto screener, so derive movers from the crypto ticker
// snapshots we already stream on the Crypto Discover page.
function CryptoMoversCard({ kind }: { kind: Kind }) {
  const tickers = useCryptoTickers();
  const rows: Mover[] = (tickers.data?.tickers ?? [])
    .map((t: Snapshot) => {
      const last = t.last_price ?? 0;
      const prev = t.prev_close ?? 0;
      const pc = prev ? (last - prev) / prev : 0;
      return {
        symbol: t.symbol.replace(/\/USD$/, ""),
        price: last,
        change: last - prev,
        percent_change: pc,
      };
    })
    .filter((m) => m.price > 0)
    .sort((a, b) => b.percent_change - a.percent_change);

  if (!tickers.data) {
    return (
      <AskResultCard title="Crypto movers">
        <div className="text-[13px]" style={{ color: "var(--mute)" }}>
          {tickers.error ? (tickers.error as Error).message : "Loading…"}
        </div>
      </AskResultCard>
    );
  }

  const gainers = rows.filter((m) => m.percent_change >= 0).slice(0, 8);
  const losers = [...rows]
    .filter((m) => m.percent_change < 0)
    .sort((a, b) => a.percent_change - b.percent_change)
    .slice(0, 8);

  return (
    <AskResultCard title="Crypto movers" meta="from your crypto tickers">
      <div className="flex flex-col gap-3">
        {(kind === "gainers" || kind === "both") && (
          <MoversList title="Gainers" rows={gainers} />
        )}
        {(kind === "losers" || kind === "both") && (
          <MoversList title="Losers" rows={losers} />
        )}
      </div>
    </AskResultCard>
  );
}

function StockMoversCard({ kind }: { kind: Kind }) {
  const movers = useMovers(8);
  if (!movers.data) {
    return (
      <AskResultCard title="Movers">
        <div className="text-[13px]" style={{ color: "var(--mute)" }}>
          {movers.error ? movers.error.message : "Loading…"}
        </div>
      </AskResultCard>
    );
  }
  return (
    <AskResultCard title="Today's movers" meta="free IEX feed">
      <div className="flex flex-col gap-3">
        {(kind === "gainers" || kind === "both") && (
          <MoversList title="Top gainers" rows={movers.data.gainers} />
        )}
        {(kind === "losers" || kind === "both") && (
          <MoversList title="Top losers" rows={movers.data.losers} />
        )}
      </div>
    </AskResultCard>
  );
}

export function MoversCard({
  kind,
  assetClass,
}: {
  kind: Kind;
  assetClass: AssetClass;
}) {
  return assetClass === "crypto" ? (
    <CryptoMoversCard kind={kind} />
  ) : (
    <StockMoversCard kind={kind} />
  );
}
