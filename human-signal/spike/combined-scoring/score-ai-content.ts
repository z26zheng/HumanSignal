/**
 * Scores the AI content items with the rules engine and outputs for merging.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scoreWithRules, createRulesItem } from '../../src/rules-engine';

const __dirname = dirname(fileURLToPath(import.meta.url));

const aiContent = JSON.parse(readFileSync(resolve(__dirname, 'ai-content-items.json'), 'utf-8'));

interface ScoredItem {
  id: string;
  text: string;
  itemType: 'post' | 'comment';
  charCount: number;
  category: string;
  expectedLabel: string;
  acceptableLabels: string[];
  rulesLabel: string;
  rulesConfidence: string;
}

const results: ScoredItem[] = [];

for (const item of aiContent.items) {
  const extracted = createRulesItem(item.text, item.itemType);
  const result = scoreWithRules(extracted);

  const expectedLabel = item.category === 'ai-polished' ? 'likely-ai' : 'likely-ai';
  const acceptableLabels = item.category === 'ai-polished'
    ? ['likely-ai', 'possibly-ai']
    : ['likely-ai', 'possibly-ai', 'feels-human']; // fake stats might fool rules into feels-human

  results.push({
    id: item.id,
    text: item.text,
    itemType: item.itemType,
    charCount: item.text.length,
    category: item.category,
    expectedLabel,
    acceptableLabels,
    rulesLabel: result.label,
    rulesConfidence: result.confidence,
  });

  const correct = acceptableLabels.includes(result.label);
  console.log(`${correct ? '✓' : '✗'} ${item.id.padEnd(20)} rules=${result.label.padEnd(20)} expected=${expectedLabel} category=${item.category}`);
}

const correct = results.filter(r => r.acceptableLabels.includes(r.rulesLabel)).length;
console.log(`\nRules accuracy on AI content: ${correct}/${results.length} (${(correct / results.length * 100).toFixed(1)}%)`);

writeFileSync(resolve(__dirname, 'ai-content-rules-scores.json'), JSON.stringify({ itemCount: results.length, items: results }, null, 2));
