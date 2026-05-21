import { useMarketNews, useNews } from "../../../data/hooks";
import { relTime } from "../../../lib/format";
import CmdResultCard from "../CmdResultCard";

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

function TickerNewsCard({ symbol }: { symbol: string }) {
  const { data, error } = useNews(symbol, 10);
  if (!data) {
    return (
      <CmdResultCard title={`News · ${symbol}`}>
        <div className="text-[13px]" style={{ color: "var(--mute)" }}>
          {error ? (error as Error).message : "Loading…"}
        </div>
      </CmdResultCard>
    );
  }
  const items = data.news.slice(0, 6);
  return (
    <CmdResultCard title={`News · ${symbol}`} meta={`${items.length} items`}>
      {items.length === 0 ? (
        <div className="text-[13px]" style={{ color: "var(--mute)" }}>
          No recent Benzinga coverage for {symbol}.
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
    </CmdResultCard>
  );
}

function MarketNewsCard() {
  const { data, error } = useMarketNews(8);
  if (!data) {
    return (
      <CmdResultCard title="Headlines">
        <div className="text-[13px]" style={{ color: "var(--mute)" }}>
          {error ? (error as Error).message : "Loading…"}
        </div>
      </CmdResultCard>
    );
  }
  return (
    <CmdResultCard
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
    </CmdResultCard>
  );
}

export function NewsCard({ symbol }: { symbol?: string }) {
  if (symbol) return <TickerNewsCard symbol={symbol} />;
  return <MarketNewsCard />;
}
