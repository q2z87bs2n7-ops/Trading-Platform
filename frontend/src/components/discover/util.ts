// Strip the "/USD" quote off a crypto pair for compact display (BTC/USD → BTC).
export function coinLabel(symbol: string): string {
  return symbol.replace(/\/USD$/, "");
}

export function fmtPrice(n: number): string {
  if (n >= 10_000) return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
  return n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

// Synthetic sparkline curve seeded by symbol + day-change. Fallback for the
// brief window before /api/bars/batch resolves — once real closes arrive,
// SparkCard renders them through lightweight-charts (SparkChart) instead.
export function sparkPath(
  symbol: string,
  dayChange: number,
  width = 100,
  height = 32,
): string {
  return sparkPaths(symbol, dayChange, width, height).line;
}

// Same curve as sparkPath but also returns a closed area path so callers can
// render an under-fill (12% opacity in the watchlist cards).
export function sparkPaths(
  symbol: string,
  dayChange: number,
  width = 100,
  height = 32,
): { line: string; area: string } {
  const n = 24;
  const seed = symbol.charCodeAt(0) + (symbol.length % 5);
  const arr: number[] = [];
  for (let k = 0; k < n; k++) {
    const sine = Math.sin(k * ((symbol.length % 4) + 1) + seed) * 0.005;
    arr.push(1 + sine + (dayChange / n) * k);
  }
  const min = Math.min(...arr);
  const max = Math.max(...arr);
  const range = max - min || 1;
  const stepX = width / (n - 1);
  const pts = arr.map((v, i) => ({
    x: i * stepX,
    y: height - ((v - min) / range) * (height - 4) - 2,
  }));
  const line = pts
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
    .join(" ");
  const area = `${line} L ${width.toFixed(2)} ${height.toFixed(2)} L 0 ${height.toFixed(2)} Z`;
  return { line, area };
}

// SVG path for a donut-slice annulus segment.
export function buildArc(
  cx: number,
  cy: number,
  R: number,
  r: number,
  a0: number,
  a1: number,
): string {
  const x1 = cx + R * Math.cos(a0);
  const y1 = cy + R * Math.sin(a0);
  const x2 = cx + R * Math.cos(a1);
  const y2 = cy + R * Math.sin(a1);
  const x3 = cx + r * Math.cos(a1);
  const y3 = cy + r * Math.sin(a1);
  const x4 = cx + r * Math.cos(a0);
  const y4 = cy + r * Math.sin(a0);
  const large = a1 - a0 > Math.PI ? 1 : 0;
  return `M ${x1} ${y1} A ${R} ${R} 0 ${large} 1 ${x2} ${y2} L ${x3} ${y3} A ${r} ${r} 0 ${large} 0 ${x4} ${y4} Z`;
}

// Full donut ring (outer R, inner r). A single 100% slice can't use buildArc —
// a 360° arc has start == end and renders nothing — so the lone-position case
// draws a complete ring instead: outer circle (two 180° arcs) + inner circle
// punched out via the even-odd fill rule (so the hole is transparent).
export function buildRing(cx: number, cy: number, R: number, r: number): string {
  return [
    `M ${cx - R} ${cy}`,
    `A ${R} ${R} 0 1 1 ${cx + R} ${cy}`,
    `A ${R} ${R} 0 1 1 ${cx - R} ${cy}`,
    "Z",
    `M ${cx - r} ${cy}`,
    `A ${r} ${r} 0 1 0 ${cx + r} ${cy}`,
    `A ${r} ${r} 0 1 0 ${cx - r} ${cy}`,
    "Z",
  ].join(" ");
}

// Monochrome luminance steps for the allocation donut. Blue (hue 200) is the
// default / crypto ramp; green (hue 155, matching --pos) is used for stocks.
export const DONUT_COLORS = [
  "oklch(38% 0.07 200)",
  "oklch(48% 0.07 200)",
  "oklch(56% 0.07 200)",
  "oklch(64% 0.07 200)",
  "oklch(72% 0.06 200)",
  "oklch(78% 0.05 200)",
  "oklch(84% 0.04 200)",
  "oklch(90% 0.03 200)",
];

export const DONUT_COLORS_GREEN = [
  "oklch(40% 0.10 155)",
  "oklch(48% 0.10 155)",
  "oklch(56% 0.10 155)",
  "oklch(64% 0.09 155)",
  "oklch(72% 0.08 155)",
  "oklch(78% 0.06 155)",
  "oklch(84% 0.05 155)",
  "oklch(90% 0.03 155)",
];
