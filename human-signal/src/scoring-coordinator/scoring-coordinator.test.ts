import { afterEach, describe, expect, it, vi } from 'vitest';

import { clearLogEntries, getLogEntries } from '@/shared/logger';
import { ScoreCache, ScoringQueue } from '@/scoring-coordinator';
import { createRulesItem, scoreWithRules } from '@/rules-engine';

import type { QueueItem } from '@/scoring-coordinator';
import type { ContentHash, ExtractedItem, ScoringResult } from '@/shared/types';

describe('ScoreCache', (): void => {
  afterEach((): void => {
    vi.unstubAllGlobals();
    clearLogEntries();
  });

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

  it('keeps memory cache available when IndexedDB writes fail', async (): Promise<void> => {
    vi.stubGlobal('indexedDB', {
      open: (): IDBOpenDBRequest => createFailingWriteOpenRequest(),
    });
    const cache: ScoreCache = new ScoreCache({ maxEntries: 10, ttlMs: 60_000 }, 'failing-write-cache');
    const item: ExtractedItem = createRulesItem('Specific update with 42% improvement.', 'post');
    const result: ScoringResult = scoreWithRules(item);

    await expect(cache.set(item.metadata.contentHash, result)).resolves.toBeUndefined();
    await expect(cache.get(item.metadata.contentHash, result.scoringVersion)).resolves.toEqual(result);
    expect(getLogEntries()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          level: 'warn',
          context: 'scoreCache.persist',
        }),
        expect.objectContaining({
          level: 'warn',
          context: 'scoreCache.persistFallback',
        }),
      ]),
    );
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

function createFailingWriteOpenRequest(): IDBOpenDBRequest {
  const objectStore = {
    put: (): IDBRequest<unknown> => createFailedRequest(new Error('quota exceeded')),
    get: (): IDBRequest<unknown> => createFailedRequest(new Error('read unavailable')),
    getAll: (): IDBRequest<unknown[]> => createSuccessfulRequest<unknown[]>([]),
    count: (): IDBRequest<number> => createSuccessfulRequest(0),
    clear: (): IDBRequest<undefined> => createSuccessfulRequest(undefined),
    delete: (): IDBRequest<undefined> => createSuccessfulRequest(undefined),
  };
  const database = {
    objectStoreNames: {
      contains: (): boolean => true,
    },
    transaction: () => ({
      objectStore: () => objectStore,
    }),
  };
  const request = {
    result: database,
    onupgradeneeded: null,
    onsuccess: null,
    onerror: null,
  } as unknown as IDBOpenDBRequest;

  setTimeout((): void => {
    request.onsuccess?.({} as Event);
  }, 0);

  return request;
}

function createSuccessfulRequest<TResult>(result: TResult): IDBRequest<TResult> {
  const request = {
    result,
    onsuccess: null,
    onerror: null,
  } as unknown as IDBRequest<TResult>;

  setTimeout((): void => {
    request.onsuccess?.({} as Event);
  }, 0);

  return request;
}

function createFailedRequest<TResult>(error: Error): IDBRequest<TResult> {
  const request = {
    error,
    onsuccess: null,
    onerror: null,
  } as unknown as IDBRequest<TResult>;

  setTimeout((): void => {
    request.onerror?.({} as Event);
  }, 0);

  return request;
}
