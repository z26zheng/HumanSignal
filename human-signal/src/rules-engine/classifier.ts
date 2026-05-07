import type { ExtractedItemType, ScoreDimensions, ScoringLabel, ConfidenceLabel } from '@/shared/types';
import type { TextFeatures } from '@/rules-engine/features';

export interface ClassificationThresholds {
  readonly engagementBaitMin: number;
  readonly shortPostMaxChars: number;
  readonly genericPhraseRatioMin: number;
  readonly listicleScoreMin: number;
  readonly specificNumbersMin: number;
  readonly specificEntitiesMin: number;
  readonly shortCommentMaxChars: number;
  readonly thoughtfulMinChars: number;
  readonly thoughtfulUniqueWordMin: number;
  readonly questionMinChars: number;
}

export interface ClassificationResult {
  readonly label: ScoringLabel;
  readonly confidence: ConfidenceLabel;
  readonly dimensions: ScoreDimensions;
  readonly reasons: readonly string[];
}

export const DEFAULT_CLASSIFICATION_THRESHOLDS: ClassificationThresholds = {
  engagementBaitMin: 0.7,
  shortPostMaxChars: 50,
  genericPhraseRatioMin: 0.5,
  listicleScoreMin: 0.6,
  specificNumbersMin: 2,
  specificEntitiesMin: 2,
  shortCommentMaxChars: 24,
  thoughtfulMinChars: 100,
  thoughtfulUniqueWordMin: 0.6,
  questionMinChars: 30,
};

export function classify(
  features: TextFeatures,
  itemType: ExtractedItemType,
  thresholds: ClassificationThresholds = DEFAULT_CLASSIFICATION_THRESHOLDS,
): ClassificationResult {
  return itemType === 'post'
    ? classifyPost(features, thresholds)
    : classifyComment(features, thresholds);
}

function classifyPost(
  features: TextFeatures,
  thresholds: ClassificationThresholds,
): ClassificationResult {
  if (features.engagementBaitScore > thresholds.engagementBaitMin) {
    return createResult('engagement-bait', 'high', features);
  }

  if (features.charCount < thresholds.shortPostMaxChars) {
    return createResult('unclear', 'low', features);
  }

  if (isGenericPost(features, thresholds)) {
    return createResult('generic', 'medium', features);
  }

  if (features.listicleScore > thresholds.listicleScoreMin && features.evidenceCount === 0) {
    return createResult('low-signal', 'medium', features);
  }

  if (
    (features.concreteNumberCount >= thresholds.specificNumbersMin || features.dateReferenceCount >= 1) &&
    features.hasFirstPerson
  ) {
    return createResult('specific', 'medium', features);
  }

  if (
    features.namedEntityCount >= thresholds.specificEntitiesMin &&
    features.firstPersonCount >= 2
  ) {
    return createResult('high-signal', 'medium', features);
  }

  if (hasMixedPostSignals(features)) {
    return createResult('mixed', 'low', features);
  }

  return createResult('unclear', 'low', features);
}

function classifyComment(
  features: TextFeatures,
  thresholds: ClassificationThresholds,
): ClassificationResult {
  if (features.charCount <= thresholds.shortCommentMaxChars && features.genericPhraseCount > 0) {
    return createResult('low-effort', 'high', features);
  }

  if (features.charCount < 10) {
    return createResult('unclear', 'low', features);
  }

  if (features.genericPhraseCount > 0) {
    return createResult('generic', 'medium', features);
  }

  if (features.questionCount >= 1 && features.charCount > thresholds.questionMinChars) {
    return createResult('question', 'medium', features);
  }

  if (features.concreteNumberCount >= 1 || features.namedEntityCount >= 1) {
    return createResult('specific', 'medium', features);
  }

  if (
    features.charCount > thresholds.thoughtfulMinChars &&
    features.uniqueWordRatio > thresholds.thoughtfulUniqueWordMin
  ) {
    return createResult('thoughtful', 'medium', features);
  }

  return createResult('unclear', 'low', features);
}

function isGenericPost(features: TextFeatures, thresholds: ClassificationThresholds): boolean {
  const hasGenericLanguage: boolean =
    features.genericPhraseRatio > thresholds.genericPhraseRatioMin ||
    features.motivationalClicheCount >= 1;

  return hasGenericLanguage && features.concreteNumberCount === 0 && features.namedEntityCount === 0;
}

function hasMixedPostSignals(features: TextFeatures): boolean {
  return (
    features.hasFirstPerson ||
    features.concreteNumberCount > 0 ||
    features.namedEntityCount > 0 ||
    features.listicleScore > 0
  );
}

function createResult(
  label: ScoringLabel,
  confidence: ConfidenceLabel,
  features: TextFeatures,
): ClassificationResult {
  return {
    label,
    confidence,
    dimensions: calculateDimensions(features),
    reasons: generateReasons(features, label),
  };
}

function calculateDimensions(features: TextFeatures): ScoreDimensions {
  return {
    authenticity: clamp01((features.firstPersonCount + features.evidenceCount) / 6),
    originality: clamp01(features.uniqueWordRatio - features.motivationalClicheCount * 0.2),
    specificity: clamp01(
      (features.concreteNumberCount + features.namedEntityCount + features.dateReferenceCount) / 5,
    ),
    usefulness: clamp01((features.evidenceCount + features.questionCount) / 5),
    engagementBait: features.engagementBaitScore,
    templating: clamp01(features.motivationalClicheCount / 3 + features.listicleScore / 2),
  };
}

function generateReasons(features: TextFeatures, label: ScoringLabel): readonly string[] {
  switch (label) {
    case 'engagement-bait':
      return ['Contains a direct engagement request or gated giveaway pattern.'];
    case 'generic':
      return ['Uses broad praise or motivational language without concrete supporting detail.'];
    case 'low-signal':
      return ['Uses a list or template-style structure without detected evidence.'];
    case 'specific':
      return ['Includes concrete numbers, dates, named entities, or implementation detail.'];
    case 'high-signal':
      return ['Combines personal experience with multiple specific entities or details.'];
    case 'question':
      return ['Asks a substantive question rather than only reacting.'];
    case 'thoughtful':
      return ['Adds enough original wording and context to be more than a short reaction.'];
    case 'low-effort':
      return ['Short praise phrase without additional context.'];
    case 'mixed':
      return ['Contains some concrete signal but not enough support for a stronger label.'];
    case 'unclear':
      return ['Not enough specific evidence to classify confidently.'];
    case 'repeated':
      return ['Appears repeated in context.'];
    case 'unavailable':
      return ['Scoring is unavailable.'];
  }
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, Number(value.toFixed(3))));
}
