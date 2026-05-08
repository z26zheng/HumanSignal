import { createRulesItem, LLM_EVALUATION_SET, scoreWithRules } from '@/rules-engine';

import type { LlmEvaluationItem } from '@/rules-engine';
import type { ScoringLabel } from '@/shared/types';

interface EvaluationDisagreement {
  readonly id: string;
  readonly itemType: LlmEvaluationItem['itemType'];
  readonly expected: ScoringLabel;
  readonly actual: ScoringLabel;
  readonly acceptableLabels: readonly ScoringLabel[];
  readonly rationale: string;
}

const confusion: Map<string, number> = new Map();
const disagreements: EvaluationDisagreement[] = [];
let agreementCount: number = 0;

for (const item of LLM_EVALUATION_SET) {
  const actual: ScoringLabel = scoreWithRules(createRulesItem(item.text, item.itemType)).label;
  const confusionKey: string = `${item.llmLabel}->${actual}`;
  confusion.set(confusionKey, (confusion.get(confusionKey) ?? 0) + 1);

  if (item.acceptableLabels.includes(actual)) {
    agreementCount += 1;
    continue;
  }

  disagreements.push({
    id: item.id,
    itemType: item.itemType,
    expected: item.llmLabel,
    actual,
    acceptableLabels: item.acceptableLabels,
    rationale: item.rationale,
  });
}

const agreementRate: number = agreementCount / LLM_EVALUATION_SET.length;
const report = {
  itemCount: LLM_EVALUATION_SET.length,
  agreementCount,
  agreementRate: roundMetric(agreementRate),
  minimumAgreementRate: 0.8,
  passed: agreementRate >= 0.8,
  confusion: Object.fromEntries([...confusion.entries()].sort(([left]: [string, number], [right]: [string, number]) =>
    left.localeCompare(right),
  )),
  disagreements,
};

console.log(JSON.stringify(report, null, 2));

if (!report.passed) {
  process.exitCode = 1;
}

function roundMetric(value: number): number {
  return Math.round(value * 1000) / 1000;
}
