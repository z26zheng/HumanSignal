import { describe, expect, it } from 'vitest';

import { computeDebugPillText, EventTraceStore, indexEventsByType, type TraceEvent } from '@/shared/event-trace';

describe('EventTraceStore', (): void => {
  it('tracks a full lifecycle: discovered → rules → AI → upgraded', (): void => {
    const store: EventTraceStore = new EventTraceStore();
    store.startTrace('item-1', 'post', 'hash_abc', 847, false);

    store.addEvent('item-1', 'DISCOVERED', 'DOM adapter found post element');
    store.addEvent('item-1', 'EXTRACTED', '847 chars, hash hash_abc');
    store.addEvent('item-1', 'CACHE_MISS', 'No cached result');
    store.addEvent('item-1', 'RULES_STARTED');
    store.addEvent('item-1', 'RULES_COMPLETED', '12ms → likely-ai, confidence: medium');
    store.addEvent('item-1', 'STICKER_SHOWN', 'Label: Likely AI (rules result)');
    store.addEvent('item-1', 'AI_QUEUED', 'Priority: 1 (in viewport)');
    store.addEvent('item-1', 'AI_STARTED', 'Session: reused');
    store.addEvent('item-1', 'AI_COMPLETED', '1842ms → feels-human, confidence: high');
    store.addEvent('item-1', 'STICKER_UPGRADED', 'Likely AI → Feels Human');

    const trace = store.getTrace('item-1');
    expect(trace).not.toBeNull();
    const events = trace!.events;
    expect(events).toHaveLength(10);
    expect(events[0]?.event).toBe('DISCOVERED');
    expect(events[9]?.event).toBe('STICKER_UPGRADED');
  });

  it('generates correct debug pill text for each state', (): void => {
    const store: EventTraceStore = new EventTraceStore();

    store.startTrace('rules-only', 'post', 'h1', 100, false);
    store.addEvent('rules-only', 'RULES_COMPLETED', '12ms → likely-ai');
    expect(store.getDebugPillText('rules-only')).toBe('🔧 12ms rules (TMR pending)');

    store.startTrace('ai-queued', 'post', 'h2', 100, false);
    store.addEvent('ai-queued', 'RULES_COMPLETED', '8ms → possibly-ai');
    store.addEvent('ai-queued', 'AI_QUEUED', 'Priority: 1');
    expect(store.getDebugPillText('ai-queued')).toBe('🔧 8ms rules → AI queued');

    store.startTrace('ai-running', 'post', 'h3', 100, false);
    store.addEvent('ai-running', 'RULES_COMPLETED', '10ms → likely-ai');
    store.addEvent('ai-running', 'AI_QUEUED', '');
    store.addEvent('ai-running', 'AI_STARTED', 'Session: reused');
    expect(store.getDebugPillText('ai-running')).toBe('🔧 10ms rules → AI ⏳');

    store.startTrace('ai-done', 'post', 'h4', 100, false);
    store.addEvent('ai-done', 'RULES_COMPLETED', '12ms → likely-ai');
    store.addEvent('ai-done', 'AI_COMPLETED', '1842ms → feels-human');
    expect(store.getDebugPillText('ai-done')).toBe('🔧 12ms rules → 1842ms AI');

    store.startTrace('ai-fail', 'post', 'h5', 100, false);
    store.addEvent('ai-fail', 'RULES_COMPLETED', '5ms → possibly-ai');
    store.addEvent('ai-fail', 'AI_FAILED', 'Invalid JSON');
    expect(store.getDebugPillText('ai-fail')).toBe('🔧 5ms rules → AI ✗');

    store.startTrace('ai-skip', 'post', 'h6', 100, false);
    store.addEvent('ai-skip', 'RULES_COMPLETED', '7ms → likely-ai');
    store.addEvent('ai-skip', 'AI_SKIPPED', 'unavailable');
    expect(store.getDebugPillText('ai-skip')).toBe('🔧 7ms rules only');

    store.startTrace('cached', 'post', 'h7', 100, false);
    store.addEvent('cached', 'CACHE_HIT', 'Cached gemini result');
    expect(store.getDebugPillText('cached')).toBe('🔧 cache');

    store.startTrace('errored', 'post', 'h8', 100, false);
    store.addEvent('errored', 'ERROR', 'Send failed');
    expect(store.getDebugPillText('errored')).toBe('🔧 error');
  });

  it('returns null for unknown item IDs', (): void => {
    const store: EventTraceStore = new EventTraceStore();
    expect(store.getTrace('nonexistent')).toBeNull();
    expect(store.getDebugPillText('nonexistent')).toBe('🔧 —');
    expect(store.getLatencySummary('nonexistent')).toBeNull();
    expect(store.toJSON('nonexistent')).toBeNull();
  });

  it('computes latency summary from event timestamps', (): void => {
    const store: EventTraceStore = new EventTraceStore();
    store.startTrace('lat-item', 'post', 'h1', 500, false);
    store.addEvent('lat-item', 'DISCOVERED');
    store.addEvent('lat-item', 'RULES_STARTED');
    store.addEvent('lat-item', 'RULES_COMPLETED', '15ms');
    store.addEvent('lat-item', 'AI_QUEUED', '');
    store.addEvent('lat-item', 'AI_STARTED', '');
    store.addEvent('lat-item', 'AI_COMPLETED', '2000ms');

    const summary = store.getLatencySummary('lat-item');
    expect(summary).not.toBeNull();
    expect(summary!.rulesMs).toBeGreaterThanOrEqual(0);
    expect(summary!.aiQueueWaitMs).toBeGreaterThanOrEqual(0);
    expect(summary!.aiInferenceMs).toBeGreaterThanOrEqual(0);
    expect(summary!.totalMs).toBeGreaterThanOrEqual(0);
    expect(summary!.cacheHit).toBe(false);
  });

  it('identifies cache hits in latency summary', (): void => {
    const store: EventTraceStore = new EventTraceStore();
    store.startTrace('cache-item', 'comment', 'h2', 50, false);
    store.addEvent('cache-item', 'CACHE_HIT', 'Cached rules result');

    const summary = store.getLatencySummary('cache-item');
    expect(summary!.cacheHit).toBe(true);
    expect(summary!.rulesMs).toBeNull();
  });

  it('evicts oldest traces when capacity exceeded', (): void => {
    const store: EventTraceStore = new EventTraceStore(5);

    for (let i: number = 0; i < 8; i += 1) {
      store.startTrace(`item-${i}`, 'post', `h${i}`, 100, false);
    }

    expect(store.getTrace('item-0')).toBeNull();
    expect(store.getTrace('item-1')).toBeNull();
    expect(store.getTrace('item-2')).toBeNull();
    expect(store.getTrace('item-7')).not.toBeNull();
    expect(store.getAllTraces()).toHaveLength(5);
  });

  it('removes a specific trace', (): void => {
    const store: EventTraceStore = new EventTraceStore();
    store.startTrace('rm-item', 'post', 'h1', 100, false);
    store.addEvent('rm-item', 'DISCOVERED');

    store.removeTrace('rm-item');

    expect(store.getTrace('rm-item')).toBeNull();
  });

  it('serializes trace to JSON with latency', (): void => {
    const store: EventTraceStore = new EventTraceStore();
    store.startTrace('json-item', 'comment', 'hash_x', 200, true);
    store.addEvent('json-item', 'DISCOVERED');
    store.addEvent('json-item', 'RULES_STARTED');
    store.addEvent('json-item', 'RULES_COMPLETED', '5ms');

    const json = store.toJSON('json-item');
    expect(json).not.toBeNull();
    expect(json!.itemId).toBe('json-item');
    expect(json!.itemType).toBe('comment');
    expect(json!.textLength).toBe(200);
    expect(json!.isTruncated).toBe(true);
    expect((json!.events as unknown[]).length).toBe(3);
    expect(json!.latency).not.toBeNull();
  });

  it('ignores addEvent for unknown items', (): void => {
    const store: EventTraceStore = new EventTraceStore();
    store.addEvent('ghost', 'DISCOVERED', 'should not crash');
    expect(store.getTrace('ghost')).toBeNull();
  });

  it('ingests trace events from ScoringResult (background → content roundtrip)', (): void => {
    const store: EventTraceStore = new EventTraceStore();
    store.startTrace('roundtrip', 'post', 'h1', 500, false);
    store.addEvent('roundtrip', 'DISCOVERED', 'DOM adapter found post element');

    const backgroundEvents = [
      { event: 'CACHE_MISS', timestamp: Date.now(), detail: 'No cached result' },
      { event: 'RULES_STARTED', timestamp: Date.now(), detail: '' },
      { event: 'RULES_COMPLETED', timestamp: Date.now(), detail: 'likely-ai, confidence: medium' },
    ];

    for (const te of backgroundEvents) {
      store.addEvent('roundtrip', te.event as Parameters<typeof store.addEvent>[1], te.detail);
    }

    const trace = store.getTrace('roundtrip');
    expect(trace).not.toBeNull();
    expect(trace!.events).toHaveLength(4);
    expect(trace!.events.map((e) => e.event)).toEqual([
      'DISCOVERED', 'CACHE_MISS', 'RULES_STARTED', 'RULES_COMPLETED',
    ]);
  });

  it('handles AI upgrade trace events from background', (): void => {
    const store: EventTraceStore = new EventTraceStore();
    store.startTrace('ai-upgrade', 'post', 'h2', 800, false);
    store.addEvent('ai-upgrade', 'DISCOVERED');
    store.addEvent('ai-upgrade', 'RULES_COMPLETED', '10ms');

    const aiEvents = [
      { event: 'AI_STARTED', timestamp: Date.now(), detail: 'Session: reused' },
      { event: 'AI_COMPLETED', timestamp: Date.now(), detail: 'feels-human, confidence: high' },
    ];

    for (const te of aiEvents) {
      store.addEvent('ai-upgrade', te.event as Parameters<typeof store.addEvent>[1], te.detail);
    }

    expect(store.getDebugPillText('ai-upgrade')).toContain('AI');
    expect(store.getTrace('ai-upgrade')!.events).toHaveLength(4);
  });
});

