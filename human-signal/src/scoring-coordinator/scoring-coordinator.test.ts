import { afterEach, describe, expect, it, vi } from 'vitest';

import { clearLogEntries, getLogEntries } from '@/shared/logger';
import { ScoreCache } from '@/scoring-coordinator';
import { createRulesItem, scoreWithRules } from '@/rules-engine';

import type { ContentHash, ExtractedItem, ItemId, ScoringResult } from '@/shared/types';

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

describe('scoring coordinator: rules + TMR pipeline', (): void => {
  afterEach((): void => {
    vi.unstubAllGlobals();
    clearLogEntries();
  });

  it('returns rules results immediately with trace events', async (): Promise<void> => {
    vi.stubGlobal('browser', {
      runtime: { sendMessage: vi.fn(async (): Promise<unknown> => ({})) },
      storage: { local: { get: vi.fn(async (): Promise<Record<string, unknown>> => ({})) } },
    });

    const { ScoringCoordinator } = await import('@/scoring-coordinator');
    const coordinator = new ScoringCoordinator();
    const item: ExtractedItem = createRulesItem('I shipped 3 changes in Q1 at ExampleCo.', 'post');

    const batch = await coordinator.handleScoreBatch([item], null);

    expect(batch.results.length).toBe(1);
    expect(batch.results[0]?.source).toBe('rules');
    expect(batch.results[0]?.label).not.toBe('unavailable');

    const events = batch.results[0]!.traceEvents!;
    const eventNames = events.map((e) => e.event);
    expect(eventNames).toContain('CACHE_MISS');
    expect(eventNames).toContain('RULES_STARTED');
    expect(eventNames).toContain('RULES_COMPLETED');
    expect(eventNames).not.toContain('CACHE_HIT');
  });

  it('returns CACHE_HIT on second batch for same item', async (): Promise<void> => {
    vi.stubGlobal('browser', {
      runtime: { sendMessage: vi.fn(async (): Promise<unknown> => ({})) },
      storage: { local: { get: vi.fn(async (): Promise<Record<string, unknown>> => ({})) } },
    });

    const { ScoringCoordinator } = await import('@/scoring-coordinator');
    const coordinator = new ScoringCoordinator();
    const item: ExtractedItem = createRulesItem('I shipped 3 changes in Q1 at ExampleCo.', 'post');

    await coordinator.handleScoreBatch([item], null);
    const secondBatch = await coordinator.handleScoreBatch([item], null);
    const result = secondBatch.results[0];

    const eventNames = result!.traceEvents!.map((e) => e.event);
    expect(eventNames).toContain('CACHE_HIT');
    expect(eventNames).not.toContain('RULES_STARTED');
  });

  it('trace event timestamps are monotonically increasing', async (): Promise<void> => {
    vi.stubGlobal('browser', {
      runtime: { sendMessage: vi.fn(async (): Promise<unknown> => ({})) },
      storage: { local: { get: vi.fn(async (): Promise<Record<string, unknown>> => ({})) } },
    });

    const { ScoringCoordinator } = await import('@/scoring-coordinator');
    const coordinator = new ScoringCoordinator();
    const item: ExtractedItem = createRulesItem('We reduced failures by 27% last quarter.', 'post');

    const batch = await coordinator.handleScoreBatch([item], null);
    const events = batch.results[0]!.traceEvents!;

    for (let i = 1; i < events.length; i++) {
      expect(events[i]!.timestamp).toBeGreaterThanOrEqual(events[i - 1]!.timestamp);
    }
  });

  it('does not have getMode or onGeminiStatus methods', async (): Promise<void> => {
    vi.stubGlobal('browser', {
      runtime: { sendMessage: vi.fn(async (): Promise<unknown> => ({})) },
      storage: { local: { get: vi.fn(async (): Promise<Record<string, unknown>> => ({})) } },
    });

    const { ScoringCoordinator } = await import('@/scoring-coordinator');
    const coordinator = new ScoringCoordinator();

    expect((coordinator as unknown as Record<string, unknown>)['getMode']).toBeUndefined();
    expect((coordinator as unknown as Record<string, unknown>)['onGeminiStatus']).toBeUndefined();
  });

  it('health reports mode as rules and queueDepth from TMR queue', async (): Promise<void> => {
    vi.stubGlobal('browser', {
      runtime: { sendMessage: vi.fn(async (): Promise<unknown> => ({})) },
      storage: { local: { get: vi.fn(async (): Promise<Record<string, unknown>> => ({})) } },
    });

    const { ScoringCoordinator } = await import('@/scoring-coordinator');
    const coordinator = new ScoringCoordinator();

    const health = await coordinator.getHealth(5, 0.95);
    expect(health.scoringMode).toBe('rules');
    expect(health.queueDepth).toBe(0);
    expect(health.logEntryCount).toBe(5);
  });
});

