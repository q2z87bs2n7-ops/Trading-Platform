import { relTime } from "../../lib/format";
import type { MarketNewsArticle } from "../../types";

export function NewsCard({ articles }: { articles: MarketNewsArticle[] }) {
  return (
    <div
      className="p-[18px]"
      style={{
        background: "var(--panel)",
        border: "1px solid var(--border)",
        borderRadius: "var(--r-lg)",
        boxShadow: "var(--shadow-sm)",
      }}
    >
      <div>
        {articles.length === 0 && (
          <p className="text-[13px]" style={{ color: "var(--mute)" }}>
            No headlines this hour.
          </p>
        )}
        {articles.map((a, i) => (
          <a
            key={`${a.pub_time}-${i}`}
            href={a.link}
            target="_blank"
            rel="noreferrer"
            className="flex gap-4 items-start no-underline"
            style={{
              padding: "14px 0",
              borderTop: i === 0 ? "none" : "1px solid var(--border)",
              color: "var(--text)",
            }}
          >
            <span
              className="font-mono text-[11px] min-w-[60px] pt-px"
              style={{ color: "var(--mute)" }}
            >
              {relTime(a.pub_time)}
            </span>
            <div className="flex-1">
              <div
                className="text-[11px] font-medium uppercase"
                style={{
                  color: "var(--accent-2)",
                  letterSpacing: "0.04em",
                }}
              >
                {a.source}
              </div>
              <div className="text-[15px] mt-0.5">{a.title}</div>
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}

export function NewsCardSkeleton() {
  return (
    <div
      className="p-[18px] animate-pulse"
      style={{
        background: "var(--panel)",
        border: "1px solid var(--border)",
        borderRadius: "var(--r-lg)",
      }}
    >
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className="flex gap-4 items-start py-3.5"
          style={{ borderTop: i === 0 ? "none" : "1px solid var(--hairline)" }}
        >
          <div className="h-3 w-10 rounded shrink-0" style={{ background: "var(--panel-2)" }} />
          <div className="flex-1 flex flex-col gap-1.5">
            <div className="h-2.5 w-16 rounded" style={{ background: "var(--panel-2)" }} />
            <div className="h-4 w-5/6 rounded" style={{ background: "var(--panel-2)" }} />
          </div>
        </div>
      ))}
    </div>
  );
}
