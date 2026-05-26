import { ScoreCache } from '@/scoring-coordinator/score-cache';
import { sendToContentScript, sendToOffscreen } from '@/shared/messaging';
import { logger } from '@/shared/logger';
import { RULES_SCORING_VERSION, scoreWithRules } from '@/rules-engine';
import { combineScores, COMBINED_SCORING_VERSION, isPreAiEra } from '@/scoring-coordinator/score-combiner';
import { ScoringTelemetry, type ScoringTelemetryEntry } from '@/shared/scoring-telemetry';

import type { MessageResponse } from '@/shared/messaging';
import type {
  ContentHash,
  ExtractedItem,
  HealthMetrics,
  ScoringResult,
  ScoringTraceEvent,
} from '@/shared/types';

export interface ScoreBatchResult {
  readonly results: readonly ScoringResult[];
}

interface TmrQueueItem {
  readonly item: ExtractedItem;
  readonly rulesResult: ScoringResult;
  readonly tabId: number | null;
}

export class ScoringCoordinator {
  private readonly cache: ScoreCache = new ScoreCache();
  private readonly telemetry: ScoringTelemetry = new ScoringTelemetry();
  private ensureOffscreen: (() => Promise<boolean>) | null = null;
  private isTmrProcessing: boolean = false;
  private tmrAvailable: boolean = false;
  private readonly tmrQueue: TmrQueueItem[] = [];
  private itemsScored: number = 0;
  private cacheHits: number = 0;
  private cacheLookups: number = 0;
  private failureCount: number = 0;
  private totalLatencyMs: number = 0;
  private latencySamples: number = 0;

  public setEnsureOffscreen(fn: () => Promise<boolean>): void {
    this.ensureOffscreen = fn;
  }

  public setTmrAvailable(available: boolean): void {
    this.tmrAvailable = available;
  }

  public async handleScoreBatch(
    items: readonly ExtractedItem[],
    tabId: number | null,
  ): Promise<ScoreBatchResult> {
    const results: ScoringResult[] = [];

    for (const item of items) {
      this.telemetry.recordImpression(item.itemId, item.itemType, item.metadata.contentHash);
      const traces: ScoringTraceEvent[] = [];

      const cachedResult: ScoringResult | null = await this.getCachedResult(item);

      if (cachedResult !== null) {
        this.telemetry.recordCacheHit(item.itemId, cachedResult.source);
        traces.push({ event: 'CACHE_HIT', timestamp: Date.now(), detail: `Cached ${cachedResult.source} result, version ${cachedResult.scoringVersion}` });
        // Apply the pre-AI era override to cached results too. Posts authored
        // before mainstream AI text generation are human by definition,
        // regardless of what the cached score says.
        const preAiOverride: ScoringResult = this.applyPreAiEraOverride(
          { ...cachedResult, itemId: item.itemId, traceEvents: traces },
          item,
        );
        results.push(preAiOverride);
        continue;
      }

      traces.push({ event: 'CACHE_MISS', timestamp: Date.now(), detail: 'No cached result for this hash + version' });

      const rulesStartedAt: number = Date.now();
      traces.push({ event: 'RULES_STARTED', timestamp: rulesStartedAt, detail: '' });
      this.telemetry.recordRulesStart(item.itemId);
      const rulesResult: ScoringResult = scoreWithRules(item);
      this.telemetry.recordRulesEnd(item.itemId, rulesResult.label);
      const rulesEndedAt: number = Date.now();
      traces.push({ event: 'RULES_COMPLETED', timestamp: rulesEndedAt, detail: `${rulesResult.label}, confidence: ${rulesResult.confidence}` });

      await this.cache.set(item.metadata.contentHash, rulesResult);
      // Apply pre-AI override to fresh rules-only results too.
      const freshResult: ScoringResult = this.applyPreAiEraOverride(
        { ...rulesResult, traceEvents: traces },
        item,
      );
      results.push(freshResult);
      this.itemsScored += 1;
      this.totalLatencyMs += rulesEndedAt - rulesStartedAt;
      this.latencySamples += 1;

      if (this.tmrAvailable) {
        this.tmrQueue.push({ item, rulesResult: { ...rulesResult, traceEvents: traces }, tabId });
        logger.info('scoringCoordinator.tmrQueued', 'Queued fresh item for TMR', { itemId: item.itemId.slice(0, 20) });
      }
    }

    logger.info('scoringCoordinator.batch', 'Batch complete', {
      results: results.length,
      tmrAvailable: this.tmrAvailable,
      tmrQueueDepth: this.tmrQueue.length,
    });
    void this.processTmrQueue();
    return { results };
  }

  public async clearCache(): Promise<void> {
    await this.cache.clear();
    this.itemsScored = 0;
    this.cacheHits = 0;
    this.cacheLookups = 0;
    this.failureCount = 0;
    this.totalLatencyMs = 0;
    this.latencySamples = 0;
  }

  public getTelemetrySummary(): { entries: readonly ScoringTelemetryEntry[]; mode: string; itemsScored: number } {
    return {
      entries: this.telemetry.getRecentEntries(),
      mode: 'rules',
      itemsScored: this.itemsScored,
    };
  }

