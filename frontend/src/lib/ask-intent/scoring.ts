import { contentTokenCount, isValidSymbol } from "./symbols";
import type { DetectorHit, RouteContext } from "./types";

// Confidence model constants. Tune the numbers here, not control flow.
export const THRESHOLD_AI_ON = 0.75; // strict: ambiguous → AI fallback
export const THRESHOLD_AI_OFF = 0.3; // tolerant: ≈ the pre-AI canned recall

const GRAMMAR_BASE = 0.85; // rigid syntax starts confident
const ANCHOR_BONUS = 0.2;
const SYMBOL_BONUS = 0.25;
const SYMBOL_COVERAGE_GATE = 0.4; // no symbol bonus when the trigger is buried
const OPINION_PENALTY = 0.5; // explicit opinion/comparison phrasing
const TRAILING_Q_PENALTY = 0.2; // a bare "?" — nudges, doesn't veto a crisp command

// Opinion / comparison markers that should defer to the AI even mid-sentence
// or with contractions — extends the old start-only negative guard.
const QUESTION_RE =
  /\b(should i|worth|vs|versus|what do you (think|make)|tell me about|thoughts on|how about|is it a)\b/i;

// Non-stacking: an explicit opinion phrase outweighs a bare trailing "?".
export function questionPenalty(text: string): number {
  if (QUESTION_RE.test(text)) return OPINION_PENALTY;
  if (/\?\s*$/.test(text.trim())) return TRAILING_Q_PENALTY;
  return 0;
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

// A lowercase prose mention never earns the validity bonus unless the whole
// query is that single token ("aapl" → chart, but "watch the tech names" does
// not let TECH earn it).
function symbolCasingOk(hit: DetectorHit, text: string): boolean {
  if (hit.symbolUpper) return true;
  if (!hit.symbol) return false;
  const t = text.trim().toUpperCase();
  const sym = hit.symbol.toUpperCase();
  return t === sym || `${t}/USD` === sym;
}

export function scoreHit(
  hit: DetectorHit,
  text: string,
  ctx: RouteContext,
): number {
  const total = Math.max(1, contentTokenCount(text));
  const coverage = hit.matched / total;

  let score = hit.grammar ? GRAMMAR_BASE : coverage;
  if (hit.anchored) score += ANCHOR_BONUS;

  if (
    hit.symbol &&
    coverage >= SYMBOL_COVERAGE_GATE &&
    symbolCasingOk(hit, text) &&
    isValidSymbol(hit.symbol, ctx.symbolUniverse, ctx.assetClass)
  ) {
    score += SYMBOL_BONUS;
  }

  score -= questionPenalty(text);

  return clamp01(score);
}

export const threshold = (aiEnabled: boolean) =>
  aiEnabled ? THRESHOLD_AI_ON : THRESHOLD_AI_OFF;
