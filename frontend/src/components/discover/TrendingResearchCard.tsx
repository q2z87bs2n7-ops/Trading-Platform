import { useState } from "react";

import { compact, money } from "../../lib/format";
import type { TrendingResearchRow } from "../../types";
import { CardPager } from "./CardPager";

const PAGE_SIZE = 5;

// Tipranks consensus → colour. Maps the StrongBuy / Buy / Hold / Sell /
// StrongSell strings the upstream returns.
function consensusColor(c: string | null): string {
  switch (c) {
    case "StrongBuy":
    case "Buy":
      return "var(--pos)";
    case "Sell":
    case "StrongSell":
      return "var(--neg)";
    default:
      return "var(--mute)";
  }
}

function consensusLabel(c: string | null): string {
  if (!c) return "—";
  return c === "StrongBuy" ? "Strong Buy" : c === "StrongSell" ? "Strong Sell" : c;
}

function TrendingRowItem({
  r,
  rank,
  dense,
  onSelect,
}: {
  r: TrendingResearchRow;
  rank: number;
  dense: boolean;
  onSelect?: (s: string) => void;
}) {
  const inner = (
    <>
      <div className="font-semibold text-[14px] min-w-0 truncate">{r.ticker}</div>
      {!dense && (
        <span
          className="text-[12px] min-w-0 truncate"
          style={{ color: "var(--mute)" }}
        >
          {r.company_name || ""}
        </span>
      )}
      <span
        className="text-[12px] tabular-nums text-right"
        style={{ color: consensusColor(r.consensus) }}
        title="Analyst consensus"
      >
        {consensusLabel(r.consensus)}
      </span>
      <span
        className="font-mono text-[13px] tabular-nums text-right"
        style={{ color: "var(--text)" }}
        title="Average price target"
      >
        {r.average_price_target != null ? money(r.average_price_target) : "—"}
      </span>
      {!dense && (
        <span
          className="font-mono text-[12px] tabular-nums text-right"
          style={{ color: "var(--mute)" }}
          title="Market cap"
        >
          {r.market_cap != null ? compact(r.market_cap) : "—"}
        </span>
      )}
    </>
  );

  const cls =
    "w-full text-left grid items-center gap-2.5 py-2 border-0 bg-transparent";
  const style = {
    gridTemplateColumns: dense
      ? "56px auto 72px"
      : "56px 1fr auto 72px 64px",
    borderTop: rank === 0 ? "none" : "1px solid var(--border)",
  } as const;

  return onSelect ? (
    <button
      type="button"
      onClick={() => onSelect(r.ticker)}
      className={`${cls} cursor-pointer`}
      style={style}
    >
      {inner}
    </button>
  ) : (
    <div className={cls} style={style}>
      {inner}
    </div>
  );
}

export function TrendingResearchCard({
  rows,
  onSelect,
  bare = false,
  dense = false,
}: {
  rows: TrendingResearchRow[];
  onSelect?: (s: string) => void;
  bare?: boolean;
  dense?: boolean;
}) {
  const [page, setPage] = useState(0);
  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const start = safePage * PAGE_SIZE;
  const visible = rows.slice(start, start + PAGE_SIZE);

  const body =
    rows.length === 0 ? (
      <p className="text-[13px]" style={{ color: "var(--mute)" }}>
        No trending stocks available.
      </p>
    ) : (
      <>
        <div>
          {visible.map((r, i) => (
            <TrendingRowItem
              key={r.ticker}
              r={r}
              rank={i}
              dense={dense}
              onSelect={onSelect}
            />
          ))}
        </div>
        {rows.length > PAGE_SIZE && (
          <CardPager
            label={`${start + 1}–${start + visible.length} of ${rows.length}`}
            canPrev={safePage > 0}
            canNext={safePage < pageCount - 1}
            onPrev={() => setPage(safePage - 1)}
            onNext={() => setPage(safePage + 1)}
          />
        )}
      </>
    );

  if (bare) return body;

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
      {body}
    </div>
  );
}

export function TrendingResearchCardSkeleton({
  bare = false,
}: { bare?: boolean } = {}) {
  const body = (
    <div className="animate-pulse">
      {Array.from({ length: 5 }).map((_, i) => (
        <div
          key={i}
          className="h-7 w-full rounded mt-1.5"
          style={{ background: "var(--panel-2)" }}
        />
      ))}
    </div>
  );
  if (bare) return body;
  return (
    <div
      className="p-[18px]"
      style={{
        background: "var(--panel)",
        border: "1px solid var(--border)",
        borderRadius: "var(--r-lg)",
      }}
    >
      {body}
    </div>
  );
}