  public async getHealth(logEntryCount: number, adapterSuccessRate: number): Promise<HealthMetrics> {
    return {
      itemsScored: this.itemsScored,
      cacheEntries: await this.cache.getSize(),
      cacheHitRate: this.cacheLookups === 0 ? 0 : this.cacheHits / this.cacheLookups,
      avgLatencyMs: this.latencySamples === 0 ? 0 : this.totalLatencyMs / this.latencySamples,
      failureCount: this.failureCount,
      queueDepth: this.tmrQueue.length,
      scoringMode: 'rules',
      adapterSuccessRate,
      logEntryCount,
    };
  }

  private async getCachedResult(item: ExtractedItem): Promise<ScoringResult | null> {
    this.cacheLookups += 1;

    const combinedResult: ScoringResult | null = await this.cache.get(
      item.metadata.contentHash,
      COMBINED_SCORING_VERSION,
    );
    if (combinedResult !== null) {
      this.cacheHits += 1;
      return combinedResult;
    }

    if (this.tmrAvailable) {
      return null;
    }

    const rulesResult: ScoringResult | null = await this.cache.get(
      item.metadata.contentHash,
      RULES_SCORING_VERSION,
    );

    if (rulesResult !== null) {
      this.cacheHits += 1;
    }

    return rulesResult;
  }

  private async processTmrQueue(): Promise<void> {
    if (this.isTmrProcessing) {
      return;
    }

    if (this.tmrQueue.length === 0) {
      return;
    }

    this.isTmrProcessing = true;
    logger.info('scoringCoordinator.tmrQueue', 'Processing TMR queue', { depth: this.tmrQueue.length });

    try {
      while (this.tmrQueue.length > 0) {
        const queueItem: TmrQueueItem | undefined = this.tmrQueue.shift();
        if (queueItem === undefined) break;
        await this.classifyWithTmr(queueItem);
      }
      logger.info('scoringCoordinator.tmrQueue', 'TMR queue complete');
    } catch (error: unknown) {
      this.failureCount += 1;
      logger.error('scoringCoordinator.tmrQueue', error);
    } finally {
      this.isTmrProcessing = false;
    }
  }

  private async classifyWithTmr(
    { item, rulesResult, tabId }: TmrQueueItem,
  ): Promise<void> {
    if (this.ensureOffscreen !== null) {
      const ready: boolean = await this.ensureOffscreen();
      if (!ready) return;
    }

    const tmrTraces: ScoringTraceEvent[] = [
      { event: 'TMR_STARTED', timestamp: Date.now(), detail: `Rules: ${rulesResult.label} (${rulesResult.confidence})` },
    ];

    const tmrResponse: MessageResponse = await sendToOffscreen({
      type: 'TMR_CLASSIFY',
      source: 'background',
      itemId: item.itemId,
      text: item.text,
    });

    if (!tmrResponse.ok || tmrResponse.payload.type !== 'TMR_CLASSIFY_RESULT') {
      tmrTraces.push({ event: 'TMR_FAILED', timestamp: Date.now(), detail: 'TMR classify failed' });
      logger.warn('scoringCoordinator.tmr', 'TMR classify failed', { itemId: item.itemId });
      return;
    }

    const aiProb: number = tmrResponse.payload.aiProbability;
    const latencyMs: number = tmrResponse.payload.latencyMs;

    const combined = combineScores({
      text: item.text,
      activityUrn: item.metadata.activityUrn,
      itemType: item.itemType,
      charCount: item.text.length,
      rulesLabel: rulesResult.label,
      rulesConfidence: rulesResult.confidence,
      rulesDimensions: rulesResult.dimensions,
      rulesReasons: rulesResult.reasons ?? [rulesResult.explanation],
      tmrAiProbability: aiProb,
    });

    tmrTraces.push({
      event: 'TMR_COMPLETED',
      timestamp: Date.now(),
      detail: `P(AI)=${aiProb.toFixed(3)}, ${latencyMs}ms → ${combined.label} (${combined.confidence})`,
    });

    const updatedResult: ScoringResult = this.applyPreAiEraOverride(
      {
        ...rulesResult,
        label: combined.label,
        confidence: combined.confidence,
        source: 'combined',
        scoringVersion: COMBINED_SCORING_VERSION,
        traceEvents: [...(rulesResult.traceEvents ?? []), ...tmrTraces],
      },
      item,
    );

    await this.cache.set(item.metadata.contentHash, updatedResult);

    if (tabId !== null) {
      await this.sendResultToTab(tabId, updatedResult);
    }
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

  /**
   * Apply the pre-AI era hard rule to a scoring result. If the post's activity
   * URN encodes a creation timestamp before 2023, the label is unconditionally
   * overridden to "feels-human" with high confidence. Applied uniformly to
   * cached, rules-only, and combined results so the rule can't be bypassed
   * by a stale cache entry from an earlier scoring run.
   */
  private applyPreAiEraOverride(result: ScoringResult, item: ExtractedItem): ScoringResult {
    if (!isPreAiEra(item.metadata.activityUrn)) {
      return result;
    }
    if (result.label === 'feels-human' && result.confidence === 'high') {
      return result;
    }
    const traces: readonly ScoringTraceEvent[] = [
      ...(result.traceEvents ?? []),
      {
        event: 'PRE_AI_OVERRIDE',
        timestamp: Date.now(),
        detail: `Post predates AI era (URN: ${item.metadata.activityUrn})`,
      },
    ];
    return {
      ...result,
      label: 'feels-human',
      confidence: 'high',
      traceEvents: traces,
    };
  }
}
