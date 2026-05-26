import { describe, expect, it } from 'vitest';

import { computeTraceEvents } from '@/overlay/trace-event-emitter';

import type { ItemTrace } from '@/shared/event-trace';
import type { ItemId, ScoringResult } from '@/shared/types';

function makeTrace(events: readonly { event: string; timestamp: number; detail: string }[]): ItemTrace {
  return {
    itemId: 'item-1',
    itemType: 'post',
    contentHash: 'hash',
    textLength: 100,
    isTruncated: false,
    events: events.map((e) => ({ event: e.event as ItemTrace['events'][number]['event'], timestamp: e.timestamp, detail: e.detail })),
  };
}

function makeResult(overrides: Partial<ScoringResult> = {}): ScoringResult {
  return {
    itemId: 'item-1' as ItemId,
    label: 'feels-human',
    confidence: 'high',
    dimensions: {
      authenticity: 0.5, specificity: 0.5, originality: 0.5, usefulness: 0.5, engagementBait: 0, templating: 0,
    },
    explanation: 'test',
    source: 'rules',
    scoringVersion: 'rules-1',
    scoredAt: 1000,
    isTextTruncated: false,
    ...overrides,
  };
}

describe('computeTraceEvents', (): void => {
  it('emits STICKER_UNCHANGED when AI upgrade label matches previous label', (): void => {
    const trace = makeTrace([
      { event: 'DISCOVERED', timestamp: 1000, detail: '' },
      { event: 'AI_QUEUED', timestamp: 1100, detail: '' },
    ]);
    const events = computeTraceEvents(trace, {
      result: makeResult({ source: 'gemini', label: 'feels-human' }),
      isAiUpgrade: true,
      previousLabel: 'feels-human',
      previousScoredAt: 1050,
      now: 2000,
    });
    const eventNames = events.map((e) => e.event);
    expect(eventNames).toContain('AI_COMPLETED');
    expect(eventNames).toContain('STICKER_UNCHANGED');
    expect(eventNames).not.toContain('STICKER_UPGRADED');
  });

  it('emits STICKER_UPGRADED when AI upgrade label differs from previous', (): void => {
    const trace = makeTrace([
      { event: 'DISCOVERED', timestamp: 1000, detail: '' },
      { event: 'AI_QUEUED', timestamp: 1100, detail: '' },
    ]);
    const events = computeTraceEvents(trace, {
      result: makeResult({ source: 'gemini', label: 'probably-ai' }),
      isAiUpgrade: true,
      previousLabel: 'feels-human',
      previousScoredAt: 1050,
      now: 2000,
    });
    expect(events.map((e) => e.event)).toContain('STICKER_UPGRADED');
  });

  it('does not emit AI_COMPLETED when backend already attached trace events', (): void => {
    const trace = makeTrace([
      { event: 'DISCOVERED', timestamp: 1000, detail: '' },
    ]);
    const events = computeTraceEvents(trace, {
      result: makeResult({
        source: 'gemini',
        traceEvents: [{ event: 'AI_COMPLETED', timestamp: 1500, detail: 'from backend' }],
      }),
      isAiUpgrade: true,
      previousLabel: 'feels-human',
      previousScoredAt: 1050,
      now: 2000,
    });
    expect(events.map((e) => e.event)).not.toContain('AI_COMPLETED');
    expect(events.map((e) => e.event)).toContain('STICKER_UNCHANGED');
  });

  it('emits RULES_STARTED + RULES_COMPLETED on a rules result with no backend trace and no prior rules events', (): void => {
    const trace = makeTrace([
      { event: 'DISCOVERED', timestamp: 1000, detail: '' },
    ]);
    const events = computeTraceEvents(trace, {
      result: makeResult(),
      isAiUpgrade: false,
      previousLabel: null,
      previousScoredAt: null,
      now: 2000,
    });
    const eventNames = events.map((e) => e.event);
    expect(eventNames).toContain('RULES_STARTED');
    expect(eventNames).toContain('RULES_COMPLETED');
    expect(eventNames).toContain('STICKER_SHOWN');
  });

  it('does NOT re-emit RULES_STARTED/COMPLETED when already in trace', (): void => {
    const trace = makeTrace([
      { event: 'DISCOVERED', timestamp: 1000, detail: '' },
      { event: 'RULES_COMPLETED', timestamp: 1100, detail: '5ms' },
    ]);
    const events = computeTraceEvents(trace, {
      result: makeResult(),
      isAiUpgrade: false,
      previousLabel: null,
      previousScoredAt: null,
      now: 2000,
    });
    const eventNames = events.map((e) => e.event);
    expect(eventNames).not.toContain('RULES_STARTED');
    expect(eventNames).not.toContain('RULES_COMPLETED');
    expect(eventNames).toContain('STICKER_SHOWN');
  });

  it('always emits STICKER_SHOWN on non-upgrade results', (): void => {
    const trace = makeTrace([{ event: 'DISCOVERED', timestamp: 1000, detail: '' }]);
    const events = computeTraceEvents(trace, {
      result: makeResult(),
      isAiUpgrade: false,
      previousLabel: null,
      previousScoredAt: null,
      now: 2000,
    });
    const stickerShown = events.find((e) => e.event === 'STICKER_SHOWN');
    expect(stickerShown).toBeDefined();
    expect(stickerShown?.detail).toContain('rules');
  });
});
