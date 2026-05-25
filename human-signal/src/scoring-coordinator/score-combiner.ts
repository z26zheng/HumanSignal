import type { ConfidenceLabel, ScoringLabel, ScoreDimensions } from '@/shared/types';

export const COMBINED_SCORING_VERSION: string = 'combined-tmr-q4-2';

export interface CombinerInput {
  readonly text: string;
  readonly itemType: 'post' | 'comment';
  readonly charCount: number;
  readonly rulesLabel: ScoringLabel;
  readonly rulesConfidence: ConfidenceLabel;
  readonly rulesDimensions: ScoreDimensions;
  readonly rulesReasons: readonly string[];
  readonly tmrAiProbability: number;
  readonly postAgeText: string | null;
}

export interface CombinerOutput {
  readonly label: ScoringLabel;
  readonly confidence: ConfidenceLabel;
  readonly source: 'combined';
  readonly scoringVersion: string;
}

const SHORT_TEXT_CUTOFF: number = 100;
const RULES_WEIGHT: number = 0.35;
const TMR_WEIGHT: number = 0.65;

/**
 * Convert a rules label to a numeric AI probability so we can average
 * with TMR's probability.
 */
function rulesLabelToAiProbability(label: ScoringLabel, confidence: ConfidenceLabel): number {
  const base: Record<ScoringLabel, number> = {
    'feels-human':          0.1,
    'cant-tell':            0.5,
    'possibly-ai':          0.55,
    'likely-ai':            0.8,
    'almost-certainly-ai':  0.95,
    'unavailable':          0.5,
  };
  const shift: Record<ConfidenceLabel, number> = { low: 0, medium: 0.05, high: 0.1 };
  const raw: number = base[label];
  // Push toward the extreme for higher confidence
  return raw < 0.5
    ? Math.max(0, raw - shift[confidence])
    : Math.min(1, raw + shift[confidence]);
}

function aiProbabilityToLabel(p: number): ScoringLabel {
  if (p < 0.25) return 'feels-human';
  if (p < 0.45) return 'possibly-ai';
  if (p < 0.55) return 'cant-tell';
  if (p < 0.75) return 'likely-ai';
  return 'almost-certainly-ai';
}

function aiProbabilityToConfidence(p: number): ConfidenceLabel {
  // Closer to the extremes → higher confidence
  const distFromCenter: number = Math.abs(p - 0.5);
  if (distFromCenter > 0.35) return 'high';
  if (distFromCenter > 0.15) return 'medium';
  return 'low';
}

export function combineScores(input: CombinerInput): CombinerOutput {
  const base: Omit<CombinerOutput, 'label' | 'confidence'> = {
    source: 'combined',
    scoringVersion: COMBINED_SCORING_VERSION,
  };

  // Hard rule: posts from before the AI era (2023) are human by definition.
  // ChatGPT launched Nov 2022; widespread LinkedIn AI usage started mid-2023.
  // LinkedIn shows relative ages like "1yr", "2yr", "3yr". Any post ≥2yr old
  // predates mainstream AI text generation.
  const preAi: boolean = isPreAiEra(input.postAgeText);
  if (preAi) {
    return { ...base, label: 'feels-human', confidence: 'high' };
  }

  // Comments: only boost, never downgrade (comments are short and noisy)
  if (input.itemType === 'comment') {
    return { ...base, label: input.rulesLabel, confidence: boostOnAgreement(input) };
  }

  // Very short text: TMR isn't reliable, trust rules
  if (input.charCount < SHORT_TEXT_CUTOFF) {
    return { ...base, label: input.rulesLabel, confidence: input.rulesConfidence };
  }

  // Engagement bait caught by rules is always definitive
  if (input.rulesLabel === 'almost-certainly-ai' && input.rulesDimensions.engagementBait > 0.5) {
    return { ...base, label: 'almost-certainly-ai', confidence: 'high' };
  }

  // Weighted average of the two AI probabilities.
  // When rules finds strong authenticity signals (high authenticity + low templating),
  // dampen TMR's contribution — TMR has known biases on multi-paragraph and
  // corporate-enthusiastic text that cause false positives on genuine human posts.
  const rulesAiProb: number = rulesLabelToAiProbability(input.rulesLabel, input.rulesConfidence);
  const authenticRules: boolean =
    input.rulesLabel === 'feels-human' &&
    input.rulesDimensions.authenticity >= 0.5 &&
    input.rulesDimensions.templating < 0.4;
  const rw: number = authenticRules ? 0.55 : RULES_WEIGHT;
  const tw: number = 1 - rw;
  // Cap TMR's effective AI probability when rules has authentic signals,
  // so a single paragraph break can't swing the result from human to AI.
  const effectiveTmrAiProb: number = authenticRules
    ? Math.min(input.tmrAiProbability, 0.65)
    : input.tmrAiProbability;
  const combined: number = rw * rulesAiProb + tw * effectiveTmrAiProb;

  return {
    ...base,
    label: aiProbabilityToLabel(combined),
    confidence: aiProbabilityToConfidence(combined),
  };
}

function boostOnAgreement(input: CombinerInput): ConfidenceLabel {
  const rulesDir: 'human' | 'ai' | 'neutral' = labelDirection(input.rulesLabel);
  const tmrDir: 'human' | 'ai' = input.tmrAiProbability < 0.5 ? 'human' : 'ai';
  if (rulesDir === tmrDir) {
    return input.rulesConfidence === 'low' ? 'medium' : 'high';
  }
  return input.rulesConfidence;
}

function labelDirection(label: ScoringLabel): 'human' | 'ai' | 'neutral' {
  if (label === 'feels-human') return 'human';
  if (label === 'likely-ai' || label === 'almost-certainly-ai') return 'ai';
  return 'neutral';
}

const AGE_PATTERN: RegExp = /^(\d+)(yr|mo|w|d|h|m)$/;
const MIN_PRE_AI_YEARS: number = 2;

/**
 * Returns true if the post age text indicates the post was written before
 * mainstream AI text generation became common (pre-2023).
 * LinkedIn shows "1yr", "2yr", "3yr" etc. for older posts.
 * As of mid-2026, "2yr" means mid-2024 (borderline), "3yr" means mid-2023.
 * We use ≥3yr as the safe cutoff.
 */
export function isPreAiEra(ageText: string | null): boolean {
  if (ageText === null) return false;
  const match: RegExpMatchArray | null = ageText.match(AGE_PATTERN);
  if (match === null) return false;
  const value: number = Number.parseInt(match[1]!, 10);
  const unit: string = match[2]!;
  if (unit === 'yr' && value >= MIN_PRE_AI_YEARS) return true;
  return false;
}
