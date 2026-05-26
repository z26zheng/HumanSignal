import { describe, expect, it } from 'vitest';

import { classify, createRulesItem, extractFeatures, scoreWithRules } from '@/rules-engine';
import { GOLDEN_SET } from '@/rules-engine/golden-set';
import { LLM_EVALUATION_SET } from '@/rules-engine/llm-evaluation-set';

import type { ExtractedItem, ScoringLabel } from '@/shared/types';
import type { GoldenSetItem } from '@/rules-engine/golden-set';
import type { LlmEvaluationItem } from '@/rules-engine/llm-evaluation-set';

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
  it('classifies obvious engagement bait as almost-certainly-ai', (): void => {
    const item: ExtractedItem = createRulesItem(
      'Comment AI and I will send you the full template.',
      'post',
    );
    const result = scoreWithRules(item);

    expect(result.label).toBe('almost-certainly-ai');
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

  // Regression: emotional/empathetic posts with no metrics were being labeled
  // "possibly-ai" before the conversational-signals path was added.
  // These two posts are confirmed human (laid-off employee thank-you message).
  describe('regression: emotional/empathetic posts (no metrics)', (): void => {
    it('classifies short sharing message with community references as feels-human', (): void => {
      const item = createRulesItem(
        'Sharing this very same message to ex-hoodies. Feel free to reach out and let me know how I can help in any way!',
        'post',
      );
      const result = scoreWithRules(item);

      expect(result.label).toBe('feels-human');
      expect(result.dimensions.authenticity).toBeGreaterThanOrEqual(0.5);
      expect(result.dimensions.templating).toBeLessThan(0.4);
    });

    it('classifies long layoff support message as feels-human', (): void => {
      const item = createRulesItem(
        [
          'To my network:',
          'As many of you know, Robinhood layoff impacted some of my dear colleagues yesterday.',
          'If you are looking to fill positions at your company, please consider these ex-hoodies.',
          'They are some of the most mission-driven, smart, and humble people I know.',
          '',
          'To the ex-hoodies that I was lucky to work with:',
          "It was truly my pleasure to have the opportunity to rally ups and downs together with all of you.",
          "I miss you dearly and know you will continue to do amazing things! 💚",
          "Please don't be a stranger, and let me know if I can help you in any way, shape, or form.",
        ].join('\n'),
        'post',
      );
      const result = scoreWithRules(item);

      expect(result.label).toBe('feels-human');
      expect(result.dimensions.authenticity).toBeGreaterThanOrEqual(0.8);
      expect(result.dimensions.templating).toBeLessThan(0.2);
    });
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

    expect(result.label).toBe('probably-ai');
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

describe('rules agreement with LLM-labeled evaluation set', (): void => {
  it('contains broad post and comment coverage', (): void => {
    expect(LLM_EVALUATION_SET.length).toBeGreaterThanOrEqual(20);
    expect(new Set(LLM_EVALUATION_SET.map((item: LlmEvaluationItem): string => item.itemType))).toEqual(
      new Set(['post', 'comment']),
    );
  });

  it('meets the LLM-labeled agreement gate', (): void => {
    const disagreements: string[] = [];
    let agreementCount: number = 0;

    for (const item of LLM_EVALUATION_SET) {
      const actualLabel: ScoringLabel = scoreLlmEvaluationItem(item);

      if (item.acceptableLabels.includes(actualLabel)) {
        agreementCount += 1;
      } else {
        disagreements.push(
          `${item.id}: llm=${item.llmLabel}, rules=${actualLabel}, rationale=${item.rationale}`,
        );
      }
    }

    const agreementRate: number = agreementCount / LLM_EVALUATION_SET.length;

    expect(agreementRate, disagreements.join('\n')).toBeGreaterThanOrEqual(0.8);
  });
});

function scoreGoldenSetItem(item: GoldenSetItem): ScoringLabel {
  const extractedItem: ExtractedItem = createRulesItem(item.text, item.itemType);
  return scoreWithRules(extractedItem).label;
}

function scoreLlmEvaluationItem(item: LlmEvaluationItem): ScoringLabel {
  const extractedItem: ExtractedItem = createRulesItem(item.text, item.itemType);
  return scoreWithRules(extractedItem).label;
}
