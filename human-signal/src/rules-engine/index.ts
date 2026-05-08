export { classify, DEFAULT_CLASSIFICATION_THRESHOLDS } from '@/rules-engine/classifier';
export { extractFeatures } from '@/rules-engine/features';
export { LLM_EVALUATION_SET } from '@/rules-engine/llm-evaluation-set';
export { RULES_SCORING_VERSION, createRulesItem, scoreWithRules } from '@/rules-engine/rules-engine';

export type { ClassificationResult, ClassificationThresholds } from '@/rules-engine/classifier';
export type { LlmEvaluationItem } from '@/rules-engine/llm-evaluation-set';
export type { TextFeatures } from '@/rules-engine/features';
