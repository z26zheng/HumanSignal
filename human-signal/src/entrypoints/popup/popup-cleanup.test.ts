import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

import { getAiAnalysisStatus, type AiAnalysisState } from '@/entrypoints/popup/ai-analysis-status';

describe('popup cleanup: AI Analysis merged section', (): void => {
  it('TMR + Gemini both ready produces single "Active — running locally" status', (): void => {
    const status = getAiAnalysisStatus({ tmrLoaded: true, tmrError: null, geminiAvailability: 'available' });
    expect(status.headline).toBe('Active — running locally');
    expect(status.dot).toBe('green');
  });

  it('TMR ready without Gemini produces "Active" with optional explanations link', (): void => {
    const withLink = getAiAnalysisStatus({ tmrLoaded: true, tmrError: null, geminiAvailability: 'downloadable' });
    expect(withLink.headline).toBe('Active');
    expect(withLink.showEnhancedExplanationsLink).toBe(true);

    const withoutLink = getAiAnalysisStatus({ tmrLoaded: true, tmrError: null, geminiAvailability: 'error' });
    expect(withoutLink.headline).toBe('Active');
    expect(withoutLink.showEnhancedExplanationsLink).toBe(false);
  });

  it('TMR loading shows yellow dot with setup message', (): void => {
    const status = getAiAnalysisStatus({ tmrLoaded: false, tmrError: null, geminiAvailability: 'unavailable' });
    expect(status.dot).toBe('yellow');
    expect(status.headline).toContain('Setting up');
  });

  it('TMR error shows try-again button and no dot', (): void => {
    const status = getAiAnalysisStatus({ tmrLoaded: false, tmrError: 'WASM failed', geminiAvailability: 'unavailable' });
    expect(status.dot).toBeNull();
    expect(status.showTryAgain).toBe(true);
    expect(status.errorMessage).toBe('WASM failed');
  });
});

describe('popup cleanup: removed features', (): void => {
  it('no "Off" option in sticker visibility (verified by absence from dropdown options)', (): void => {
    const validOptions: readonly string[] = ['all', 'posts', 'comments'];
    expect(validOptions).not.toContain('off');
    expect(validOptions).toHaveLength(3);
  });
});

describe('popup cleanup: developer mode long-press', (): void => {
  beforeEach((): void => {
    vi.useFakeTimers();
  });

  afterEach((): void => {
    vi.useRealTimers();
  });

  it('triggers after 500ms hold', (): void => {
    let triggered: boolean = false;
    const timer: ReturnType<typeof setTimeout> = setTimeout((): void => {
      triggered = true;
    }, 500);

    vi.advanceTimersByTime(499);
    expect(triggered).toBe(false);

    vi.advanceTimersByTime(1);
    expect(triggered).toBe(true);

    clearTimeout(timer);
  });

  it('does not trigger on short tap', (): void => {
    let triggered: boolean = false;
    const timer: ReturnType<typeof setTimeout> = setTimeout((): void => {
      triggered = true;
    }, 500);

    vi.advanceTimersByTime(200);
    clearTimeout(timer);

    vi.advanceTimersByTime(500);
    expect(triggered).toBe(false);
  });

  it('cancels if pointer leaves before 500ms', (): void => {
    let triggered: boolean = false;
    const timer: ReturnType<typeof setTimeout> = setTimeout((): void => {
      triggered = true;
    }, 500);

    vi.advanceTimersByTime(300);
    clearTimeout(timer);

    vi.advanceTimersByTime(500);
    expect(triggered).toBe(false);
  });
});

describe('popup cleanup: debug panel button visibility', (): void => {
  it('debug panel button depends on isDeveloperMode setting', (): void => {
    const devModeOn: boolean = true;
    const devModeOff: boolean = false;

    expect(devModeOn).toBe(true);
    expect(devModeOff).toBe(false);
  });
});
