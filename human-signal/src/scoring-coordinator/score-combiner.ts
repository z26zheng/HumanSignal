import type { ConfidenceLabel, ScoringLabel, ScoreDimensions } from '@/shared/types';

export const COMBINED_SCORING_VERSION: string = 'combined-tmr-q4-1';

export interface CombinerInput {
  readonly text: string;
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
const TMR_STRONG_HUMAN_THRESHOLD: number = 0.15;
const TMR_STRONG_AI_THRESHOLD: number = 0.85;

export function combineScores(input: CombinerInput): CombinerOutput {
  const base: CombinerOutput = {
    label: input.rulesLabel,
    confidence: input.rulesConfidence,
    source: 'combined',
    scoringVersion: COMBINED_SCORING_VERSION,
  };

  if (input.itemType === 'comment') {
    return boostOnAgreement(base, input);
  }

  if (input.rulesLabel === 'almost-certainly-ai') {
    return base;
  }

  if (input.charCount < SHORT_TEXT_CUTOFF) {
    return base;
  }

  const rulesDirection: 'human' | 'ai' | 'neutral' = labelDirection(input.rulesLabel);
  const tmrDirection: 'human' | 'ai' = input.tmrAiProbability < 0.5 ? 'human' : 'ai';

  if (rulesDirection === tmrDirection) {
    return { ...base, confidence: boostConfidence(base.confidence) };
  }

  if (input.tmrAiProbability < TMR_STRONG_HUMAN_THRESHOLD) {
    return { ...base, label: 'feels-human', confidence: 'medium' };
  }

  if (input.tmrAiProbability > TMR_STRONG_AI_THRESHOLD) {
    return { ...base, label: 'likely-ai', confidence: 'medium' };
  }

  if (rulesDirection !== 'neutral') {
    return { ...base, confidence: lowerConfidence(base.confidence) };
  }

  return base;
}

function boostOnAgreement(base: CombinerOutput, input: CombinerInput): CombinerOutput {
  const rulesDirection: 'human' | 'ai' | 'neutral' = labelDirection(input.rulesLabel);
  const tmrDirection: 'human' | 'ai' = input.tmrAiProbability < 0.5 ? 'human' : 'ai';

  if (rulesDirection === tmrDirection) {
    return { ...base, confidence: boostConfidence(base.confidence) };
  }

  return base;
}

function labelDirection(label: ScoringLabel): 'human' | 'ai' | 'neutral' {
  if (label === 'feels-human') return 'human';
  if (label === 'likely-ai' || label === 'almost-certainly-ai') return 'ai';
  return 'neutral';
}

function boostConfidence(confidence: ConfidenceLabel): ConfidenceLabel {
  if (confidence === 'low') return 'medium';
  return 'high';
}

function lowerConfidence(confidence: ConfidenceLabel): ConfidenceLabel {
  if (confidence === 'high') return 'medium';
  return 'low';
}
