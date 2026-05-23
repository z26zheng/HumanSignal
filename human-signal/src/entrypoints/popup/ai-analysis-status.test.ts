import { describe, expect, it } from 'vitest';

import { getAiAnalysisStatus, type AiAnalysisState } from '@/entrypoints/popup/ai-analysis-status';

describe('getAiAnalysisStatus', (): void => {
  it('shows "Active — running locally" when both TMR and Gemini are ready', (): void => {
    const state: AiAnalysisState = { tmrLoaded: true, tmrError: null, geminiAvailability: 'available' };
    const status = getAiAnalysisStatus(state);

    expect(status.headline).toBe('Active — running locally');
    expect(status.dot).toBe('green');
    expect(status.showEnhancedExplanationsLink).toBe(false);
    expect(status.showTryAgain).toBe(false);
  });

  it('shows "Active" with enhanced explanations link when TMR ready but Gemini downloadable', (): void => {
    const state: AiAnalysisState = { tmrLoaded: true, tmrError: null, geminiAvailability: 'downloadable' };
    const status = getAiAnalysisStatus(state);

    expect(status.headline).toBe('Active');
    expect(status.dot).toBe('green');
    expect(status.showEnhancedExplanationsLink).toBe(true);
  });

  it('shows "Active" without link when TMR ready and Gemini unavailable', (): void => {
    const state: AiAnalysisState = { tmrLoaded: true, tmrError: null, geminiAvailability: 'unavailable' };
    const status = getAiAnalysisStatus(state);

    expect(status.headline).toBe('Active');
    expect(status.dot).toBe('green');
    expect(status.showEnhancedExplanationsLink).toBe(false);
  });

  it('shows "Setting up AI analysis..." when TMR is loading', (): void => {
    const state: AiAnalysisState = { tmrLoaded: false, tmrError: null, geminiAvailability: 'unavailable' };
    const status = getAiAnalysisStatus(state);

    expect(status.headline).toBe('Setting up AI analysis...');
    expect(status.dot).toBe('yellow');
    expect(status.showTryAgain).toBe(false);
  });

  it('shows error with Try again when TMR has error', (): void => {
    const state: AiAnalysisState = { tmrLoaded: false, tmrError: 'WASM init failed', geminiAvailability: 'unavailable' };
    const status = getAiAnalysisStatus(state);

    expect(status.headline).toContain('temporarily unavailable');
    expect(status.dot).toBeNull();
    expect(status.showTryAgain).toBe(true);
    expect(status.errorMessage).toBe('WASM init failed');
  });

  it('shows "Active — running locally" when Gemini available but no TMR loaded', (): void => {
    const state: AiAnalysisState = { tmrLoaded: false, tmrError: 'model failed', geminiAvailability: 'available' };

    const stateNoError: AiAnalysisState = { tmrLoaded: false, tmrError: null, geminiAvailability: 'available' };
    const status = getAiAnalysisStatus(stateNoError);

    expect(status.headline).toBe('Setting up AI analysis...');
    expect(status.dot).toBe('yellow');
  });

  it('shows "Active — running locally" when only Gemini available and TMR errored out', (): void => {
    const state: AiAnalysisState = { tmrLoaded: false, tmrError: 'failed', geminiAvailability: 'available' };
    const status = getAiAnalysisStatus(state);

    expect(status.showTryAgain).toBe(true);
  });

  it('shows "Pattern-based analysis active" when neither model is available', (): void => {
    const state: AiAnalysisState = { tmrLoaded: false, tmrError: null, geminiAvailability: 'unavailable' };
    const status = getAiAnalysisStatus(state);

    expect(status.headline).toBe('Setting up AI analysis...');
  });

  it('shows pattern-based fallback when TMR errored and Gemini unavailable', (): void => {
    const state: AiAnalysisState = { tmrLoaded: false, tmrError: 'fail', geminiAvailability: 'unavailable' };
    const status = getAiAnalysisStatus(state);

    expect(status.headline).toContain('temporarily unavailable');
    expect(status.showTryAgain).toBe(true);
  });

  it('never shows both enhanced link and try again at the same time', (): void => {
    const states: readonly AiAnalysisState[] = [
      { tmrLoaded: true, tmrError: null, geminiAvailability: 'available' },
      { tmrLoaded: true, tmrError: null, geminiAvailability: 'downloadable' },
      { tmrLoaded: true, tmrError: null, geminiAvailability: 'unavailable' },
      { tmrLoaded: false, tmrError: null, geminiAvailability: 'unavailable' },
      { tmrLoaded: false, tmrError: 'err', geminiAvailability: 'unavailable' },
      { tmrLoaded: false, tmrError: null, geminiAvailability: 'available' },
    ];

    for (const state of states) {
      const status = getAiAnalysisStatus(state);
      expect(status.showEnhancedExplanationsLink && status.showTryAgain).toBe(false);
    }
  });

  it('always returns a non-empty headline', (): void => {
    const states: readonly AiAnalysisState[] = [
      { tmrLoaded: true, tmrError: null, geminiAvailability: 'available' },
      { tmrLoaded: true, tmrError: null, geminiAvailability: 'downloadable' },
      { tmrLoaded: false, tmrError: null, geminiAvailability: 'unavailable' },
      { tmrLoaded: false, tmrError: 'err', geminiAvailability: 'error' },
    ];

    for (const state of states) {
      const status = getAiAnalysisStatus(state);
      expect(status.headline.length).toBeGreaterThan(0);
    }
  });
});
