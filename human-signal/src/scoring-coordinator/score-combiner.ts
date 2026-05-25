import type { ConfidenceLabel, ScoringLabel, ScoreDimensions } from '@/shared/types';

export const COMBINED_SCORING_VERSION: string = 'combined-tmr-q4-4';

export interface CombinerInput {
  readonly text: string;
  readonly activityUrn: string | null;
  readonly itemType: 'post' | 'comment';
  readonly charCount: number;
  readonly rulesLabel: ScoringLabel;
  readonly rulesConfidence: ConfidenceLabel;
  readonly rulesDimensions: ScoreDimensions;
  readonly rulesReasons: readonly string[];
  readonly tmrAiProbability: number;
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
  if (isPreAiEra(input.activityUrn)) {
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

  // Strongly authentic: rules is very confident in human signals (max authenticity,
  // minimal templating, non-low confidence). For these, TMR is treated as
  // unreliable and rules carries the verdict almost entirely. Catches emotional /
  // empathetic posts (layoffs, congrats) where TMR's training data biases it
  // toward AI false positives.
  const stronglyAuthentic: boolean =
    input.rulesLabel === 'feels-human' &&
    input.rulesConfidence !== 'low' &&
    input.rulesDimensions.authenticity >= 0.8 &&
    input.rulesDimensions.templating < 0.2;

  // Authentic (softer tier): rules says feels-human with moderate authenticity.
  // TMR gets dampened but still contributes meaningfully.
  const authenticRules: boolean =
    !stronglyAuthentic &&
    input.rulesLabel === 'feels-human' &&
    input.rulesDimensions.authenticity >= 0.5 &&
    input.rulesDimensions.templating < 0.4;

  let rw: number;
  let tmrCap: number;
  if (stronglyAuthentic) {
    rw = 0.7;
    tmrCap = 0.4;
  } else if (authenticRules) {
    rw = 0.55;
    tmrCap = 0.65;
  } else {
    rw = RULES_WEIGHT;
    tmrCap = 1;
  }
  const tw: number = 1 - rw;
  const effectiveTmrAiProb: number = Math.min(input.tmrAiProbability, tmrCap);
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

/**
 * The cutoff date before which AI-generated LinkedIn posts were effectively
 * non-existent. ChatGPT launched November 30, 2022; widespread LinkedIn
 * AI usage started in mid-2023.
 */
const PRE_AI_CUTOFF: Date = new Date('2023-01-01T00:00:00Z');

/**
 * Returns true if the activity URN encodes a creation timestamp before
 * the AI era.
 *
 * LinkedIn activity IDs are Snowflake IDs: the upper 42 bits are
 * milliseconds since the Unix epoch, right-shifted by 22. Decoding this
 * gives an exact creation timestamp, which is far more reliable than
 * parsing relative-time text from the DOM.
 */
export function isPreAiEra(activityUrn: string | null): boolean {
  if (activityUrn === null) return false;
  const match: RegExpMatchArray | null = activityUrn.match(/urn:li:activity:(\d+)/);
  if (match === null) return false;
  try {
    const id: bigint = BigInt(match[1]!);
    const timestampMs: number = Number(id >> 22n);
    if (timestampMs < 1_000_000_000_000 || timestampMs > 2_000_000_000_000) return false;
    return new Date(timestampMs) < PRE_AI_CUTOFF;
  } catch {
    return false;
  }
}
