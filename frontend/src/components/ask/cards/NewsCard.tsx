import { useMarketNews, useNews } from "../../../data/hooks";
import type { AssetClass } from "../../../lib/ask-intent";
import { relTime } from "../../../lib/format";
import AskResultCard from "../AskResultCard";

function NewsRow({
  href,
  time,
  source,
  headline,
  i,
}: {
  href: string;
  time: number;
  source: string;
  headline: string;
  i: number;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="flex gap-3 items-start no-underline"
      style={{
        padding: "8px 0",
        borderTop: i === 0 ? "none" : "1px solid var(--hairline)",
        color: "var(--text)",
      }}
    >
      <span
        className="font-mono text-[11px] min-w-[44px]"
        style={{ color: "var(--mute)" }}
      >
        {relTime(time)}
      </span>
      <div className="flex-1">
        <div
          className="text-[10.5px] uppercase font-medium"
          style={{ color: "var(--accent-2)", letterSpacing: "0.04em" }}
        >
          {source}
        </div>
        <div className="text-[13.5px] leading-snug">{headline}</div>
      </div>
    </a>
  );
}

function TickerNewsCard({ symbol, label }: { symbol: string; label: string }) {
  // Alpaca's Benzinga feed keys off the bare ticker, so query the base coin
  // for crypto pairs (BTC/USD → BTC).
  const query = symbol.includes("/") ? symbol.split("/")[0] : symbol;
  const { data, error } = useNews(query, 10);
  if (!data) {
    return (
      <AskResultCard title={`News · ${label}`}>
        <div className="text-[13px]" style={{ color: "var(--mute)" }}>
          {error ? (error as Error).message : "Loading…"}
        </div>
      </AskResultCard>
    );
  }
  const items = data.news.slice(0, 6);
  return (
    <AskResultCard title={`News · ${label}`} meta={`${items.length} items`}>
      {items.length === 0 ? (
        <div className="text-[13px]" style={{ color: "var(--mute)" }}>
          No recent Benzinga coverage for {label}.
        </div>
      ) : (
        <div className="flex flex-col">
          {items.map((a, i) => (
            <NewsRow
              key={a.id}
              href={a.url}
              time={a.time}
              source={a.source}
              headline={a.headline}
              i={i}
            />
          ))}
        </div>
      )}
    </AskResultCard>
  );
}

function MarketNewsCard() {
  const { data, error } = useMarketNews(8);
  if (!data) {
    return (
      <AskResultCard title="Headlines">
        <div className="text-[13px]" style={{ color: "var(--mute)" }}>
          {error ? (error as Error).message : "Loading…"}
        </div>
      </AskResultCard>
    );
  }
  return (
    <AskResultCard
      title="Market headlines"
      meta={`${data.articles.length} items`}
    >
      <div className="flex flex-col">
        {data.articles.slice(0, 6).map((a, i) => (
          <NewsRow
            key={`${a.pub_time}-${i}`}
            href={a.link}
            time={a.pub_time}
            source={a.source}
            headline={a.title}
            i={i}
          />
        ))}
      </div>
    </AskResultCard>
  );
}

export function NewsCard({
  symbol,
  assetClass,
}: {
  symbol?: string;
  assetClass: AssetClass;
}) {
  if (symbol) {
    const label = symbol.includes("/") ? symbol.split("/")[0] : symbol;
    return <TickerNewsCard symbol={symbol} label={label} />;
  }
  // No explicit symbol: crypto has no general-headlines feed, so query a
  // basket of the most-covered coins (Benzinga keys off bare tickers) for
  // broader crypto headlines; stocks use the US market headlines feed.
  if (assetClass === "crypto")
    return <TickerNewsCard symbol="BTC,ETH,SOL,XRP,DOGE" label="Crypto" />;
  return <MarketNewsCard />;
}
