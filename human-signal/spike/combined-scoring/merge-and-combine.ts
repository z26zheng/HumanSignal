/**
 * Merges rules + TMR scores, tests all 4 combiner strategies.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

type ScoringLabel = 'feels-human' | 'possibly-ai' | 'likely-ai' | 'almost-certainly-ai' | 'cant-tell' | 'unavailable';

interface DualScoreItem {
  id: string;
  text: string;
  itemType: 'post' | 'comment';
  charCount: number;
  expectedLabel: ScoringLabel;
  acceptableLabels: ScoringLabel[];
  rulesLabel: ScoringLabel;
  rulesConfidence: string;
  tmrAiProbability: number;
}

interface StrategyResult {
  name: string;
  total: number;
  exactCount: number;
  acceptableCount: number;
  exactAccuracy: number;
  acceptableAccuracy: number;
  flickerCount: number;
  flickerRate: number;
  tmrItemsUsed: number;
  tmrUsageRate: number;
  perCategory: Record<string, { total: number; acceptable: number; rate: number }>;
  falsePositiveOnHuman: number;
  items: { id: string; expected: ScoringLabel; rules: ScoringLabel; combined: ScoringLabel; acceptable: boolean }[];
}

// Load data
const rulesData = JSON.parse(readFileSync(resolve(__dirname, 'rules-scores.json'), 'utf-8'));
const tmrData = JSON.parse(readFileSync(resolve(__dirname, 'tmr-scores.json'), 'utf-8'));

const tmrMap = new Map<string, number>();
for (const item of tmrData.items) {
  tmrMap.set(item.id, item.tmrAiProbability);
}

const dualScores: DualScoreItem[] = rulesData.items
  .filter((r: any) => tmrMap.has(r.id))
  .map((r: any) => ({
    id: r.id,
    text: r.text,
    itemType: r.itemType,
    charCount: r.charCount,
    expectedLabel: r.expectedLabel as ScoringLabel,
    acceptableLabels: r.acceptableLabels as ScoringLabel[],
    rulesLabel: r.rulesLabel as ScoringLabel,
    rulesConfidence: r.rulesConfidence,
    tmrAiProbability: tmrMap.get(r.id) ?? 0.5,
  }));

writeFileSync(resolve(__dirname, 'dual-scores.json'), JSON.stringify({ itemCount: dualScores.length, items: dualScores }, null, 2));
console.log(`Merged ${dualScores.length} items into dual-scores.json\n`);

// Combiner strategies

function rulesOnly(item: DualScoreItem): ScoringLabel {
  return item.rulesLabel;
}

function tmrOnly(item: DualScoreItem): ScoringLabel {
  if (item.charCount < 50) return 'cant-tell';
  if (item.tmrAiProbability < 0.25) return 'feels-human';
  if (item.tmrAiProbability < 0.45) return 'possibly-ai';
  if (item.tmrAiProbability < 0.70) return 'likely-ai';
  return 'almost-certainly-ai';
}

function strategyA(item: DualScoreItem, shortCutoff: number = 100): ScoringLabel {
  // Engagement bait: rules wins
  if (item.rulesLabel === 'almost-certainly-ai') return 'almost-certainly-ai';
  // Short text: rules only
  if (item.charCount < shortCutoff) return item.rulesLabel;
  // Otherwise: combine
  const tmrLabel = tmrOnly(item);
  // If both agree, use rules label
  if (labelsAgreeDirection(item.rulesLabel, tmrLabel)) return item.rulesLabel;
  // If TMR strongly disagrees, trust TMR for posts
  if (item.itemType === 'post' && item.tmrAiProbability < 0.15) return 'feels-human';
  if (item.itemType === 'post' && item.tmrAiProbability > 0.85) return 'likely-ai';
  return item.rulesLabel;
}

function strategyB(item: DualScoreItem): ScoringLabel {
  // Rules first. TMR only breaks ties on uncertain items.
  if (item.rulesLabel === 'cant-tell' || item.rulesLabel === 'possibly-ai') {
    if (item.tmrAiProbability > 0.7) return 'likely-ai';
    if (item.tmrAiProbability < 0.3) return 'feels-human';
  }
  return item.rulesLabel;
}

function strategyC(item: DualScoreItem): ScoringLabel {
  // Rules label always primary. TMR adjusts: if strongly disagrees, downgrade one step.
  const rulesDirection = labelDirection(item.rulesLabel);
  const tmrDirection = item.tmrAiProbability > 0.5 ? 'ai' : 'human';

  if (rulesDirection === tmrDirection) return item.rulesLabel;

  // TMR strongly disagrees
  if (item.tmrAiProbability < 0.2 && item.rulesLabel === 'likely-ai') return 'possibly-ai';
  if (item.tmrAiProbability > 0.8 && item.rulesLabel === 'feels-human' && item.itemType === 'post') return 'possibly-ai';

  return item.rulesLabel;
}

function labelsAgreeDirection(a: ScoringLabel, b: ScoringLabel): boolean {
  return labelDirection(a) === labelDirection(b);
}

function labelDirection(label: ScoringLabel): 'human' | 'ai' | 'neutral' {
  if (label === 'feels-human') return 'human';
  if (label === 'likely-ai' || label === 'almost-certainly-ai') return 'ai';
  return 'neutral';
}

function getCategoryFromId(id: string): string {
  return id.replace(/-\d+$/, '');
}

function evaluate(name: string, combiner: (item: DualScoreItem) => ScoringLabel): StrategyResult {
  let exact = 0;
  let acceptable = 0;
  let flicker = 0;
  let tmrUsed = 0;
  let fpOnHuman = 0;
  const perCategory: Record<string, { total: number; acceptable: number; rate: number }> = {};
  const items: StrategyResult['items'] = [];

  for (const item of dualScores) {
    const combined = combiner(item);
    const isExact = combined === item.expectedLabel;
    const isAcceptable = item.acceptableLabels.includes(combined);
    const isFlicker = combined !== item.rulesLabel;
    const usedTmr = combined !== rulesOnly(item);

    if (isExact) exact++;
    if (isAcceptable) acceptable++;
    if (isFlicker) flicker++;
    if (usedTmr) tmrUsed++;

    const cat = getCategoryFromId(item.id);
    if (!perCategory[cat]) perCategory[cat] = { total: 0, acceptable: 0, rate: 0 };
    perCategory[cat].total++;
    if (isAcceptable) perCategory[cat].acceptable++;

    if (item.expectedLabel === 'feels-human' && (combined === 'likely-ai' || combined === 'almost-certainly-ai')) {
      fpOnHuman++;
    }

    items.push({ id: item.id, expected: item.expectedLabel, rules: item.rulesLabel, combined, acceptable: isAcceptable });
  }

  for (const cat of Object.values(perCategory)) {
    cat.rate = cat.total > 0 ? Math.round((cat.acceptable / cat.total) * 100) : 0;
  }

  return {
    name,
    total: dualScores.length,
    exactCount: exact,
    acceptableCount: acceptable,
    exactAccuracy: exact / dualScores.length,
    acceptableAccuracy: acceptable / dualScores.length,
    flickerCount: flicker,
    flickerRate: flicker / dualScores.length,
    tmrItemsUsed: tmrUsed,
    tmrUsageRate: tmrUsed / dualScores.length,
    perCategory,
    falsePositiveOnHuman: fpOnHuman,
    items,
  };
}

// Run all strategies
const strategies: StrategyResult[] = [
  evaluate('Rules Only (baseline)', rulesOnly),
  evaluate('TMR Only (threshold)', tmrOnly),
  evaluate('Strategy A: Override + Weighted (100 cutoff)', (i) => strategyA(i, 100)),
  evaluate('Strategy A: Override + Weighted (75 cutoff)', (i) => strategyA(i, 75)),
  evaluate('Strategy A: Override + Weighted (150 cutoff)', (i) => strategyA(i, 150)),
  evaluate('Strategy B: TMR as Tiebreaker', strategyB),
  evaluate('Strategy C: TMR as Confidence Modifier', strategyC),
];

// Print results
console.log('═'.repeat(80));
console.log('COMBINED SCORING EXPERIMENT RESULTS');
console.log('═'.repeat(80));
console.log('');

for (const s of strategies) {
  console.log(`── ${s.name} ──`);
  console.log(`  Exact accuracy:      ${s.exactCount}/${s.total} (${(s.exactAccuracy * 100).toFixed(1)}%)`);
  console.log(`  Acceptable accuracy: ${s.acceptableCount}/${s.total} (${(s.acceptableAccuracy * 100).toFixed(1)}%)`);
  console.log(`  Sticker flicker:     ${s.flickerCount}/${s.total} (${(s.flickerRate * 100).toFixed(1)}%)`);
  console.log(`  TMR items used:      ${s.tmrItemsUsed}/${s.total} (${(s.tmrUsageRate * 100).toFixed(1)}%)`);
  console.log(`  FP on human content: ${s.falsePositiveOnHuman}`);
  console.log('');
}

// Detailed per-category comparison
console.log('── Per-Category Acceptable Accuracy ──\n');
const categories = Object.keys(strategies[0]!.perCategory).sort();
const header = 'Category'.padEnd(30) + strategies.map(s => s.name.substring(0, 12).padStart(14)).join('');
console.log(header);
console.log('─'.repeat(header.length));

for (const cat of categories) {
  let line = cat.padEnd(30);
  for (const s of strategies) {
    const data = s.perCategory[cat];
    line += data ? `${data.rate}%`.padStart(14) : '—'.padStart(14);
  }
  console.log(line);
}

// Disagreements for best strategy
const best = strategies.reduce((a, b) => a.acceptableAccuracy > b.acceptableAccuracy ? a : b);
const disagreements = best.items.filter(i => !i.acceptable);
if (disagreements.length > 0) {
  console.log(`\n── Disagreements for "${best.name}" (${disagreements.length}) ──`);
  for (const d of disagreements) {
    console.log(`  ${d.id}: expected=${d.expected}, rules=${d.rules}, combined=${d.combined}`);
  }
}

// Save full results
writeFileSync(
  resolve(__dirname, 'results/experiment-results.json'),
  JSON.stringify({ timestamp: new Date().toISOString(), strategies }, null, 2),
);
console.log(`\nResults saved to results/experiment-results.json`);
