import { describe, expect, it } from 'vitest';

import { combineScores, COMBINED_SCORING_VERSION, isPreAiEra } from '@/scoring-coordinator/score-combiner';

import type { CombinerInput } from '@/scoring-coordinator/score-combiner';
import type { ScoreDimensions } from '@/shared/types';

const NEUTRAL_DIMS: ScoreDimensions = {
  authenticity: 0.3,
  specificity: 0.3,
  originality: 0.5,
  usefulness: 0.5,
  engagementBait: 0,
  templating: 0,
};

const AUTHENTIC_DIMS: ScoreDimensions = {
  authenticity: 0.8,
  specificity: 0.7,
  originality: 0.6,
  usefulness: 0.5,
  engagementBait: 0,
  templating: 0.1,
};

const ENGAGEMENT_BAIT_DIMS: ScoreDimensions = {
  ...NEUTRAL_DIMS,
  engagementBait: 0.9,
};

function input(overrides: Partial<CombinerInput>): CombinerInput {
  return {
    text: 'Some test text that is long enough to pass the short text cutoff for testing purposes.',
    activityUrn: null,
    itemType: 'post',
    charCount: 200,
    rulesLabel: 'feels-human',
    rulesConfidence: 'medium',
    rulesDimensions: NEUTRAL_DIMS,
    rulesReasons: ['Test reason.'],
    tmrAiProbability: 0.1,
    postAgeText: null,
    ...overrides,
  };
}