describe('regression: cache itemId mismatch (response routing bug)', (): void => {
  afterEach((): void => {
    vi.unstubAllGlobals();
    clearLogEntries();
  });

  /**
   * Regression test for the "stuck at Scoring..." bug discovered on 2026-05-18.
   *
   * Symptom: After page refresh, all stickers stayed at "Scoring..." instead
   * of updating with their labels. Logs showed handleScoreResults was called
   * with results whose `itemId` did not match ANY of the registry's entries.
   *
   * Root cause: When the cache returned a hit, the cached result's stored
   * itemId (from a previous scoring session with a different ID) was spread
   * back into the response. The content script's overlay registry uses
   * itemId for lookup, so it could not match the response items to its
   * tracked stickers, leaving them in the loading state.
   *
   * Fix: When returning a cache hit, override `itemId` with the current
   * request's `item.itemId` so the response always matches what was sent.
   */
  it('response itemId equals request itemId on cache hit even when cached result has different itemId', async (): Promise<void> => {
    vi.stubGlobal('browser', {
      runtime: { sendMessage: vi.fn(async (): Promise<unknown> => ({})) },
      storage: { local: { get: vi.fn(async (): Promise<Record<string, unknown>> => ({})) } },
    });

    const { ScoringCoordinator, ScoreCache } = await import('@/scoring-coordinator');

    // Build an item with a known contentHash.
    const text: string = 'I shipped 3 changes last quarter at ExampleCo.';
    const item: ExtractedItem = createRulesItem(text, 'post');
    const contentHash: ContentHash = item.metadata.contentHash;

    // Seed the cache directly with a result whose itemId is DIFFERENT from
    // what the request will use. This simulates a previous detection that
    // stored under the same contentHash but with a different itemId
    // (e.g., URN-based ID from one page vs content-hash-based ID from another).
    const staleCache: ScoreCache = (new ScoringCoordinator() as unknown as { cache: ScoreCache }).cache;
    void staleCache; // Just confirming the property exists; we use the coordinator's own cache.

    const coordinator = new ScoringCoordinator();
    const internalCache: ScoreCache = (coordinator as unknown as { cache: ScoreCache }).cache;
    const staleResult: ScoringResult = {
      ...scoreWithRules(item),
      itemId: 'urn:li:activity:STALE_ITEM_ID' as ItemId,
    };
    await internalCache.set(contentHash, staleResult);

    // Submit a batch with the CURRENT request's itemId (different from the cached one).
    const batch = await coordinator.handleScoreBatch([item], null);

    expect(batch.results.length).toBe(1);
    expect(batch.results[0]?.itemId).toBe(item.itemId);
    expect(batch.results[0]?.itemId).not.toBe('urn:li:activity:STALE_ITEM_ID');

    // The cache hit trace should still fire — we still used the cached data.
    const eventNames: readonly string[] = batch.results[0]!.traceEvents!.map((e) => e.event);
    expect(eventNames).toContain('CACHE_HIT');
  });

  it('preserves cached result data (label, source, dimensions) on cache hit, only overrides itemId', async (): Promise<void> => {
    vi.stubGlobal('browser', {
      runtime: { sendMessage: vi.fn(async (): Promise<unknown> => ({})) },
      storage: { local: { get: vi.fn(async (): Promise<Record<string, unknown>> => ({})) } },
    });

    const { ScoringCoordinator } = await import('@/scoring-coordinator');
    const { ScoreCache } = await import('@/scoring-coordinator');

    const item: ExtractedItem = createRulesItem('Excellent quarter at ExampleCo with 27% improvement.', 'post');
    const coordinator = new ScoringCoordinator();
    const internalCache: ScoreCache = (coordinator as unknown as { cache: ScoreCache }).cache;

    const staleResult: ScoringResult = {
      ...scoreWithRules(item),
      itemId: 'STALE_ID' as ItemId,
      label: 'feels-human',
      source: 'combined',
      scoringVersion: 'combined-tmr-q4-4',
    };
    await internalCache.set(item.metadata.contentHash, staleResult);

    const batch = await coordinator.handleScoreBatch([item], null);

    const result = batch.results[0]!;
    expect(result.itemId).toBe(item.itemId);
    expect(result.label).toBe('feels-human');
    expect(result.source).toBe('combined');
    expect(result.scoringVersion).toBe('combined-tmr-q4-4');
  });

  it('returns N results for N input items even when all are cache hits with stale ids', async (): Promise<void> => {
    vi.stubGlobal('browser', {
      runtime: { sendMessage: vi.fn(async (): Promise<unknown> => ({})) },
      storage: { local: { get: vi.fn(async (): Promise<Record<string, unknown>> => ({})) } },
    });

    const { ScoringCoordinator } = await import('@/scoring-coordinator');
    const { ScoreCache } = await import('@/scoring-coordinator');

    const items: readonly ExtractedItem[] = [
      createRulesItem('Post one with metric: 42% growth.', 'post'),
      createRulesItem('Post two with metric: 17% reduction.', 'post'),
      createRulesItem('Post three with detail.', 'post'),
    ];

    const coordinator = new ScoringCoordinator();
    const internalCache: ScoreCache = (coordinator as unknown as { cache: ScoreCache }).cache;

    // Seed cache for all 3 items, each with a different stale itemId.
    for (let i: number = 0; i < items.length; i++) {
      const item: ExtractedItem = items[i]!;
      const staleResult: ScoringResult = {
        ...scoreWithRules(item),
        itemId: `STALE_${i}` as ItemId,
      };
      await internalCache.set(item.metadata.contentHash, staleResult);
    }

    const batch = await coordinator.handleScoreBatch(items, null);

    expect(batch.results.length).toBe(3);
    // Each result.itemId must match the corresponding input item.itemId, in order.
    for (let i: number = 0; i < items.length; i++) {
      expect(batch.results[i]?.itemId).toBe(items[i]!.itemId);
    }
  });

  it('cache miss path uses the fresh itemId (not affected by cache mismatch)', async (): Promise<void> => {
    vi.stubGlobal('browser', {
      runtime: { sendMessage: vi.fn(async (): Promise<unknown> => ({})) },
      storage: { local: { get: vi.fn(async (): Promise<Record<string, unknown>> => ({})) } },
    });

    const { ScoringCoordinator } = await import('@/scoring-coordinator');
    const coordinator = new ScoringCoordinator();
    const item: ExtractedItem = createRulesItem('Fresh score path with metrics 12% gain.', 'post');

    const batch = await coordinator.handleScoreBatch([item], null);

    expect(batch.results[0]?.itemId).toBe(item.itemId);
  });
});

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
