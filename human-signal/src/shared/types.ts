export type Brand<TValue, TBrand extends string> = TValue & { readonly __brand: TBrand };

export type ItemId = Brand<string, 'ItemId'>;
export type ContentHash = Brand<string, 'ContentHash'>;

export type ExtensionContext =
  | 'background'
  | 'content-script'
  | 'offscreen'
  | 'popup';

export type ExtractedItemType = 'post' | 'comment';

export type IdStability = 'stable' | 'permalink' | 'content-hash';

export interface ExtractedItemMetadata {
  readonly contentHash: ContentHash;
  readonly sourceUrl: string | null;
  readonly detectedAt: number;
  readonly idStability: IdStability;
}

export interface ExtractedItem {
  readonly itemId: ItemId;
  readonly itemType: ExtractedItemType;
  readonly text: string;
  readonly metadata: ExtractedItemMetadata;
  readonly isTruncated: boolean;
}

export type FeedbackType = 'agree' | 'disagree' | 'notUseful';

export type ScoringLabel =
  | 'high-signal'
  | 'specific'
  | 'thoughtful'
  | 'question'
  | 'mixed'
  | 'generic'
  | 'low-effort'
  | 'low-signal'
  | 'engagement-bait'
  | 'repeated'
  | 'unclear'
  | 'unavailable';

export type ConfidenceLabel = 'low' | 'medium' | 'high';

export interface ScoreDimensions {
  readonly authenticity: number;
  readonly specificity: number;
  readonly originality: number;
  readonly usefulness: number;
  readonly engagementBait: number;
  readonly templating: number;
}

export type ScoringSource = 'rules' | 'gemini' | 'system';

export interface ScoringResult {
  readonly itemId: ItemId;
  readonly label: ScoringLabel;
  readonly confidence: ConfidenceLabel;
  readonly dimensions: ScoreDimensions;
  readonly explanation: string;
  readonly source: ScoringSource;
  readonly scoringVersion: string;
  readonly scoredAt: number;
  readonly isTextTruncated: boolean;
}

export type GeminiAvailability =
  | 'available'
  | 'downloadable'
  | 'downloading'
  | 'unavailable'
  | 'error';

export interface GeminiStatus {
  readonly availability: GeminiAvailability;
  readonly downloadProgress: number | null;
  readonly lastCheckedAt: number | null;
  readonly errorMessage: string | null;
}

export type ScoringMode = 'rules' | 'gemini' | 'unavailable';

export type StickerVisibility = 'all' | 'posts' | 'comments' | 'off';

export type StrictnessLevel = 'low' | 'medium' | 'high';

export interface HealthMetrics {
  readonly itemsScored: number;
  readonly cacheEntries: number;
  readonly cacheHitRate: number;
  readonly avgLatencyMs: number;
  readonly failureCount: number;
  readonly queueDepth: number;
  readonly scoringMode: ScoringMode;
  readonly adapterSuccessRate: number;
  readonly logEntryCount: number;
}

export interface UserSettings {
  readonly isEnabled: boolean;
  readonly scoringMode: ScoringMode;
  readonly stickerVisibility: StickerVisibility;
  readonly strictness: StrictnessLevel;
  readonly weeklySummaryEnabled: boolean;
  readonly showExplanations: boolean;
  readonly stickerOpacity: number;
}

export interface FeedbackEntry {
  readonly itemId: ItemId;
  readonly feedback: FeedbackType;
  readonly label: ScoringLabel;
  readonly source: ScoringSource;
  readonly createdAt: number;
}

export interface E2EGeminiMockConfig {
  readonly isEnabled: boolean;
  readonly availability: GeminiAvailability;
  readonly promptMode: 'valid' | 'invalid' | 'mixed';
  readonly downloadMode: 'success' | 'failure';
  readonly downloadProgress: number | null;
}

export const DEFAULT_E2E_GEMINI_MOCK_CONFIG: E2EGeminiMockConfig = {
  isEnabled: false,
  availability: 'unavailable',
  promptMode: 'valid',
  downloadMode: 'success',
  downloadProgress: null,
};

export interface PriorityUpdate {
  readonly itemId: ItemId;
  readonly inViewport: boolean;
}

export const DEFAULT_SCORE_DIMENSIONS: ScoreDimensions = {
  authenticity: 0,
  specificity: 0,
  originality: 0,
  usefulness: 0,
  engagementBait: 0,
  templating: 0,
};

export const DEFAULT_GEMINI_STATUS: GeminiStatus = {
  availability: 'unavailable',
  downloadProgress: null,
  lastCheckedAt: null,
  errorMessage: null,
};

export const DEFAULT_USER_SETTINGS: UserSettings = {
  isEnabled: true,
  scoringMode: 'rules',
  stickerVisibility: 'all',
  strictness: 'medium',
  weeklySummaryEnabled: false,
  showExplanations: true,
  stickerOpacity: 1,
};

export function createUnavailableResult(item: ExtractedItem): ScoringResult {
  const result: ScoringResult = {
    itemId: item.itemId,
    label: 'unavailable',
    confidence: 'low',
    dimensions: DEFAULT_SCORE_DIMENSIONS,
    explanation: 'Scoring is not available yet.',
    source: 'system',
    scoringVersion: 'shell-0',
    scoredAt: Date.now(),
    isTextTruncated: item.isTruncated,
  };

  return result;
}

export function createDefaultHealthMetrics(logEntryCount: number): HealthMetrics {
  const healthMetrics: HealthMetrics = {
    itemsScored: 0,
    cacheEntries: 0,
    cacheHitRate: 0,
    avgLatencyMs: 0,
    failureCount: 0,
    queueDepth: 0,
    scoringMode: 'rules',
    adapterSuccessRate: 0,
    logEntryCount,
  };

  return healthMetrics;
}
