import { logger } from '@/shared/logger';

import type { ScoringSource } from '@/shared/types';

export interface ScoringTelemetryEntry {
  readonly itemId: string;
  readonly itemType: 'post' | 'comment';
  readonly contentHash: string;
  readonly impressionAt: number;
  readonly rulesLatencyMs: number | null;
  readonly rulesLabel: string | null;
  readonly geminiLatencyMs: number | null;
  readonly geminiLabel: string | null;
  readonly geminiQueueWaitMs: number | null;
  readonly geminiFailed: boolean;
  readonly cacheHit: boolean;
  readonly finalSource: ScoringSource;
  readonly totalLatencyMs: number;
}

interface MutableEntry {
  itemId: string;
  itemType: 'post' | 'comment';
  contentHash: string;
  impressionAt: number;
  rulesStartAt: number;
  rulesEndAt: number;
  rulesLabel: string | null;
  geminiQueuedAt: number;
  geminiStartAt: number;
  geminiEndAt: number;
  geminiLabel: string | null;
  geminiSource: ScoringSource | null;
  geminiFailed: boolean;
  cacheHit: boolean;
  finalSource: ScoringSource;
}

export class ScoringTelemetry {
  private readonly entries: Map<string, MutableEntry> = new Map();
  private readonly maxEntries: number = 200;

  public recordImpression(itemId: string, itemType: 'post' | 'comment', contentHash: string): void {
    this.entries.set(itemId, {
      itemId,
      itemType,
      contentHash,
      impressionAt: Date.now(),
      rulesStartAt: 0,
      rulesEndAt: 0,
      rulesLabel: null,
      geminiQueuedAt: 0,
      geminiStartAt: 0,
      geminiEndAt: 0,
      geminiLabel: null,
      geminiSource: null,
      geminiFailed: false,
      cacheHit: false,
      finalSource: 'system',
    });
    this.evictOldest();
  }

  public recordCacheHit(itemId: string, source: ScoringSource): void {
    const entry: MutableEntry | undefined = this.entries.get(itemId);
    if (entry === undefined) return;

    entry.cacheHit = true;
    entry.finalSource = source;

    logger.info('telemetry.cacheHit', 'Cache hit', {
      itemId: itemId.slice(0, 30),
      source,
      latencyMs: Date.now() - entry.impressionAt,
    });
  }

  public recordRulesStart(itemId: string): void {
    const entry: MutableEntry | undefined = this.entries.get(itemId);
    if (entry !== undefined) entry.rulesStartAt = Date.now();
  }

  public recordRulesEnd(itemId: string, label: string): void {
    const entry: MutableEntry | undefined = this.entries.get(itemId);
    if (entry === undefined) return;

    entry.rulesEndAt = Date.now();
    entry.rulesLabel = label;
    entry.finalSource = 'rules';

    const rulesLatencyMs: number = entry.rulesEndAt - entry.rulesStartAt;
    const totalLatencyMs: number = entry.rulesEndAt - entry.impressionAt;

    logger.info('telemetry.rulesScored', 'Rules scored', {
      itemId: itemId.slice(0, 30),
      itemType: entry.itemType,
      label,
      rulesLatencyMs,
      totalLatencyMs,
    });
  }

  public recordGeminiQueued(itemId: string): void {
    const entry: MutableEntry | undefined = this.entries.get(itemId);
    if (entry !== undefined) entry.geminiQueuedAt = Date.now();
  }

  public recordGeminiStart(itemId: string): void {
    const entry: MutableEntry | undefined = this.entries.get(itemId);
    if (entry !== undefined) entry.geminiStartAt = Date.now();
  }

  public recordGeminiEnd(itemId: string, label: string | null, source: ScoringSource, failed: boolean): void {
    const entry: MutableEntry | undefined = this.entries.get(itemId);
    if (entry === undefined) return;

    entry.geminiEndAt = Date.now();
    entry.geminiLabel = label;
    entry.geminiSource = source;
    entry.geminiFailed = failed;
    entry.finalSource = source;

    const geminiLatencyMs: number = entry.geminiEndAt - entry.geminiStartAt;
    const queueWaitMs: number = entry.geminiStartAt > 0 && entry.geminiQueuedAt > 0
      ? entry.geminiStartAt - entry.geminiQueuedAt
      : 0;
    const totalLatencyMs: number = entry.geminiEndAt - entry.impressionAt;

    logger.info('telemetry.geminiScored', 'Gemini scored', {
      itemId: itemId.slice(0, 30),
      itemType: entry.itemType,
      label: label ?? 'null',
      source,
      failed,
      rulesLabel: entry.rulesLabel ?? 'none',
      labelChanged: entry.rulesLabel !== null && entry.rulesLabel !== label,
      queueWaitMs,
      geminiLatencyMs,
      totalLatencyMs,
    });
  }

  public getEntry(itemId: string): ScoringTelemetryEntry | undefined {
    const entry: MutableEntry | undefined = this.entries.get(itemId);
    return entry === undefined ? undefined : toReadonlyEntry(entry);
  }

  public getRecentEntries(): readonly ScoringTelemetryEntry[] {
    return Array.from(this.entries.values()).map(toReadonlyEntry);
  }

  private evictOldest(): void {
    if (this.entries.size <= this.maxEntries) {
      return;
    }

    const firstKey: string | undefined = this.entries.keys().next().value;
    if (firstKey !== undefined) {
      this.entries.delete(firstKey);
    }
  }
}

function toReadonlyEntry(entry: MutableEntry): ScoringTelemetryEntry {
  const rulesLatencyMs: number | null =
    entry.rulesEndAt > 0 && entry.rulesStartAt > 0 ? entry.rulesEndAt - entry.rulesStartAt : null;
  const geminiLatencyMs: number | null =
    entry.geminiEndAt > 0 && entry.geminiStartAt > 0 ? entry.geminiEndAt - entry.geminiStartAt : null;
  const geminiQueueWaitMs: number | null =
    entry.geminiStartAt > 0 && entry.geminiQueuedAt > 0
      ? entry.geminiStartAt - entry.geminiQueuedAt
      : null;
  const lastEndAt: number = Math.max(entry.geminiEndAt, entry.rulesEndAt);
  const totalLatencyMs: number = lastEndAt > 0 ? lastEndAt - entry.impressionAt : 0;

  return {
    itemId: entry.itemId,
    itemType: entry.itemType,
    contentHash: entry.contentHash,
    impressionAt: entry.impressionAt,
    rulesLatencyMs,
    rulesLabel: entry.rulesLabel,
    geminiLatencyMs,
    geminiLabel: entry.geminiLabel,
    geminiQueueWaitMs,
    geminiFailed: entry.geminiFailed,
    cacheHit: entry.cacheHit,
    finalSource: entry.finalSource,
    totalLatencyMs,
  };
}
