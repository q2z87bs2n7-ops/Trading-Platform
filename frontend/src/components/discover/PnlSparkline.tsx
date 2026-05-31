import { useId, useMemo } from "react";

// Area-filled net-P/L sparkline — the same geometry the stocks/crypto
// DiscoverHero draws inline, extracted so the two CFD heroes (CFD Discover +
// CFD Portfolio) can reuse it without re-triplicating the path math. Green/red
// by tip direction; renders a muted placeholder when there are < 2 points.
export function PnlSparkline({
  pnl,
  height = 80,
  emptyLabel = "No trade history yet.",
}: {
  pnl: number[];
  height?: number;
  emptyLabel?: string;
}) {
  const gid = useId();
  const curve = useMemo(() => {
    if (pnl.length < 2) return null;
    const W = 600;
    const H = height;
    const min = Math.min(...pnl);
    const max = Math.max(...pnl);
    const range = max - min || 1;
    const stepX = W / (pnl.length - 1);
    const tipUp = pnl[pnl.length - 1] >= pnl[0];
    const stroke = tipUp ? "var(--pos)" : "var(--neg)";
    const pts = pnl.map((v, i) => ({
      x: i * stepX,
      y: H - ((v - min) / range) * (H - 8) - 4,
    }));
    const line = pts
      .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
      .join(" ");
    const area = `${line} L ${W} ${H} L 0 ${H} Z`;
    return { W, H, line, area, stroke };
  }, [pnl, height]);

  if (!curve) {
    return (
      <div
        className="text-[12px] mt-1 flex items-end"
        style={{ color: "var(--mute)", minHeight: height }}
      >
        {emptyLabel}
      </div>
    );
  }

  return (
    <svg
      viewBox={`0 0 ${curve.W} ${curve.H}`}
      width="100%"
      height={curve.H}
      preserveAspectRatio="none"
      className="block mt-1"
      aria-hidden
    >
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={curve.stroke} stopOpacity={0.18} />
          <stop offset="100%" stopColor={curve.stroke} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={curve.area} fill={`url(#${gid})`} />
      <path
        d={curve.line}
        fill="none"
        stroke={curve.stroke}
        strokeWidth={1.5}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
