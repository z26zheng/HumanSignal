export type TraceEventType =
  | 'DISCOVERED'
  | 'EXTRACTED'
  | 'CACHE_HIT'
  | 'CACHE_MISS'
  | 'RULES_STARTED'
  | 'RULES_COMPLETED'
  | 'STICKER_SHOWN'
  | 'AI_QUEUED'
  | 'AI_STARTED'
  | 'AI_COMPLETED'
  | 'AI_FAILED'
  | 'AI_RETRY'
  | 'AI_SKIPPED'
  | 'TMR_STARTED'
  | 'TMR_COMPLETED'
  | 'TMR_FAILED'
  | 'PRE_AI_OVERRIDE'
  | 'STICKER_UPGRADED'
  | 'STICKER_UNCHANGED'
  | 'CANCELLED'
  | 'ERROR';

export interface TraceEvent {
  readonly event: TraceEventType;
  readonly timestamp: number;
  readonly detail: string;
}

export interface ItemTrace {
  readonly itemId: string;
  readonly itemType: 'post' | 'comment';
  readonly contentHash: string;
  readonly textLength: number;
  readonly isTruncated: boolean;
  readonly events: readonly TraceEvent[];
}

export class EventTraceStore {
  private readonly traces: Map<string, MutableItemTrace> = new Map();
  private readonly maxTraces: number;

  public constructor(maxTraces: number = 200) {
    this.maxTraces = maxTraces;
  }

  public startTrace(
    itemId: string,
    itemType: 'post' | 'comment',
    contentHash: string,
    textLength: number,
    isTruncated: boolean,
  ): void {
    this.traces.set(itemId, {
      itemId,
      itemType,
      contentHash,
      textLength,
      isTruncated,
      events: [],
    });
    this.evictOldest();
  }

  public addEvent(itemId: string, event: TraceEventType, detail: string = ''): void {
    const trace: MutableItemTrace | undefined = this.traces.get(itemId);
    if (trace === undefined) return;
    trace.events.push({ event, timestamp: Date.now(), detail });
  }

  public getTrace(itemId: string): ItemTrace | null {
    return this.traces.get(itemId) ?? null;
  }

  public getAllTraces(): readonly ItemTrace[] {
    return Array.from(this.traces.values());
  }

  public removeTrace(itemId: string): void {
    this.traces.delete(itemId);
  }

  public getDebugPillText(itemId: string): string {
    const trace: MutableItemTrace | undefined = this.traces.get(itemId);
    if (trace === undefined) return '🔧 —';

    return computeDebugPillText(trace.events);
  }

  public getLatencySummary(itemId: string): LatencySummary | null {
    const trace: MutableItemTrace | undefined = this.traces.get(itemId);
    if (trace === undefined) return null;

    const events: readonly TraceEvent[] = trace.events;
    const discovered: TraceEvent | undefined = events.find((e): boolean => e.event === 'DISCOVERED');
    const rulesStarted: TraceEvent | undefined = events.find((e): boolean => e.event === 'RULES_STARTED');
    const rulesCompleted: TraceEvent | undefined = events.find((e): boolean => e.event === 'RULES_COMPLETED');
    const aiQueued: TraceEvent | undefined = events.find((e): boolean => e.event === 'AI_QUEUED');
    const aiStarted: TraceEvent | undefined = events.find((e): boolean => e.event === 'AI_STARTED');
    const aiCompleted: TraceEvent | undefined = events.find((e): boolean => e.event === 'AI_COMPLETED');
    const cacheHit: TraceEvent | undefined = events.find((e): boolean => e.event === 'CACHE_HIT');
    const lastEvent: TraceEvent | undefined = events[events.length - 1];

    return {
      rulesMs: rulesStarted !== undefined && rulesCompleted !== undefined
        ? rulesCompleted.timestamp - rulesStarted.timestamp : null,
      aiQueueWaitMs: aiQueued !== undefined && aiStarted !== undefined
        ? aiStarted.timestamp - aiQueued.timestamp : null,
      aiInferenceMs: aiStarted !== undefined && aiCompleted !== undefined
        ? aiCompleted.timestamp - aiStarted.timestamp : null,
      totalMs: discovered !== undefined && lastEvent !== undefined
        ? lastEvent.timestamp - discovered.timestamp : null,
      cacheHit: cacheHit !== undefined,
    };
  }

  public toJSON(itemId: string): Record<string, unknown> | null {
    const trace: MutableItemTrace | undefined = this.traces.get(itemId);
    if (trace === undefined) return null;

    const latency: LatencySummary | null = this.getLatencySummary(itemId);
    return {
      itemId: trace.itemId,
      itemType: trace.itemType,
      contentHash: trace.contentHash,
      textLength: trace.textLength,
      isTruncated: trace.isTruncated,
      events: trace.events,
      latency,
    };
  }

