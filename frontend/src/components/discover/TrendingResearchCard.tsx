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
  const [hover, setHover] = useState(false);
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
        className="tabular-nums"
        style={{
          fontSize: 11,
          fontWeight: 500,
          padding: "1px 7px",
          borderRadius: 999,
          color: consensusColor(r.consensus),
          background: "color-mix(in oklch, currentColor 10%, transparent)",
          border: "1px solid color-mix(in oklch, currentColor 25%, transparent)",
        }}
        title="Analyst consensus"
      >
        {consensusLabel(r.consensus)}
      </span>
      <div className="flex flex-col items-end leading-tight">
        <span
          className="font-mono text-[13px] tabular-nums"
          style={{ color: "var(--text)" }}
          title={
            r.low_price_target != null && r.high_price_target != null
              ? `Range ${money(r.low_price_target)}–${money(r.high_price_target)}${
                  r.total_analysts != null
                    ? ` · ${r.total_analysts} analysts`
                    : ""
                }`
              : r.total_analysts != null
                ? `Average of ${r.total_analysts} analyst targets`
                : "Average price target"
          }
        >
          {r.average_price_target != null ? money(r.average_price_target) : "—"}
        </span>
        {!dense && r.price_target_upside != null && (
          <span
            className="font-mono text-[10.5px] tabular-nums"
            style={{
              color:
                r.price_target_upside > 0
                  ? "var(--pos)"
                  : r.price_target_upside < 0
                    ? "var(--neg)"
                    : "var(--mute)",
            }}
            title="Upside vs current price"
          >
            {r.price_target_upside > 0 ? "+" : ""}
            {r.price_target_upside.toFixed(1)}%
          </span>
        )}
      </div>
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
    borderTop: rank === 0 ? "none" : "1px solid var(--hairline)",
  } as const;

  return onSelect ? (
    <button
      type="button"
      onClick={() => onSelect(r.ticker)}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className={`${cls} cursor-pointer`}
      style={{
        ...style,
        transition: "background .12s",
        padding: hover ? "7px 6px" : undefined,
        margin: hover ? "0 -6px" : undefined,
        borderRadius: hover ? 6 : undefined,
        background: hover ? "var(--panel-2)" : undefined,
      }}
    >
      {inner}
    </button>
  ) : (
    <div
      className={cls}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        ...style,
        transition: "background .12s",
        padding: hover ? "7px 6px" : undefined,
        margin: hover ? "0 -6px" : undefined,
        borderRadius: hover ? 6 : undefined,
        background: hover ? "var(--panel-2)" : undefined,
      }}
    >
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
      style={{
        padding: "16px 18px",
        background: "var(--panel)",
        border: "1px solid var(--border)",
        borderRadius: "var(--r-lg)",
        boxShadow: "0 0 0 1px var(--hairline), 0 1px 1px rgba(0,0,0,0.25)",
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
      style={{
        padding: "16px 18px",
        background: "var(--panel)",
        border: "1px solid var(--border)",
        borderRadius: "var(--r-lg)",
        boxShadow: "0 0 0 1px var(--hairline), 0 1px 1px rgba(0,0,0,0.25)",
      }}
    >
      {body}
    </div>
  );
}
