/**
 * Extracts per-item rules engine scores for every golden set item.
 * Output: rules-scores.json with label, confidence, dimensions per item.
 */

import { writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GOLDEN_SET } from '../../src/rules-engine/golden-set';
import { scoreWithRules, createRulesItem } from '../../src/rules-engine';

import type { ExtractedItem, ScoringResult } from '../../src/shared/types';

const __dirname = dirname(fileURLToPath(import.meta.url));

interface RulesScoreItem {
  readonly id: string;
  readonly text: string;
  readonly itemType: 'post' | 'comment';
  readonly charCount: number;
  readonly expectedLabel: string;
  readonly acceptableLabels: readonly string[];
  readonly rulesLabel: string;
  readonly rulesConfidence: string;
  readonly rulesDimensions: object;
}

const results: RulesScoreItem[] = [];

for (const item of GOLDEN_SET) {
  const extracted: ExtractedItem = createRulesItem(item.text, item.itemType);
  const result: ScoringResult = scoreWithRules(extracted);

  results.push({
    id: item.id,
    text: item.text,
    itemType: item.itemType,
    charCount: item.text.length,
    expectedLabel: item.expectedLabel,
    acceptableLabels: item.acceptableLabels,
    rulesLabel: result.label,
    rulesConfidence: result.confidence,
    rulesDimensions: result.dimensions,
  });
}

const outPath: string = resolve(__dirname, 'rules-scores.json');
writeFileSync(outPath, JSON.stringify({ itemCount: results.length, items: results }, null, 2));

const correct: number = results.filter(r => r.acceptableLabels.includes(r.rulesLabel)).length;
console.log(`Rules scores extracted: ${results.length} items`);
console.log(`Acceptable accuracy: ${correct}/${results.length} (${(correct / results.length * 100).toFixed(1)}%)`);
console.log(`Written to: ${outPath}`);
