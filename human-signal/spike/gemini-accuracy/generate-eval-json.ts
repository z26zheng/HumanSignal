import { writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EVALUATION_SET, EVALUATION_SET_VERSION } from '../../src/gemini/evaluation-set';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outPath = resolve(__dirname, 'evaluation-set.json');

const output = {
  version: EVALUATION_SET_VERSION,
  itemCount: EVALUATION_SET.length,
  generatedAt: new Date().toISOString(),
  items: EVALUATION_SET,
};

writeFileSync(outPath, JSON.stringify(output, null, 2));

const categories = new Map<string, number>();
for (const item of EVALUATION_SET) {
  categories.set(item.category, (categories.get(item.category) ?? 0) + 1);
}

console.log(`Generated ${EVALUATION_SET.length} items (v${EVALUATION_SET_VERSION})`);
console.log('');
console.log('Category breakdown:');
for (const [cat, count] of Array.from(categories.entries()).sort()) {
  console.log(`  ${cat}: ${count}`);
}
console.log(`\nWritten to: ${outPath}`);
