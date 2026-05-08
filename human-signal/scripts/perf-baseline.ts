import { performance } from 'node:perf_hooks';

import { scoreWithRules } from '@/rules-engine';
import { createContentHash } from '@/shared/hash';

import type { ContentHash, ExtractedItem, ItemId } from '@/shared/types';

const sampleTexts: readonly string[] = [
  'I shipped a hiring dashboard at ExampleCo last quarter. It reduced review time by 27% after three iterations.',
  'Comment AI and I will send you the template.',
  'Great insights',
  'We reduced cold start time by 41% after profiling service worker startup.',
  'I disagree with the premise. The retention issue was onboarding friction, not pricing.',
  'Five lessons from rebuilding our analytics pipeline: measure first, delete dead jobs, and keep alerts actionable.',
];

const itemCount: number = Number.parseInt(process.env.HUMAN_SIGNAL_PERF_ITEMS ?? '1000', 10);
const items: readonly ExtractedItem[] = Array.from({ length: itemCount }, (_value: unknown, index: number) =>
  createItem(index, getSampleText(index)),
);

const startedAt: number = performance.now();

for (const item of items) {
  scoreWithRules(item);
}

const elapsedMs: number = performance.now() - startedAt;
const avgMsPerItem: number = elapsedMs / itemCount;

console.log(
  JSON.stringify(
    {
      itemCount,
      totalMs: roundMetric(elapsedMs),
      avgMsPerItem: roundMetric(avgMsPerItem),
      targetMsPerItem: 5,
      passed: avgMsPerItem < 5,
    },
    null,
    2,
  ),
);

if (avgMsPerItem >= 5) {
  process.exitCode = 1;
}

function createItem(index: number, text: string): ExtractedItem {
  const contentHash: ContentHash = createContentHash(`${index}:${text}`);

  return {
    itemId: `perf-${index}` as ItemId,
    itemType: index % 5 === 0 ? 'comment' : 'post',
    text,
    metadata: {
      contentHash,
      sourceUrl: 'https://www.linkedin.com/feed/',
      detectedAt: 0,
      idStability: 'content-hash',
    },
    isTruncated: false,
  };
}

function getSampleText(index: number): string {
  const text: string | undefined = sampleTexts[index % sampleTexts.length] ?? sampleTexts[0];

  if (text === undefined) {
    throw new Error('Performance benchmark needs at least one sample text.');
  }

  return text;
}

function roundMetric(value: number): number {
  return Math.round(value * 1000) / 1000;
}