  private evictOldest(): void {
    if (this.traces.size <= this.maxTraces) return;
    const firstKey: string | undefined = this.traces.keys().next().value;
    if (firstKey !== undefined) this.traces.delete(firstKey);
  }
}

export interface LatencySummary {
  readonly rulesMs: number | null;
  readonly aiQueueWaitMs: number | null;
  readonly aiInferenceMs: number | null;
  readonly totalMs: number | null;
  readonly cacheHit: boolean;
}

interface MutableItemTrace {
  readonly itemId: string;
  readonly itemType: 'post' | 'comment';
  readonly contentHash: string;
  readonly textLength: number;
  readonly isTruncated: boolean;
  readonly events: TraceEvent[];
}

function extractMs(detail: string): string {
  const match: RegExpMatchArray | null = detail.match(/(\d+)ms/);
  return match !== null ? `${match[1]}ms` : '?ms';
}

function computeElapsedMs(events: readonly TraceEvent[]): string {
  if (events.length < 2) return '?ms';
  const first: number = events[0]!.timestamp;
  const last: number = events[events.length - 1]!.timestamp;
  return `${last - first}ms`;
}

/**
 * Index events by their type for O(1) lookup. Returns the first occurrence
 * of each event type. Pure function for testability.
 */
export function indexEventsByType(events: readonly TraceEvent[]): Map<TraceEventType, TraceEvent> {
  const map: Map<TraceEventType, TraceEvent> = new Map();
  for (const event of events) {
    if (!map.has(event.event)) {
      map.set(event.event, event);
    }
  }
  return map;
}

/**
 * Compute the debug pill text for a sequence of trace events.
 *
 * Rules are evaluated top-to-bottom; the first match wins. Pure function
 * for testability — no side effects, no state.
 */
export function computeDebugPillText(events: readonly TraceEvent[]): string {
  const byType: Map<TraceEventType, TraceEvent> = indexEventsByType(events);
  const has = (t: TraceEventType): boolean => byType.has(t);
  const get = (t: TraceEventType): TraceEvent | undefined => byType.get(t);

  if (has('ERROR')) return '🔧 error';

  const rulesCompleted: TraceEvent | undefined = get('RULES_COMPLETED');
  const rulesMs: string = rulesCompleted !== undefined ? extractMs(rulesCompleted.detail) : '?';
  const stickerUpgraded: boolean = has('STICKER_UPGRADED');
  const stickerUnchanged: boolean = has('STICKER_UNCHANGED');

  const tmrCompleted: TraceEvent | undefined = get('TMR_COMPLETED');
  if (tmrCompleted !== undefined) {
    const tmrMs: string = extractMs(tmrCompleted.detail);
    if (stickerUpgraded) return `🔧 ${rulesMs} rules → ${tmrMs} TMR ✓ upgraded`;
    if (stickerUnchanged) return `🔧 ${rulesMs} rules → ${tmrMs} TMR ✓ confirmed`;
    return `🔧 ${rulesMs} rules → ${tmrMs} TMR`;
  }

  if (has('TMR_FAILED')) return `🔧 ${rulesMs} rules → TMR ✗`;
  if (has('TMR_STARTED')) return `🔧 ${rulesMs} rules → TMR ⏳`;

  if (has('CACHE_HIT')) return '🔧 cache';

  const aiCompleted: TraceEvent | undefined = get('AI_COMPLETED');
  if (aiCompleted !== undefined) {
    const aiMs: string = extractMs(aiCompleted.detail);
    if (stickerUpgraded) return `🔧 ${rulesMs} rules → ${aiMs} AI ✓ upgraded`;
    if (stickerUnchanged) return `🔧 ${rulesMs} rules → ${aiMs} AI ✓ confirmed`;
    return `🔧 ${rulesMs} rules → ${aiMs} AI`;
  }

  if (stickerUpgraded) return `🔧 ${computeElapsedMs(events)} AI ✓ upgraded`;
  if (stickerUnchanged) return `🔧 ${computeElapsedMs(events)} AI ✓ confirmed`;
  if (has('AI_FAILED')) return `🔧 ${rulesMs} rules → AI ✗`;
  if (has('AI_STARTED')) return `🔧 ${rulesMs} rules → AI ⏳`;
  if (has('AI_QUEUED')) return `🔧 ${rulesMs} rules → AI queued`;
  if (has('AI_SKIPPED')) return `🔧 ${rulesMs} rules only`;
  if (rulesCompleted !== undefined) return `🔧 ${rulesMs} rules (TMR pending)`;

  return '🔧 …';
}
