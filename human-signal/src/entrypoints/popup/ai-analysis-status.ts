import type { GeminiAvailability } from '@/shared/types';

export interface AiAnalysisState {
  readonly tmrLoaded: boolean;
  readonly tmrError: string | null;
  readonly geminiAvailability: GeminiAvailability;
}

export type AiStatusDot = 'green' | 'yellow' | null;

export interface AiAnalysisStatus {
  readonly headline: string;
  readonly dot: AiStatusDot;
  readonly showEnhancedExplanationsLink: boolean;
  readonly showTryAgain: boolean;
  readonly errorMessage: string | null;
}

export function getAiAnalysisStatus(state: AiAnalysisState): AiAnalysisStatus {
  if (state.tmrLoaded && state.geminiAvailability === 'available') {
    return {
      headline: 'Active — running locally',
      dot: 'green',
      showEnhancedExplanationsLink: false,
      showTryAgain: false,
      errorMessage: null,
    };
  }

  if (state.tmrLoaded) {
    return {
      headline: 'Active',
      dot: 'green',
      showEnhancedExplanationsLink: state.geminiAvailability === 'downloadable',
      showTryAgain: false,
      errorMessage: null,
    };
  }

  if (!state.tmrLoaded && state.tmrError === null) {
    return {
      headline: 'Setting up AI analysis...',
      dot: 'yellow',
      showEnhancedExplanationsLink: false,
      showTryAgain: false,
      errorMessage: null,
    };
  }

  if (state.tmrError !== null) {
    return {
      headline: 'AI analysis temporarily unavailable. Results use pattern matching.',
      dot: null,
      showEnhancedExplanationsLink: false,
      showTryAgain: true,
      errorMessage: state.tmrError,
    };
  }

  if (state.geminiAvailability === 'available') {
    return {
      headline: 'Active — running locally',
      dot: 'green',
      showEnhancedExplanationsLink: false,
      showTryAgain: false,
      errorMessage: null,
    };
  }

  return {
    headline: 'Pattern-based analysis active.',
    dot: null,
    showEnhancedExplanationsLink: false,
    showTryAgain: false,
    errorMessage: null,
  };
}
