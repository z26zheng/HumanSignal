import { describe, expect, it } from 'vitest';

import { classify, createRulesItem, extractFeatures, scoreWithRules } from '@/rules-engine';
import { GOLDEN_SET } from '@/rules-engine/golden-set';

import type { ExtractedItem, ScoringLabel } from '@/shared/types';
import type { GoldenSetItem } from '@/rules-engine/golden-set';

describe('rules feature extraction', (): void => {
  it('extracts concrete evidence and first-person signals', (): void => {
    const features = extractFeatures(
      'I shipped the rollout in April 2026 and reduced failures from 18% to 4% at ExampleCo.',
    );

    expect(features.hasFirstPerson).toBe(true);
    expect(features.concreteNumberCount).toBeGreaterThanOrEqual(3);
    expect(features.dateReferenceCount).toBeGreaterThanOrEqual(1);
    expect(features.percentageCount).toBe(2);
    expect(features.namedEntityCount).toBeGreaterThanOrEqual(1);
  });

  it('handles empty input without crashing', (): void => {
    const features = extractFeatures('');

    expect(features.charCount).toBe(0);
    expect(features.wordCount).toBe(0);
    expect(features.uniqueWordRatio).toBe(0);
  });
});

describe('rules classification', (): void => {
  it('classifies obvious engagement bait as high-confidence engagement bait', (): void => {
    const item: ExtractedItem = createRulesItem(
      'Comment AI and I will send you the full template.',
      'post',
    );
    const result = scoreWithRules(item);

    expect(result.label).toBe('engagement-bait');
    expect(result.confidence).toBe('high');
    expect(result.source).toBe('rules');
  });

  it('returns coherent dimensions and explanations', (): void => {
    const item: ExtractedItem = createRulesItem(
      'We migrated 14 teams last quarter and reduced review time by 27%.',
      'post',
    );
    const result = scoreWithRules(item);

    expect(result.explanation.length).toBeGreaterThan(10);
    expect(result.dimensions.specificity).toBeGreaterThan(0);
    expect(result.scoringVersion).toBe('rules-1');
  });

  it('keeps classification thresholds outside the decision function', (): void => {
    const features = extractFeatures('Here are lessons nobody tells you about leadership.');
    const result = classify(features, 'post', {
      engagementBaitMin: 0.7,
      shortPostMaxChars: 10,
      genericPhraseRatioMin: 0.5,
      listicleScoreMin: 0.1,
      specificNumbersMin: 2,
      specificEntitiesMin: 2,
      shortCommentMaxChars: 24,
      thoughtfulMinChars: 100,
      thoughtfulUniqueWordMin: 0.6,
      questionMinChars: 30,
    });

    expect(result.label).toBe('low-signal');
  });
});

describe('rules golden set', (): void => {
  it('contains at least 100 labeled items', (): void => {
    expect(GOLDEN_SET.length).toBeGreaterThanOrEqual(100);
  });

  it('passes the 80 percent agreement gate', (): void => {
    const disagreements: string[] = [];
    let agreementCount: number = 0;

    for (const item of GOLDEN_SET) {
      const actualLabel: ScoringLabel = scoreGoldenSetItem(item);

      if (item.acceptableLabels.includes(actualLabel)) {
        agreementCount += 1;
      } else {
        disagreements.push(`${item.id}: expected ${item.expectedLabel}, received ${actualLabel}`);
      }
    }

    const agreementRate: number = agreementCount / GOLDEN_SET.length;

    expect(agreementRate, disagreements.join('\n')).toBeGreaterThanOrEqual(0.8);
  });

  it('handles very long text without throwing', (): void => {
    const longText: string = `${'Specific rollout detail. '.repeat(500)} We reduced defects by 12%.`;
    const item: ExtractedItem = createRulesItem(longText, 'post');

    expect((): void => {
      scoreWithRules(item);
    }).not.toThrow();
  });
});

function scoreGoldenSetItem(item: GoldenSetItem): ScoringLabel {
  const extractedItem: ExtractedItem = createRulesItem(item.text, item.itemType);
  return scoreWithRules(extractedItem).label;
}
