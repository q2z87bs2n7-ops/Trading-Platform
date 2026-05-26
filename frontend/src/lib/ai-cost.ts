// Per-surface AI cost estimator. Reads the active Anthropic model from
// /api/config and multiplies by published per-million-token prices and
// per-surface token medians lifted from the actual prompt + tool-loop code
// (backend/app/ai/router.py + the market-summary prompt). Numbers are
// approximate by definition — real usage swings with conversation length,
// tool-loop depth, and chart context — but they put a reviewer in the
// right order of magnitude rather than guessing from a marketing page.

import type { AiSurface } from "../components/AiDisabledNotice";

// Anthropic published per-million-token rates by family. Sonnet is the
// platform default (config.py); Opus / Haiku are recognised so flipping
// ANTHROPIC_MODEL doesn't desync the notice.
interface Price {
  inPerM: number;
  outPerM: number;
  label: string;
}
const PRICING: Record<"opus" | "sonnet" | "haiku" | "unknown", Price> = {
  opus: { inPerM: 15, outPerM: 75, label: "Opus" },
  sonnet: { inPerM: 3, outPerM: 15, label: "Sonnet" },
  haiku: { inPerM: 1, outPerM: 5, label: "Haiku" },
  unknown: { inPerM: 3, outPerM: 15, label: "Sonnet-class" },
};

function priceFor(model: string | undefined): Price {
  const m = (model ?? "").toLowerCase();
  if (m.includes("opus")) return PRICING.opus;
  if (m.includes("haiku")) return PRICING.haiku;
  if (m.includes("sonnet")) return PRICING.sonnet;
  return PRICING.unknown;
}

// Per-surface token medians. Calibrate by checking actual usage with
// /api/ai/ask logs; today these are eyeballed from the prompt sizes in
// backend/app/ai/router.py and the market-summary builder.
interface SurfaceUsage {
  inputTokens: number;
  outputTokens: number;
  // Effective tool-loop iterations factor (1 = single shot). ChartBot
  // multi-tool turns multiply input cost since the system prompt + history
  // are resent each iteration.
  iterMultiplier: number;
}
const USAGE: Record<AiSurface, SurfaceUsage> = {
  market: { inputTokens: 2500, outputTokens: 600, iterMultiplier: 1 },
  ask: { inputTokens: 4000, outputTokens: 800, iterMultiplier: 1.5 },
  chartbot: { inputTokens: 7000, outputTokens: 600, iterMultiplier: 2 },
};

function fmtUSD(n: number): string {
  if (n < 0.01) return `≈$${n.toFixed(4)}`;
  if (n < 0.1) return `≈$${n.toFixed(3)}`;
  return `≈$${n.toFixed(2)}`;
}

export interface CostEstimate {
  /** "≈$0.04 per turn · Sonnet" — single string ready to drop into the notice. */
  perCall: string;
  /** Underlying number; useful for testing. */
  usd: number;
  /** Model family label, e.g. "Sonnet" / "Opus". */
  modelLabel: string;
}

export function estimateCost(
  surface: AiSurface,
  model: string | undefined,
): CostEstimate {
  const price = priceFor(model);
  const u = USAGE[surface];
  const usd =
    ((u.inputTokens * u.iterMultiplier) / 1_000_000) * price.inPerM +
    (u.outputTokens / 1_000_000) * price.outPerM;
  const noun =
    surface === "market" ? "per summary" : "per turn";
  return {
    perCall: `${fmtUSD(usd)} ${noun} · ${price.label}`,
    usd,
    modelLabel: price.label,
  };
}
