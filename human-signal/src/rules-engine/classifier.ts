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
    return createResult('possibly-human', 'low', features,
      ['Too short to classify confidently.']);
  }

  // Promotional / product-launch structure. Polished marketing copy and
  // AI-assisted product pitches lean on emoji-numbered feature lists, product
  // URLs, and calls-to-action ("star it", "sign up"). These posts also tend
  // to be loaded with first-person + concrete detail, so without this guard
  // they slip through the feels-human paths below. Catch them first.
  if (isPromotionalPost(features)) {
    // An emoji-numbered feature list (1️⃣2️⃣3️⃣…) is the strongest signal.
    if (features.keycapListCount >= 2) {
      return createResult('probably-ai', 'medium', features,
        ['Product-pitch structure: emoji-numbered feature list with calls to action and links.']);
    }
    return createResult('possibly-ai', 'medium', features,
      ['Promotional / product-launch language (calls to action, links) rather than a personal account.']);
  }

  if (isGenericPost(features, thresholds)) {
    return createResult('probably-ai', 'medium', features,
      ['Generic structure with no personal detail. Matches common AI output patterns.']);
  }

  if (features.listicleScore > thresholds.listicleScoreMin && features.evidenceCount === 0) {
    return createResult('probably-ai', 'medium', features,
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

  // First-person narrative with at least SOME concrete evidence (entity, number,
  // or date) — weaker than the thresholds above, but still more specific than
  // pure template language. Catches posts like "I led this project at Robinhood"
  // that have 1 entity + 1 number but not 2 of either.
  const authenticitySignals: number =
    features.concreteNumberCount + features.namedEntityCount + features.dateReferenceCount;
  if (
    features.firstPersonCount >= 2 &&
    authenticitySignals >= 2 &&
    features.motivationalClicheCount === 0 &&
    features.engagementBaitScore === 0
  ) {
    return createResult('feels-human', 'low', features,
      ['Personal narrative with concrete details and no templated language.']);
  }

  // Personal / emotional narrative: posts addressing a specific audience
  // (layoffs, congratulations, support messages) often lack technical metrics
  // but have strong conversational and empathetic markers. As long as there
  // are NO AI-leaning signals (cliché, engagement bait, listicle structure),
  // treat this as human. We accept either (a) several first-person refs
  // with some conversational cues, OR (b) a single first-person ref with
  // abundant conversational signals.
  const noAiSignals: boolean =
    features.motivationalClicheCount === 0 &&
    features.engagementBaitScore === 0 &&
    features.listicleScore === 0 &&
    features.genericPhraseCount === 0;

  if (
    noAiSignals &&
    ((features.firstPersonCount >= 2 && features.conversationalSignals >= 2) ||
      (features.firstPersonCount >= 1 && features.conversationalSignals >= 3))
  ) {
    return createResult('feels-human', 'medium', features,
      ['Personal narrative with conversational and emotional markers.']);
  }

  // Shorter empathetic posts: a single first-person reference plus emoji or
  // direct-address phrasing is still distinctly human (congrats messages,
  // brief shares). Avoid pushing these into "possibly-ai" purgatory.
  if (
    noAiSignals &&
    features.hasFirstPerson &&
    features.conversationalSignals >= 1
  ) {
    return createResult('feels-human', 'low', features,
      ['Personal voice with at least one conversational or emotional cue.']);
  }

  if (hasMixedPostSignals(features)) {
    return createResult('possibly-ai', 'low', features,
      ['Some signs of personal context, but also some templated or generic patterns.']);
  }

  return createResult('possibly-human', 'low', features,
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
    return createResult('possibly-human', 'low', features,
      ['Too short to classify confidently.']);
  }

  if (features.genericPhraseCount > 0) {
    return createResult('probably-ai', 'medium', features,
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

  return createResult('possibly-human', 'low', features,
    ['Too short or too ambiguous to classify confidently.']);
}

/**
 * True when a post reads as a product launch / marketing pitch rather than a
 * personal account. Triggers on an emoji-numbered feature list, or on a
 * combination of product calls-to-action and an external link, or on
 * multiple calls-to-action. Deliberately ignores the personal "reach out /
 * let me know" phrasing that genuine human posts use.
 */
function isPromotionalPost(features: TextFeatures): boolean {
  if (features.keycapListCount >= 2) {
    return true;
  }
  if (features.promotionalCtaCount >= 1 && features.hasProductUrl) {
    return true;
  }
  return features.promotionalCtaCount >= 2;
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
  // Conversational signals (direct address, empathy, emoji, community terms)
  // are treated as authenticity evidence equivalent to first-person references.
  // This lets emotional/empathetic posts (layoff, condolences, congrats)
  // achieve high authenticity without requiring concrete metrics.
  const conversationalContribution: number = features.conversationalSignals;
  return {
    authenticity: clamp01(
      (features.firstPersonCount + features.evidenceCount + conversationalContribution) / 6,
    ),
    originality: clamp01(features.uniqueWordRatio - features.motivationalClicheCount * 0.2),
    specificity: clamp01(
      (features.concreteNumberCount + features.namedEntityCount + features.dateReferenceCount
        + features.properNounCount * 0.5) / 5,
    ),
    usefulness: clamp01((features.evidenceCount + features.questionCount) / 5),
    engagementBait: features.engagementBaitScore,
    templating: clamp01(features.motivationalClicheCount / 3 + features.listicleScore / 2),
  };
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, Number(value.toFixed(3))));
}