describe('combineScores', (): void => {
  it('uses correct combined scoring version', (): void => {
    const result = combineScores(input({}));
    expect(result.scoringVersion).toBe(COMBINED_SCORING_VERSION);
  });

  it('always sets source to combined', (): void => {
    const result = combineScores(input({}));
    expect(result.source).toBe('combined');
  });

  describe('short text (<100 chars)', (): void => {
    it('trusts rules label regardless of TMR', (): void => {
      const result = combineScores(input({
        charCount: 80,
        rulesLabel: 'cant-tell',
        tmrAiProbability: 0.95,
      }));
      expect(result.label).toBe('cant-tell');
    });
  });

  describe('engagement bait override', (): void => {
    it('returns almost-certainly-ai for engagement bait even if TMR says human', (): void => {
      const result = combineScores(input({
        rulesLabel: 'almost-certainly-ai',
        rulesDimensions: ENGAGEMENT_BAIT_DIMS,
        tmrAiProbability: 0.05,
      }));
      expect(result.label).toBe('almost-certainly-ai');
      expect(result.confidence).toBe('high');
    });
  });

  describe('weighted average (post, >100 chars)', (): void => {
    it('both agree human → feels-human with high confidence', (): void => {
      const result = combineScores(input({
        rulesLabel: 'feels-human',
        rulesConfidence: 'medium',
        rulesDimensions: NEUTRAL_DIMS,
        tmrAiProbability: 0.05,
      }));
      expect(result.label).toBe('feels-human');
      expect(result.confidence).toBe('high');
    });

    it('both agree AI → almost-certainly-ai', (): void => {
      const result = combineScores(input({
        rulesLabel: 'likely-ai',
        rulesConfidence: 'medium',
        rulesDimensions: NEUTRAL_DIMS,
        tmrAiProbability: 0.92,
      }));
      expect(result.label).toBe('almost-certainly-ai');
    });

    it('rules=human + TMR=strong AI (no authenticity) → likely-ai', (): void => {
      const result = combineScores(input({
        rulesLabel: 'feels-human',
        rulesConfidence: 'medium',
        rulesDimensions: NEUTRAL_DIMS,
        tmrAiProbability: 0.95,
      }));
      expect(result.label).toBe('likely-ai');
    });

    it('rules=possibly-ai + TMR=strong human → feels-human', (): void => {
      const result = combineScores(input({
        rulesLabel: 'possibly-ai',
        rulesDimensions: NEUTRAL_DIMS,
        tmrAiProbability: 0.05,
      }));
      expect(result.label).toBe('feels-human');
    });

    it('rules=possibly-ai + TMR=strong AI → almost-certainly-ai', (): void => {
      const result = combineScores(input({
        rulesLabel: 'possibly-ai',
        rulesDimensions: NEUTRAL_DIMS,
        tmrAiProbability: 0.95,
      }));
      expect(result.label).toBe('almost-certainly-ai');
    });
  });

  describe('authenticity dampening', (): void => {
    it('caps TMR AI probability when rules has strong authenticity signals', (): void => {
      // Rules says human with high authenticity; TMR says 98% AI.
      // Without dampening this would be likely-ai. With dampening → possibly-ai.
      const result = combineScores(input({
        rulesLabel: 'feels-human',
        rulesConfidence: 'medium',
        rulesDimensions: AUTHENTIC_DIMS,
        tmrAiProbability: 0.98,
      }));
      expect(['feels-human', 'possibly-ai']).toContain(result.label);
      expect(result.label).not.toBe('likely-ai');
      expect(result.label).not.toBe('almost-certainly-ai');
    });

    it('does NOT dampen TMR when rules does not say feels-human', (): void => {
      const result = combineScores(input({
        rulesLabel: 'possibly-ai',
        rulesDimensions: AUTHENTIC_DIMS,
        tmrAiProbability: 0.95,
      }));
      expect(result.label).toBe('almost-certainly-ai');
    });

    it('does NOT dampen TMR when templating is high', (): void => {
      const result = combineScores(input({
        rulesLabel: 'feels-human',
        rulesDimensions: { ...AUTHENTIC_DIMS, templating: 0.6 },
        tmrAiProbability: 0.95,
      }));
      expect(result.label).toBe('likely-ai');
    });
  });

  describe('comments', (): void => {
    it('returns rules label for comments even when TMR disagrees', (): void => {
      const result = combineScores(input({
        itemType: 'comment',
        rulesLabel: 'likely-ai',
        tmrAiProbability: 0.05,
      }));
      expect(result.label).toBe('likely-ai');
    });

    it('boosts confidence when TMR agrees on comment direction', (): void => {
      const result = combineScores(input({
        itemType: 'comment',
        rulesLabel: 'feels-human',
        rulesConfidence: 'medium',
        tmrAiProbability: 0.1,
      }));
      expect(result.confidence).toBe('high');
    });

    it('preserves confidence when TMR disagrees on comment', (): void => {
      const result = combineScores(input({
        itemType: 'comment',
        rulesLabel: 'feels-human',
        rulesConfidence: 'medium',
        tmrAiProbability: 0.9,
      }));
      expect(result.confidence).toBe('medium');
    });
  });

  describe('pre-AI era hard rule', (): void => {
    // Activity ID 6925219035013947392 → April 27, 2022 (pre-AI)
    const PRE_AI_URN: string = 'urn:li:activity:6925219035013947392';
    const POST_AI_URN: string = 'urn:li:activity:7100000000000000000';

    it('overrides to feels-human for posts with pre-2023 activity URN', (): void => {
      const result = combineScores(input({
        activityUrn: PRE_AI_URN,
        rulesLabel: 'likely-ai',
        tmrAiProbability: 0.99,
      }));
      expect(result.label).toBe('feels-human');
      expect(result.confidence).toBe('high');
    });

    it('does NOT override for posts with post-2023 activity URN', (): void => {
      const result = combineScores(input({
        activityUrn: POST_AI_URN,
        rulesLabel: 'likely-ai',
        tmrAiProbability: 0.9,
      }));
      expect(result.label).not.toBe('feels-human');
    });

    it('does NOT override when activityUrn is null and no age text', (): void => {
      const result = combineScores(input({
        activityUrn: null,
        rulesLabel: 'likely-ai',
        tmrAiProbability: 0.9,
      }));
      expect(result.label).not.toBe('feels-human');
    });

    it('falls back to postAgeText when no URN', (): void => {
      const result = combineScores(input({
        activityUrn: null,
        postAgeText: '4yr',
        rulesLabel: 'likely-ai',
        tmrAiProbability: 0.99,
      }));
      expect(result.label).toBe('feels-human');
    });
  });
});

describe('isPreAiEra', (): void => {
  it('returns true for pre-2023 activity URN', (): void => {
    expect(isPreAiEra('urn:li:activity:6925219035013947392', null)).toBe(true);
  });

  it('returns false for post-2023 activity URN', (): void => {
    expect(isPreAiEra('urn:li:activity:7100000000000000000', null)).toBe(false);
  });

  it('returns false for non-URN post IDs without age text', (): void => {
    expect(isPreAiEra('ck_hash_abc', null)).toBe(false);
  });

  it('falls back to postAgeText when no URN', (): void => {
    expect(isPreAiEra('ck_hash_abc', '4yr')).toBe(true);
    expect(isPreAiEra('ck_hash_abc', '2yr')).toBe(true);
    expect(isPreAiEra('ck_hash_abc', '1yr')).toBe(false);
  });

  it('prefers URN over postAgeText', (): void => {
    expect(isPreAiEra('urn:li:activity:6925219035013947392', '1yr')).toBe(true);
  });

  it('handles activity URN extracted from page URL', (): void => {
    expect(isPreAiEra('urn:li:activity:6925219035013947392', null)).toBe(true);
  });
});
