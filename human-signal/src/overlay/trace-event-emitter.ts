import { getLabelText } from '@/overlay/score-display';

import type { EventTraceStore, ItemTrace, TraceEventType } from '@/shared/event-trace';
import type { ScoringResult } from '@/shared/types';

export interface EmitTraceEventsParams {
  readonly result: ScoringResult;
  readonly isAiUpgrade: boolean;
  readonly previousLabel: string | null;
  readonly previousScoredAt: number | null;
  readonly now: number;
}

interface PendingEvent {
  readonly event: TraceEventType;
  readonly detail: string;
}

/**
 * Determine which trace events to emit for a given score result update.
 *
 * Pure function: returns an array of events to add to the store. No side
 * effects, no DOM. The caller (overlay controller) is responsible for
 * applying the events to its trace store.
 */
export function computeTraceEvents(trace: ItemTrace, params: EmitTraceEventsParams): readonly PendingEvent[] {
  const events: PendingEvent[] = [];
  const { result, isAiUpgrade, previousLabel, previousScoredAt, now } = params;
  const hasBackground: boolean = result.traceEvents !== undefined && result.traceEvents.length > 0;

  if (isAiUpgrade) {
    if (!hasBackground) {
      const queuedAt: number = trace.events.find((e) => e.event === 'AI_QUEUED')?.timestamp ?? previousScoredAt ?? now;
      const aiMs: number = now - queuedAt;
      events.push({ event: 'AI_COMPLETED', detail: `${aiMs}ms → ${result.label}, confidence: ${result.confidence}` });
    }

    if (previousLabel !== null && previousLabel !== result.label) {
      events.push({ event: 'STICKER_UPGRADED', detail: `${previousLabel} → ${result.label}` });
    } else {
      events.push({ event: 'STICKER_UNCHANGED', detail: 'AI confirmed rules result' });
    }
    return events;
  }

  if (!hasBackground) {
    const discoveredAt: number = trace.events.find((e) => e.event === 'DISCOVERED')?.timestamp ?? now;
    const roundTripMs: number = now - discoveredAt;
    const hasRulesAlready: boolean = trace.events.some((e) => e.event === 'RULES_COMPLETED');
    if (!hasRulesAlready) {
      events.push({ event: 'RULES_STARTED', detail: '' });
      events.push({ event: 'RULES_COMPLETED', detail: `${roundTripMs}ms → ${result.label}, confidence: ${result.confidence}` });
    }
  }

  const labelText: string = getLabelText(result.label);
  events.push({ event: 'STICKER_SHOWN', detail: `Label: ${labelText} (${result.source} result)` });

  return events;
}

/**
 * Apply trace events to the store. Thin wrapper around `computeTraceEvents`
 * for callers that just want the side-effect.
 */
export function applyTraceEvents(
  store: EventTraceStore,
  itemId: string,
  trace: ItemTrace,
  params: EmitTraceEventsParams,
): void {
  for (const { event, detail } of computeTraceEvents(trace, params)) {
    store.addEvent(itemId, event, detail);
  }
}