describe('computeDebugPillText (pure)', (): void => {
  function makeEvent(event: TraceEvent['event'], detail: string = ''): TraceEvent {
    return { event, timestamp: Date.now(), detail };
  }

  it('returns dash for empty events', (): void => {
    expect(computeDebugPillText([])).toBe('🔧 …');
  });

  it('error wins over everything', (): void => {
    const events: readonly TraceEvent[] = [
      makeEvent('RULES_COMPLETED', '5ms → likely-ai'),
      makeEvent('TMR_COMPLETED', '113ms → likely-ai'),
      makeEvent('ERROR', 'oops'),
    ];
    expect(computeDebugPillText(events)).toBe('🔧 error');
  });

  it('TMR completed + sticker upgraded shows upgraded text', (): void => {
    const events: readonly TraceEvent[] = [
      makeEvent('RULES_COMPLETED', '5ms → possibly-ai'),
      makeEvent('TMR_COMPLETED', '113ms → likely-ai'),
      makeEvent('STICKER_UPGRADED', 'possibly-ai → likely-ai'),
    ];
    expect(computeDebugPillText(events)).toBe('🔧 5ms rules → 113ms TMR ✓ upgraded');
  });

  it('TMR completed + sticker unchanged shows confirmed text', (): void => {
    const events: readonly TraceEvent[] = [
      makeEvent('RULES_COMPLETED', '7ms → feels-human'),
      makeEvent('TMR_COMPLETED', '100ms → feels-human'),
      makeEvent('STICKER_UNCHANGED', 'TMR confirmed'),
    ];
    expect(computeDebugPillText(events)).toBe('🔧 7ms rules → 100ms TMR ✓ confirmed');
  });

  it('TMR started without complete shows in-progress', (): void => {
    const events: readonly TraceEvent[] = [
      makeEvent('RULES_COMPLETED', '6ms → cant-tell'),
      makeEvent('TMR_STARTED', ''),
    ];
    expect(computeDebugPillText(events)).toBe('🔧 6ms rules → TMR ⏳');
  });

  it('TMR failed shows failure indicator', (): void => {
    const events: readonly TraceEvent[] = [
      makeEvent('RULES_COMPLETED', '5ms → likely-ai'),
      makeEvent('TMR_FAILED', 'WASM crash'),
    ];
    expect(computeDebugPillText(events)).toBe('🔧 5ms rules → TMR ✗');
  });

  it('rules only with no TMR/AI shows TMR pending', (): void => {
    const events: readonly TraceEvent[] = [
      makeEvent('RULES_COMPLETED', '8ms → likely-ai'),
    ];
    expect(computeDebugPillText(events)).toBe('🔧 8ms rules (TMR pending)');
  });

  it('cache hit short-circuits rules detail', (): void => {
    const events: readonly TraceEvent[] = [
      makeEvent('CACHE_HIT', 'Cached rules result'),
    ];
    expect(computeDebugPillText(events)).toBe('🔧 cache');
  });

  it('order independence: TMR_COMPLETED takes priority regardless of position', (): void => {
    const events: readonly TraceEvent[] = [
      makeEvent('TMR_COMPLETED', '100ms → likely-ai'),
      makeEvent('RULES_COMPLETED', '5ms → likely-ai'),
      makeEvent('STICKER_UNCHANGED', 'confirmed'),
    ];
    expect(computeDebugPillText(events)).toContain('TMR');
  });
});

describe('indexEventsByType', (): void => {
  it('returns first occurrence of each event type', (): void => {
    const e1: TraceEvent = { event: 'RULES_COMPLETED', timestamp: 100, detail: 'first' };
    const e2: TraceEvent = { event: 'RULES_COMPLETED', timestamp: 200, detail: 'second' };
    const map = indexEventsByType([e1, e2]);
    expect(map.get('RULES_COMPLETED')).toBe(e1);
  });

  it('returns empty map for no events', (): void => {
    expect(indexEventsByType([]).size).toBe(0);
  });
});
