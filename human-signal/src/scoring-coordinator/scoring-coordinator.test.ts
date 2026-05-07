import { describe, expect, it } from 'vitest';

import { ScoreCache, ScoringQueue } from '@/scoring-coordinator';
import { createRulesItem, scoreWithRules } from '@/rules-engine';

import type { QueueItem } from '@/scoring-coordinator';
import type { ContentHash, ExtractedItem, ScoringResult } from '@/shared/types';

describe('ScoreCache', (): void => {
  it('returns cached entries only when scoring version matches', async (): Promise<void> => {
    const cache: ScoreCache = new ScoreCache({ maxEntries: 10, ttlMs: 60_000 });
    const item: ExtractedItem = createRulesItem('I shipped 2 changes last quarter.', 'post');
    const result: ScoringResult = scoreWithRules(item);

    await cache.set(item.metadata.contentHash, result);

    await expect(cache.get(item.metadata.contentHash, result.scoringVersion)).resolves.toEqual(result);
    await expect(cache.get(item.metadata.contentHash, 'other-version')).resolves.toBeNull();
  });

  it('evicts oldest entries when capacity is exceeded', async (): Promise<void> => {
    const cache: ScoreCache = new ScoreCache({ maxEntries: 2, ttlMs: 60_000 });
    const first: ExtractedItem = createRulesItem('First item with 1 metric.', 'post');
    const second: ExtractedItem = createRulesItem('Second item with 2 metrics.', 'post');
    const third: ExtractedItem = createRulesItem('Third item with 3 metrics.', 'post');

    await cache.set(first.metadata.contentHash, scoreWithRules(first));
    await cache.set(second.metadata.contentHash, scoreWithRules(second));
    await cache.set(third.metadata.contentHash, scoreWithRules(third));

    await expect(cache.getSize()).resolves.toBeLessThanOrEqual(2);
  });
});

describe('ScoringQueue', (): void => {
  it('orders items by priority and insertion time', (): void => {
    const queue: ScoringQueue = new ScoringQueue(10);
    const lowPriorityItem: QueueItem = createQueueItem('low', 3);
    const highPriorityItem: QueueItem = createQueueItem('high', 1);

    queue.enqueue(lowPriorityItem);
    queue.enqueue(highPriorityItem);

    expect(queue.dequeue()?.item.itemId).toBe(highPriorityItem.item.itemId);
    expect(queue.dequeue()?.item.itemId).toBe(lowPriorityItem.item.itemId);
  });

  it('trims lowest-priority overflow entries', (): void => {
    const queue: ScoringQueue = new ScoringQueue(1);

    queue.enqueue(createQueueItem('first', 3));
    queue.enqueue(createQueueItem('second', 1));

    expect(queue.getDepth()).toBe(1);
    expect(queue.dequeue()?.priority).toBe(1);
  });
});

function createQueueItem(text: string, priority: QueueItem['priority']): QueueItem {
  const item: ExtractedItem = createRulesItem(text, 'post');

  return {
    item,
    contentHash: item.metadata.contentHash as ContentHash,
    priority,
    tabId: null,
    addedAt: Date.now(),
  };
}
