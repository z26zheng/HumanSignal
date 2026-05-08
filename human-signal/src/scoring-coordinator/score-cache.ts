import { logger } from '@/shared/logger';

import type { ContentHash, ScoringResult } from '@/shared/types';

export interface CacheEntry {
  readonly contentHash: ContentHash;
  readonly result: ScoringResult;
  readonly scoringVersion: string;
  readonly createdAt: number;
}

export interface ScoreCacheOptions {
  readonly maxEntries: number;
  readonly ttlMs: number;
}

const DEFAULT_CACHE_OPTIONS: ScoreCacheOptions = {
  maxEntries: 10_000,
  ttlMs: 14 * 24 * 60 * 60 * 1000,
};

export class ScoreCache {
  private readonly entries: Map<ContentHash, CacheEntry> = new Map();
  private databasePromise: Promise<IDBDatabase | null> | null = null;

  public constructor(
    private readonly options: ScoreCacheOptions = DEFAULT_CACHE_OPTIONS,
    private readonly databaseName: string = 'human-signal-score-cache',
  ) {}

  public async get(contentHash: ContentHash, scoringVersion: string): Promise<ScoringResult | null> {
    const entry: CacheEntry | undefined =
      (await this.safeGetPersistedEntry(contentHash)) ?? this.entries.get(contentHash);

    if (entry === undefined) {
      return null;
    }

    if (entry.scoringVersion !== scoringVersion || this.isExpired(entry)) {
      this.entries.delete(contentHash);
      return null;
    }

    return entry.result;
  }

  public async set(contentHash: ContentHash, result: ScoringResult): Promise<void> {
    const entry: CacheEntry = {
      contentHash,
      result,
      scoringVersion: result.scoringVersion,
      createdAt: Date.now(),
    };

    this.entries.set(contentHash, entry);
    await this.safePutPersistedEntry(entry);

    if ((await this.getSize()) > this.options.maxEntries) {
      await this.evictOldest(Math.ceil(this.options.maxEntries * 0.25));
    }
  }

  public async clear(): Promise<void> {
    this.entries.clear();
    const database: IDBDatabase | null = await this.openDatabase();

    if (database !== null) {
      await requestToPromise(database.transaction('scoreCache', 'readwrite').objectStore('scoreCache').clear());
    }

    logger.info('scoreCache.clear', 'Score cache cleared');
  }

  public async getSize(): Promise<number> {
    try {
      const database: IDBDatabase | null = await this.openDatabase();

      if (database === null) {
        return this.entries.size;
      }

      return await requestToPromise<number>(
        database.transaction('scoreCache', 'readonly').objectStore('scoreCache').count(),
      );
    } catch (error: unknown) {
      logger.warn('scoreCache.size', 'Persisted cache size unavailable; using memory size', {
        errorName: error instanceof Error ? error.name : 'unknown',
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      return this.entries.size;
    }
  }

  public async evictExpired(): Promise<void> {
    const entries: readonly CacheEntry[] = await this.getAllEntries();

    for (const entry of entries) {
      if (this.isExpired(entry)) {
        await this.deleteEntry(entry.contentHash);
      }
    }
  }

  public async evictOldest(count: number): Promise<void> {
    const oldestEntries: readonly CacheEntry[] = Array.from(await this.getAllEntries())
      .sort((left: CacheEntry, right: CacheEntry): number => left.createdAt - right.createdAt)
      .slice(0, count);

    for (const entry of oldestEntries) {
      await this.deleteEntry(entry.contentHash);
    }
  }

  private isExpired(entry: CacheEntry): boolean {
    return entry.createdAt + this.options.ttlMs < Date.now();
  }

  private async getPersistedEntry(contentHash: ContentHash): Promise<CacheEntry | undefined> {
    const database: IDBDatabase | null = await this.openDatabase();

    if (database === null) {
      return undefined;
    }

    return await requestToPromise<CacheEntry | undefined>(
      database.transaction('scoreCache', 'readonly').objectStore('scoreCache').get(contentHash) as IDBRequest<
        CacheEntry | undefined
      >,
    );
  }

  private async safeGetPersistedEntry(contentHash: ContentHash): Promise<CacheEntry | undefined> {
    try {
      return await this.getPersistedEntry(contentHash);
    } catch (error: unknown) {
      logger.warn('scoreCache.read', 'Persisted cache read failed; using memory cache', {
        contentHash,
        errorName: error instanceof Error ? error.name : 'unknown',
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      return undefined;
    }
  }

  private async putPersistedEntry(entry: CacheEntry): Promise<void> {
    const database: IDBDatabase | null = await this.openDatabase();

    if (database === null) {
      return;
    }

    await requestToPromise(
      database.transaction('scoreCache', 'readwrite').objectStore('scoreCache').put(entry),
    );
  }

  private async safePutPersistedEntry(entry: CacheEntry): Promise<void> {
    try {
      await this.putPersistedEntry(entry);
    } catch (error: unknown) {
      logger.warn('scoreCache.persist', 'Persisted cache write failed; trying eviction before memory fallback', {
        contentHash: entry.contentHash,
        errorName: error instanceof Error ? error.name : 'unknown',
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      await this.retryPersistAfterEviction(entry);
    }
  }

  private async retryPersistAfterEviction(entry: CacheEntry): Promise<void> {
    try {
      await this.evictOldest(Math.max(1, Math.ceil(this.options.maxEntries * 0.25)));
      await this.putPersistedEntry(entry);
    } catch (error: unknown) {
      logger.warn('scoreCache.persistFallback', 'Persisted cache retry failed; memory cache retained', {
        contentHash: entry.contentHash,
        errorName: error instanceof Error ? error.name : 'unknown',
        errorMessage: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async getAllEntries(): Promise<readonly CacheEntry[]> {
    const database: IDBDatabase | null = await this.openDatabase();

    if (database === null) {
      return Array.from(this.entries.values());
    }

    return await requestToPromise<CacheEntry[]>(
      database.transaction('scoreCache', 'readonly').objectStore('scoreCache').getAll() as IDBRequest<
        CacheEntry[]
      >,
    );
  }

  private async deleteEntry(contentHash: ContentHash): Promise<void> {
    this.entries.delete(contentHash);
    const database: IDBDatabase | null = await this.openDatabase();

    if (database === null) {
      return;
    }

    await requestToPromise(
      database.transaction('scoreCache', 'readwrite').objectStore('scoreCache').delete(contentHash),
    );
  }

  private async openDatabase(): Promise<IDBDatabase | null> {
    if (!('indexedDB' in globalThis)) {
      return null;
    }

    this.databasePromise ??= new Promise<IDBDatabase | null>((resolve: (database: IDBDatabase | null) => void): void => {
      const request: IDBOpenDBRequest = indexedDB.open(this.databaseName, 1);

      request.onupgradeneeded = (): void => {
        const database: IDBDatabase = request.result;

        if (!database.objectStoreNames.contains('scoreCache')) {
          database.createObjectStore('scoreCache', { keyPath: 'contentHash' });
        }
      };
      request.onsuccess = (): void => {
        resolve(request.result);
      };
      request.onerror = (): void => {
        logger.warn('scoreCache.open', 'IndexedDB unavailable; using memory cache');
        resolve(null);
      };
    });

    return await this.databasePromise;
  }
}

function requestToPromise<TResult>(request: IDBRequest<TResult>): Promise<TResult> {
  return new Promise<TResult>((resolve: (value: TResult) => void, reject: (reason: unknown) => void): void => {
    request.onsuccess = (): void => {
      resolve(request.result);
    };
    request.onerror = (): void => {
      reject(request.error);
    };
  });
}
