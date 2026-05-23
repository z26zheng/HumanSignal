import { describe, expect, it } from 'vitest';

import { ScoringTelemetry } from '@/shared/scoring-telemetry';

describe('ScoringTelemetry', (): void => {
  it('tracks full lifecycle: impression → rules → gemini upgrade', (): void => {
    const telemetry: ScoringTelemetry = new ScoringTelemetry();

    telemetry.recordImpression('test-item-1', 'post', 'hash_1');
    telemetry.recordRulesStart('test-item-1');
    telemetry.recordRulesEnd('test-item-1', 'possibly-ai');
    telemetry.recordGeminiQueued('test-item-1');
    telemetry.recordGeminiStart('test-item-1');
    telemetry.recordGeminiEnd('test-item-1', 'feels-human', 'gemini', false);

    const entry = telemetry.getEntry('test-item-1');
    expect(entry).toBeDefined();
    expect(entry?.rulesLabel).toBe('possibly-ai');
    expect(entry?.geminiLabel).toBe('feels-human');
    expect(entry?.finalSource).toBe('gemini');
    expect(entry?.geminiFailed).toBe(false);
    expect(entry?.rulesLatencyMs).not.toBeNull();
    expect(entry!.rulesLatencyMs!).toBeGreaterThanOrEqual(0);
    expect(entry?.geminiLatencyMs).not.toBeNull();
    expect(entry!.geminiLatencyMs!).toBeGreaterThanOrEqual(0);
  });

  it('tracks cache hits with source', (): void => {
    const telemetry: ScoringTelemetry = new ScoringTelemetry();

    telemetry.recordImpression('cached-item', 'comment', 'hash_2');
    telemetry.recordCacheHit('cached-item', 'gemini');

    const entry = telemetry.getEntry('cached-item');
    expect(entry?.cacheHit).toBe(true);
    expect(entry?.finalSource).toBe('gemini');
  });

  it('tracks Gemini failure with fallback to rules', (): void => {
    const telemetry: ScoringTelemetry = new ScoringTelemetry();

    telemetry.recordImpression('fail-item', 'post', 'hash_3');
    telemetry.recordRulesStart('fail-item');
    telemetry.recordRulesEnd('fail-item', 'possibly-ai');
    telemetry.recordGeminiQueued('fail-item');
    telemetry.recordGeminiStart('fail-item');
    telemetry.recordGeminiEnd('fail-item', 'possibly-ai', 'rules', true);

    const entry = telemetry.getEntry('fail-item');
    expect(entry?.geminiFailed).toBe(true);
    expect(entry?.finalSource).toBe('rules');
    expect(entry?.rulesLabel).toBe('possibly-ai');
  });

  it('returns recent entries for batch inspection', (): void => {
    const telemetry: ScoringTelemetry = new ScoringTelemetry();

    telemetry.recordImpression('item-a', 'post', 'hash_a');
    telemetry.recordImpression('item-b', 'comment', 'hash_b');

    expect(telemetry.getRecentEntries().length).toBe(2);
  });

  it('evicts oldest entries when capacity exceeded', (): void => {
    const telemetry: ScoringTelemetry = new ScoringTelemetry();

    for (let i: number = 0; i < 210; i += 1) {
      telemetry.recordImpression(`item-${i}`, 'post', `hash_${i}`);
    }

    expect(telemetry.getRecentEntries().length).toBeLessThanOrEqual(200);
    expect(telemetry.getEntry('item-0')).toBeUndefined();
    expect(telemetry.getEntry('item-209')).toBeDefined();
  });

  it('handles recording on unknown itemId gracefully', (): void => {
    const telemetry: ScoringTelemetry = new ScoringTelemetry();

    telemetry.recordRulesStart('unknown');
    telemetry.recordRulesEnd('unknown', 'possibly-ai');
    telemetry.recordGeminiEnd('unknown', null, 'rules', true);

    expect(telemetry.getEntry('unknown')).toBeUndefined();
  });

  it('records impression timestamp and initial state', (): void => {
    const telemetry: ScoringTelemetry = new ScoringTelemetry();
    const before: number = Date.now();

    telemetry.recordImpression('ts-item', 'post', 'hash_ts');

    const entry = telemetry.getEntry('ts-item');
    expect(entry?.impressionAt).toBeGreaterThanOrEqual(before);
    expect(entry?.cacheHit).toBe(false);
    expect(entry?.geminiFailed).toBe(false);
    expect(entry?.rulesLabel).toBeNull();
    expect(entry?.geminiLabel).toBeNull();
  });
});
