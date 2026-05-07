import { classify, DEFAULT_CLASSIFICATION_THRESHOLDS } from '@/rules-engine/classifier';
import { extractFeatures } from '@/rules-engine/features';
import { createContentHash } from '@/shared/hash';

import type { ClassificationResult, ClassificationThresholds } from '@/rules-engine/classifier';
import type { TextFeatures } from '@/rules-engine/features';
import type { ExtractedItem, ScoringResult } from '@/shared/types';

export const RULES_SCORING_VERSION: string = 'rules-1';

export function scoreWithRules(
  item: ExtractedItem,
  thresholds: ClassificationThresholds = DEFAULT_CLASSIFICATION_THRESHOLDS,
): ScoringResult {
  const features: TextFeatures = extractFeatures(item.text);
  const classification: ClassificationResult = classify(features, item.itemType, thresholds);

  return {
    itemId: item.itemId,
    label: classification.label,
    confidence: classification.confidence,
    dimensions: classification.dimensions,
    explanation: classification.reasons.join(' '),
    source: 'rules',
    scoringVersion: RULES_SCORING_VERSION,
    scoredAt: Date.now(),
    isTextTruncated: item.isTruncated,
  };
}

export function createRulesItem(text: string, itemType: ExtractedItem['itemType']): ExtractedItem {
  const contentHash = createContentHash(text);

  return {
    itemId: `${itemType}_${contentHash}` as ExtractedItem['itemId'],
    itemType,
    text,
    metadata: {
      contentHash,
      sourceUrl: null,
      detectedAt: Date.now(),
      idStability: 'content-hash',
    },
    isTruncated: false,
  };
}
