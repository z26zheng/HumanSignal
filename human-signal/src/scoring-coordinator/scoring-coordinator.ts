import { ModeManager } from '@/scoring-coordinator/mode-manager';
import { ScoreCache } from '@/scoring-coordinator/score-cache';
import { ScoringQueue, type QueueItem } from '@/scoring-coordinator/scoring-queue';
import { sendToContentScript, sendToOffscreen } from '@/shared/messaging';
import { logger } from '@/shared/logger';
import { RULES_SCORING_VERSION, scoreWithRules } from '@/rules-engine';
import { createE2EGeminiScoringResult } from '@/gemini/e2e-gemini-mock';
import { readStorageValue } from '@/shared/storage';
import { DEFAULT_E2E_GEMINI_MOCK_CONFIG } from '@/shared/types';

import type { MessageResponse } from '@/shared/messaging';
import type {
  ContentHash,
  E2EGeminiMockConfig,
  ExtractedItem,
  GeminiStatus,
  HealthMetrics,
  PriorityUpdate,
  ScoringResult,
} from '@/shared/types';

export interface ScoreBatchResult {
  readonly results: readonly ScoringResult[];
  readonly queued: readonly string[];
}

export class ScoringCoordinator {
  private readonly modeManager: ModeManager = new ModeManager();
  private readonly cache: ScoreCache = new ScoreCache();
  private readonly queue: ScoringQueue = new ScoringQueue();
  private readonly inFlightByHash: Map<ContentHash, Promise<ScoringResult>> = new Map();
  private isProcessing: boolean = false;
  private itemsScored: number = 0;
  private cacheHits: number = 0;
  private cacheLookups: number = 0;
  private failureCount: number = 0;
  private totalLatencyMs: number = 0;

  private initialized: boolean = false;

  public async initialize(): Promise<void> {
    await this.modeManager.initialize();
  }

  public async handleScoreBatch(
    items: readonly ExtractedItem[],
    tabId: number | null,
  ): Promise<ScoreBatchResult> {
    const results: ScoringResult[] = [];
    const queued: string[] = [];

    for (const item of items) {
      const result: ScoringResult | null = await this.getCachedResult(item);

      if (result !== null) {
        results.push(result);
        continue;
      }

      if (this.modeManager.getMode() !== 'gemini') {
        const rulesResult: ScoringResult = scoreWithRules(item);
        await this.cache.set(item.metadata.contentHash, rulesResult);
        this.itemsScored += 1;
        results.push(rulesResult);
        continue;
      }

      queued.push(item.itemId);
      this.queue.enqueue({
        item,
        contentHash: item.metadata.contentHash,
        priority: 1,
        tabId,
        addedAt: Date.now(),
      });
    }

    void this.processQueue();
    return { results, queued };
  }

  public handlePriorityUpdates(updates: readonly PriorityUpdate[]): void {
    for (const update of updates) {
      this.queue.updatePriority(update.itemId, update.inViewport ? 1 : 3);
    }
  }

  public async clearCache(): Promise<void> {
    await this.cache.clear();
  }

  public onGeminiStatus(status: GeminiStatus): void {
    this.modeManager.onGeminiStatus(status);
  }

  public getMode(): string {
    return this.modeManager.getMode();
  }

  private async waitForGeminiCheck(): Promise<void> {
    if (this.modeManager.getMode() === 'gemini') {
      return;
    }

    const maxWaitMs: number = 8000;
    const pollIntervalMs: number = 250;
    const startedAt: number = Date.now();

    while (Date.now() - startedAt < maxWaitMs) {
      if (this.modeManager.getMode() === 'gemini') {
        logger.info('scoringCoordinator.geminiReady', 'Gemini mode activated before first batch', {
          waitedMs: Date.now() - startedAt,
        });
        return;
      }

      await new Promise((resolve): void => {
        setTimeout(resolve, pollIntervalMs);
      });
    }

    logger.info('scoringCoordinator.geminiTimeout', 'Gemini not ready; proceeding with rules', {
      waitedMs: Date.now() - startedAt,
      mode: this.modeManager.getMode(),
    });
  }

  public async getHealth(logEntryCount: number, adapterSuccessRate: number): Promise<HealthMetrics> {
    const scoredItemCount: number = this.itemsScored;

    return {
      itemsScored: this.itemsScored,
      cacheEntries: await this.cache.getSize(),
      cacheHitRate: this.cacheLookups === 0 ? 0 : this.cacheHits / this.cacheLookups,
      avgLatencyMs: scoredItemCount === 0 ? 0 : this.totalLatencyMs / scoredItemCount,
      failureCount: this.failureCount,
      queueDepth: this.queue.getDepth(),
      scoringMode: this.modeManager.getMode(),
      adapterSuccessRate,
      logEntryCount,
    };
  }

