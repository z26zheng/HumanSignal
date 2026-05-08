import { DEFAULT_E2E_GEMINI_MOCK_CONFIG, DEFAULT_GEMINI_STATUS } from '@/shared/types';

import type {
  E2EGeminiMockConfig,
  ExtractedItem,
  GeminiStatus,
  ScoringResult,
} from '@/shared/types';

export function createE2EGeminiMockStatus(
  availability: GeminiStatus['availability'],
  downloadProgress: number | null,
): GeminiStatus {
  return {
    ...DEFAULT_GEMINI_STATUS,
    availability,
    downloadProgress,
    lastCheckedAt: Date.now(),
    errorMessage: availability === 'error' ? 'E2E Gemini mock error' : null,
  };
}

export function createE2EGeminiStatusResponse(config: E2EGeminiMockConfig): GeminiStatus {
  return createE2EGeminiMockStatus(config.availability, config.downloadProgress);
}

export function createE2EGeminiDownloadResponse(config: E2EGeminiMockConfig): GeminiStatus {
  return config.downloadMode === 'failure'
    ? createE2EGeminiMockStatus('error', null)
    : createE2EGeminiMockStatus('available', 100);
}

export function createE2EGeminiScoringResult(
  item: ExtractedItem,
  config: E2EGeminiMockConfig = DEFAULT_E2E_GEMINI_MOCK_CONFIG,
): ScoringResult | null {
  if (config.promptMode === 'invalid') {
    return null;
  }

  if (config.promptMode === 'mixed' && item.text.toLowerCase().includes('fail gemini')) {
    return null;
  }

  return {
    itemId: item.itemId,
    label: item.itemType === 'comment' ? 'thoughtful' : 'high-signal',
    confidence: 'high',
    dimensions: {
      authenticity: 0.9,
      specificity: 0.8,
      originality: 0.8,
      usefulness: 0.9,
      engagementBait: 0,
      templating: 0,
    },
    explanation: 'E2E Gemini mock returned a deterministic local score.',
    source: 'gemini',
    scoringVersion: 'gemini-1',
    scoredAt: Date.now(),
    isTextTruncated: item.isTruncated,
  };
}
