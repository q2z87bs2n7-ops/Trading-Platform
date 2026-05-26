import { fmtCryptoPrice, pct } from "../../lib/format";
import { fmtPrice, realSparkPaths, sparkPaths } from "./util";

export function SparkCard({
  symbol,
  name,
  price,
  changePct,
  selected,
  onSelect,
  onRemove,
  isCrypto,
  dense = false,
  compact = false,
  closes,
}: {
  symbol: string;
  name: string;
  price: number;
  changePct: number;
  selected: boolean;
  onSelect: () => void;
  onRemove?: () => void;
  isCrypto?: boolean;
  /** Compact 2-col layout for narrow Workspace docks — drops the sparkline,
   *  name slot, and shrinks fonts so two cards fit in ~180px width. */
  dense?: boolean;
  /** Mid tier between full and dense — keeps the sparkline but shorter
   *  (H=32 instead of 48), drops the name slot. */
  compact?: boolean;
  /** Real recent closes (newest last) for the sparkline. When omitted or
   *  shorter than 2 points, falls back to the symbol-seeded synthetic
   *  curve so first paint isn't blank while bars are loading. */
  closes?: number[];
}) {
  const up = changePct >= 0;
  const stroke = up ? "var(--pos)" : "var(--neg)";
  const W = 100;
  const H = compact ? 32 : 48;
  const { line, area } =
    closes && closes.length >= 2
      ? realSparkPaths(closes, W, H)
      : sparkPaths(symbol, changePct, W, H);
  const gradId = `spark-${symbol.replace(/[^A-Z0-9]/gi, "")}`;
  return (
    <div
      role="button"
      onClick={onSelect}
      className="group text-left cursor-pointer transition-all relative overflow-hidden bg-panel"
      style={{
        padding: dense ? "8px 10px 8px 10px" : "13px 14px 10px 14px",
        border: `1px solid ${selected ? "var(--accent)" : "var(--border)"}`,
        borderRadius: "var(--r)",
        boxShadow: selected ? "0 0 0 2px var(--accent-bg)" : "none",
        scrollSnapAlign: "start",
      }}
    >
      {onRemove && (
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          aria-label={`Remove ${symbol} from watchlist`}
          className="absolute top-1.5 right-1.5 cursor-pointer border-0 text-[12px] leading-none w-5 h-5 grid place-items-center transition-opacity hover:opacity-100"
          style={{
            background: "var(--panel-2)",
            color: "var(--mute)",
            borderRadius: 4,
            opacity: 0.55,
          }}
        >
          ✕
        </button>
      )}
      <div
        className="font-semibold"
        style={{ fontSize: dense ? 12 : 15, paddingRight: dense ? 16 : 0 }}
      >
        {symbol}
      </div>
      {!dense && !compact && (
        <div
          className="text-[11px] mt-px truncate h-[14px]"
          style={{ color: "var(--mute)" }}
        >
          {name}
        </div>
      )}
      <div
        className="font-mono font-medium tabular-nums"
        style={{ fontSize: dense ? 13 : 16, marginTop: dense ? 2 : 8 }}
      >
        {isCrypto ? fmtCryptoPrice(price) : fmtPrice(price)}
      </div>
      <div
        className="font-mono tabular-nums"
        style={{
          fontSize: dense ? 10.5 : 12,
          marginTop: dense ? 0 : 1,
          color: stroke,
        }}
      >
        {pct(changePct)}
      </div>
      {!dense && (
        <svg
          height={H}
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          className="block w-full mt-1.5"
        >
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={stroke} stopOpacity={0.12} />
              <stop offset="100%" stopColor={stroke} stopOpacity={0} />
            </linearGradient>
          </defs>
          <path d={area} fill={`url(#${gradId})`} />
          <path d={line} fill="none" stroke={stroke} strokeWidth={1.5} />
        </svg>
      )}
    </div>
  );
}

export function SparkCardSkeleton() {
  return (
    <div
      className="animate-pulse p-[13px_14px_10px]"
      style={{
        background: "var(--panel)",
        border: "1px solid var(--border)",
        borderRadius: "var(--r)",
      }}
    >
      <div className="h-3 w-12 rounded mb-1.5" style={{ background: "var(--panel-2)" }} />
      <div className="h-2.5 w-20 rounded" style={{ background: "var(--panel-2)" }} />
      <div className="h-4 w-16 rounded mt-2" style={{ background: "var(--panel-2)" }} />
      <div className="h-12 w-full rounded mt-2" style={{ background: "var(--panel-2)" }} />
    </div>
  );
}
