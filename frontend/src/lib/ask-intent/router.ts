import { DETECTORS } from "./detectors";
import { scoreHit, threshold } from "./scoring";
import { EMPTY_UNIVERSE } from "./types";
import type { AssetClass, Intent, RouteContext, ScoredCandidate } from "./types";

// Clear interrogatives ("why…", "what is…", "how does…") always defer to the
// AI — a hard pre-empt independent of scoring. Deliberately does NOT catch the
// contraction forms ("how's AAPL", "what's SPY"), which route to the chart.
const HARD_FALLBACK_RE =
  /^(why\b|explain\b|what\s+(is|are|does|do|was|were|means?|happened)\b|how\s+(does|do|did|can|should|would|is|are)\b)/i;

// Force-AI escape hatch: a leading "ai:" / "ask:" bypasses scoring and sends
// the rest straight to the AI fallback.
const FORCE_AI_RE = /^(?:ai|ask):\s*(.*)$/is;

export function routeQuery(input: string, ctx: RouteContext): Intent {
  const text = input.trim();
  if (!text) return { type: "fallback", text };
  const forced = text.match(FORCE_AI_RE);
  if (forced) return { type: "fallback", text: forced[1].trim() };
  if (HARD_FALLBACK_RE.test(text)) return { type: "fallback", text };

  const candidates: ScoredCandidate[] = [];
  for (const detect of DETECTORS) {
    const hit = detect(text, ctx);
    if (hit) candidates.push({ intent: hit.intent, score: scoreHit(hit, text, ctx) });
  }

  // Highest score wins; ties resolve by detector priority (earlier in the
  // list, so a strict `>` keeps the first of equal scores).
  let best: ScoredCandidate | null = null;
  for (const c of candidates) {
    if (!best || c.score > best.score) best = c;
  }

  if (best && best.score >= threshold(ctx.aiEnabled)) return best.intent;
  return { type: "fallback", text };
}

// Back-compat shim for callers that pass only the silo: tolerant (AI-off)
// routing with an empty universe (cold-start heuristic). New call sites should
// use routeQuery with a real RouteContext.
export function parseIntent(input: string, assetClass?: AssetClass): Intent {
  return routeQuery(input, {
    assetClass: assetClass ?? "stocks",
    aiEnabled: false,
    symbolUniverse: EMPTY_UNIVERSE,
  });
}
