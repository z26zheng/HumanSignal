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
    return createResult('almost-certainly-ai', 'high', features,
      ['Strong engagement-bait or automated pattern with no human specificity.']);
  }

  if (features.charCount < thresholds.shortPostMaxChars) {
    return createResult('cant-tell', 'low', features,
      ['Too short to classify confidently.']);
  }

  if (isGenericPost(features, thresholds)) {
    return createResult('likely-ai', 'medium', features,
      ['Generic structure with no personal detail. Matches common AI output patterns.']);
  }

  if (features.listicleScore > thresholds.listicleScoreMin && features.evidenceCount === 0) {
    return createResult('likely-ai', 'medium', features,
      ['Uses a list or template-style structure without supporting evidence.']);
  }

  if (
    (features.concreteNumberCount >= thresholds.specificNumbersMin || features.dateReferenceCount >= 1) &&
    features.hasFirstPerson
  ) {
    return createResult('feels-human', 'medium', features,
      ['Includes specific personal experience with concrete details.']);
  }

  if (
    features.namedEntityCount >= thresholds.specificEntitiesMin &&
    features.firstPersonCount >= 2
  ) {
    return createResult('feels-human', 'medium', features,
      ['Combines personal experience with multiple specific entities or details.']);
  }

  if (hasMixedPostSignals(features)) {
    return createResult('possibly-ai', 'low', features,
      ['Some signs of personal context, but also some templated or generic patterns.']);
  }

  return createResult('cant-tell', 'low', features,
    ['Not enough specific evidence to classify confidently.']);
}

function classifyComment(
  features: TextFeatures,
  thresholds: ClassificationThresholds,
): ClassificationResult {
  if (features.charCount <= thresholds.shortCommentMaxChars && features.genericPhraseCount > 0) {
    return createResult('almost-certainly-ai', 'high', features,
      ['Short praise phrase matching common automated engagement patterns.']);
  }

  if (features.charCount < 10) {
    return createResult('cant-tell', 'low', features,
      ['Too short to classify confidently.']);
  }

  if (features.genericPhraseCount > 0) {
    return createResult('likely-ai', 'medium', features,
      ['Broad praise or motivational language without concrete supporting detail.']);
  }

  if (features.questionCount >= 1 && features.charCount > thresholds.questionMinChars) {
    return createResult('feels-human', 'medium', features,
      ['Asks a substantive question rather than only reacting.']);
  }

  if (features.concreteNumberCount >= 1 || features.namedEntityCount >= 1) {
    return createResult('feels-human', 'medium', features,
      ['Includes a personal anecdote with specific context or a concrete outcome.']);
  }

  if (
    features.charCount > thresholds.thoughtfulMinChars &&
    features.uniqueWordRatio > thresholds.thoughtfulUniqueWordMin
  ) {
    return createResult('feels-human', 'medium', features,
      ['Adds enough original wording and context to be more than a short reaction.']);
  }

  return createResult('cant-tell', 'low', features,
    ['Too short or too ambiguous to classify confidently.']);
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
  reasons: readonly string[],
): ClassificationResult {
  return {
    label,
    confidence,
    dimensions: calculateDimensions(features),
    reasons,
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

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, Number(value.toFixed(3))));
}
