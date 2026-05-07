export { classify, DEFAULT_CLASSIFICATION_THRESHOLDS } from '@/rules-engine/classifier';
export { extractFeatures } from '@/rules-engine/features';
export { RULES_SCORING_VERSION, createRulesItem, scoreWithRules } from '@/rules-engine/rules-engine';

export type { ClassificationResult, ClassificationThresholds } from '@/rules-engine/classifier';
export type { TextFeatures } from '@/rules-engine/features';