  private async getCachedResult(item: ExtractedItem): Promise<ScoringResult | null> {
    this.cacheLookups += 1;
    const expectedVersion: string =
      this.modeManager.getMode() === 'gemini' ? 'gemini-1' : RULES_SCORING_VERSION;
    const cachedResult: ScoringResult | null = await this.cache.get(
      item.metadata.contentHash,
      expectedVersion,
    );

    if (cachedResult !== null) {
      this.cacheHits += 1;
    }

    return cachedResult;
  }

  private async processQueue(): Promise<void> {
    if (this.isProcessing) {
      return;
    }

    this.isProcessing = true;

    try {
      while (this.queue.getDepth() > 0) {
        const queueItem: QueueItem | null = this.queue.dequeue();

        if (queueItem === null) {
          break;
        }

        const result: ScoringResult = await this.scoreGeminiWithFallback(queueItem.item);
        await this.cache.set(queueItem.contentHash, result);

        if (queueItem.tabId !== null) {
          await this.sendResultToTab(queueItem.tabId, result);
        }
      }
    } catch (error: unknown) {
      this.failureCount += 1;
      logger.error('scoringCoordinator.queue', error);
    } finally {
      this.isProcessing = false;
    }
  }

  private async scoreGeminiWithFallback(item: ExtractedItem): Promise<ScoringResult> {
    const contentHash: ContentHash = item.metadata.contentHash;
    const existingPromise: Promise<ScoringResult> | undefined = this.inFlightByHash.get(contentHash);

    if (existingPromise !== undefined) {
      return await existingPromise;
    }

    const promise: Promise<ScoringResult> = this.runGeminiRequest(item);
    this.inFlightByHash.set(contentHash, promise);

    try {
      return await promise;
    } finally {
      this.inFlightByHash.delete(contentHash);
    }
  }

  private async runGeminiRequest(item: ExtractedItem): Promise<ScoringResult> {
    const startedAt: number = Date.now();
    const mockResult: ScoringResult | null | undefined = await this.scoreWithE2EGeminiMock(item);

    if (mockResult !== undefined) {
      if (mockResult !== null) {
        this.recordScoringLatency(startedAt);
        return mockResult;
      }

      this.failureCount += 1;
      logger.warn('scoringCoordinator.geminiFallback', 'E2E Gemini mock returned null; falling back to rules', {
        itemType: item.itemType,
      });
      const fallbackResult: ScoringResult = scoreWithRules(item);
      this.recordScoringLatency(startedAt);
      return fallbackResult;
    }

    const response: MessageResponse = await sendToOffscreen({
      type: 'GEMINI_PROMPT',
      source: 'background',
      item,
    });

    if (response.ok && response.payload.type === 'GEMINI_RESULT') {
      this.onGeminiStatus(response.payload.status);

      if (response.payload.result !== null) {
        this.recordScoringLatency(startedAt);
        return response.payload.result;
      }
    }

    this.failureCount += 1;
    logger.warn('scoringCoordinator.geminiFallback', 'Gemini failed; falling back to rules', {
      itemType: item.itemType,
    });
    const fallbackResult: ScoringResult = scoreWithRules(item);
    this.recordScoringLatency(startedAt);
    return fallbackResult;
  }

  private async scoreWithE2EGeminiMock(item: ExtractedItem): Promise<ScoringResult | null | undefined> {
    const config: E2EGeminiMockConfig = await readStorageValue('e2eGeminiMock', DEFAULT_E2E_GEMINI_MOCK_CONFIG);

    if (!config.isEnabled || config.availability !== 'available') {
      return undefined;
    }

    return createE2EGeminiScoringResult(item, config);
  }

  private recordScoringLatency(startedAt: number): void {
    this.itemsScored += 1;
    this.totalLatencyMs += Date.now() - startedAt;
  }

  private async sendResultToTab(tabId: number, result: ScoringResult): Promise<void> {
    const response: MessageResponse = await sendToContentScript(tabId, {
      type: 'SCORE_RESULT',
      source: 'background',
      results: [result],
    });

    if (!response.ok) {
      logger.warn('scoringCoordinator.resultRoute', 'Unable to route score result to content script', {
        code: response.error.code,
      });
    }
  }
}
