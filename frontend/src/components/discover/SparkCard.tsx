import { fmtCryptoPrice, pct } from "../../lib/format";
import { fmtPrice, sparkPath } from "./util";

export function SparkCard({
  symbol,
  name,
  price,
  changePct,
  selected,
  onSelect,
  onRemove,
  isCrypto,
}: {
  symbol: string;
  name: string;
  price: number;
  changePct: number;
  selected: boolean;
  onSelect: () => void;
  onRemove?: () => void;
  isCrypto?: boolean;
}) {
  const up = changePct >= 0;
  const stroke = up ? "var(--pos)" : "var(--neg)";
  const path = sparkPath(symbol, changePct);
  return (
    <div
      role="button"
      onClick={onSelect}
      className="group text-left p-[13px_14px_10px] cursor-pointer transition-all relative overflow-hidden bg-panel"
      style={{
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
      <div className="font-semibold text-[15px]">{symbol}</div>
      <div
        className="text-[11px] mt-px truncate h-[14px]"
        style={{ color: "var(--mute)" }}
      >
        {name}
      </div>
      <div className="font-mono text-[16px] font-medium mt-2 tabular-nums">
        {isCrypto ? fmtCryptoPrice(price) : fmtPrice(price)}
      </div>
      <div
        className="font-mono text-[12px] mt-px tabular-nums"
        style={{ color: stroke }}
      >
        {pct(changePct)}
      </div>
      <svg
        height={32}
        viewBox="0 0 100 32"
        preserveAspectRatio="none"
        className="block w-full mt-1.5"
      >
        <path d={path} fill="none" stroke={stroke} strokeWidth={1.5} />
      </svg>
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
      <div className="h-8 w-full rounded mt-2" style={{ background: "var(--panel-2)" }} />
    </div>
  );
}
