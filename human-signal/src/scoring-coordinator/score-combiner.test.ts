import { describe, expect, it } from 'vitest';

import { combineScores, COMBINED_SCORING_VERSION } from '@/scoring-coordinator/score-combiner';

import type { CombinerInput } from '@/scoring-coordinator/score-combiner';
import type { ScoreDimensions } from '@/shared/types';

const DEFAULT_DIMENSIONS: ScoreDimensions = {
  authenticity: 0.5,
  specificity: 0.5,
  originality: 0.5,
  usefulness: 0.5,
  engagementBait: 0,
  templating: 0,
};

function input(overrides: Partial<CombinerInput>): CombinerInput {
  return {
    text: 'Some test text that is long enough to pass the short text cutoff for testing purposes.',
    itemType: 'post',
    charCount: 200,
    rulesLabel: 'feels-human',
    rulesConfidence: 'medium',
    rulesDimensions: DEFAULT_DIMENSIONS,
    rulesReasons: ['Test reason.'],
    tmrAiProbability: 0.1,
    ...overrides,
  };
}

describe('combineScores', (): void => {
  it('returns rules label for engagement bait regardless of TMR', (): void => {
    const result = combineScores(input({
      rulesLabel: 'almost-certainly-ai',
      tmrAiProbability: 0.1,
    }));

    expect(result.label).toBe('almost-certainly-ai');
    expect(result.source).toBe('combined');
    expect(result.scoringVersion).toBe(COMBINED_SCORING_VERSION);
  });

  it('returns rules label for short text under 100 chars', (): void => {
    const result = combineScores(input({
      charCount: 80,
      rulesLabel: 'cant-tell',
      tmrAiProbability: 0.9,
    }));

    expect(result.label).toBe('cant-tell');
  });

  it('returns rules label when both engines agree on direction', (): void => {
    const result = combineScores(input({
      rulesLabel: 'feels-human',
      tmrAiProbability: 0.1,
    }));

    expect(result.label).toBe('feels-human');
  });

  it('returns feels-human when TMR strongly signals human on a post', (): void => {
    const result = combineScores(input({
      charCount: 500,
      itemType: 'post',
      rulesLabel: 'possibly-ai',
      tmrAiProbability: 0.10,
    }));

    expect(result.label).toBe('feels-human');
  });

  it('returns likely-ai when TMR strongly signals AI on a post', (): void => {
    const result = combineScores(input({
      charCount: 500,
      itemType: 'post',
      rulesLabel: 'possibly-ai',
      tmrAiProbability: 0.90,
    }));

    expect(result.label).toBe('likely-ai');
  });

  it('returns rules label for comments even when TMR disagrees', (): void => {
    const result = combineScores(input({
      itemType: 'comment',
      rulesLabel: 'likely-ai',
      tmrAiProbability: 0.05,
    }));

    expect(result.label).toBe('likely-ai');
  });

  it('returns rules label when TMR disagrees moderately', (): void => {
    const result = combineScores(input({
      rulesLabel: 'feels-human',
      tmrAiProbability: 0.60,
    }));

    expect(result.label).toBe('feels-human');
  });

  it('boosts confidence when engines agree', (): void => {
    const result = combineScores(input({
      rulesLabel: 'feels-human',
      rulesConfidence: 'medium',
      tmrAiProbability: 0.3,
    }));

    expect(result.confidence).toBe('high');
  });

  it('lowers confidence when engines disagree', (): void => {
    const result = combineScores(input({
      rulesLabel: 'feels-human',
      rulesConfidence: 'medium',
      tmrAiProbability: 0.7,
    }));

    expect(result.confidence).toBe('low');
  });

  it('does not boost above high', (): void => {
    const result = combineScores(input({
      rulesLabel: 'feels-human',
      rulesConfidence: 'high',
      tmrAiProbability: 0.3,
    }));

    expect(result.confidence).toBe('high');
  });

  it('preserves high confidence when TMR strongly confirms rules on a post (regression: M1)', (): void => {
    const result = combineScores(input({
      itemType: 'post',
      charCount: 500,
      rulesLabel: 'feels-human',
      rulesConfidence: 'high',
      tmrAiProbability: 0.10,
    }));

    expect(result.label).toBe('feels-human');
    expect(result.confidence).toBe('high');
  });

  it('preserves rules confidence on comment when TMR disagrees (regression: M4)', (): void => {
    const result = combineScores(input({
      itemType: 'comment',
      rulesLabel: 'feels-human',
      rulesConfidence: 'medium',
      tmrAiProbability: 0.90,
    }));

    expect(result.label).toBe('feels-human');
    expect(result.confidence).toBe('medium');
  });

  it('boosts comment confidence when TMR agrees with rules', (): void => {
    const result = combineScores(input({
      itemType: 'comment',
      rulesLabel: 'feels-human',
      rulesConfidence: 'medium',
      tmrAiProbability: 0.20,
    }));

    expect(result.label).toBe('feels-human');
    expect(result.confidence).toBe('high');
  });

  it('boosts AI-direction comment confidence when TMR agrees with rules', (): void => {
    const result = combineScores(input({
      itemType: 'comment',
      rulesLabel: 'likely-ai',
      rulesConfidence: 'medium',
      tmrAiProbability: 0.75,
    }));

    expect(result.label).toBe('likely-ai');
    expect(result.confidence).toBe('high');
  });

  it('always sets source to combined', (): void => {
    const result = combineScores(input({}));
    expect(result.source).toBe('combined');
  });

  it('uses combined scoring version', (): void => {
    const result = combineScores(input({}));
    expect(result.scoringVersion).toBe('combined-tmr-q4-1');
  });
});
