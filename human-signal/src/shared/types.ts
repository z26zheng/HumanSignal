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
  | 'useful'
  | 'low-effort'
  | 'engagement-bait'
  | 'sales-pitch'
  | 'repeated'
  | 'unavailable';

export type ConfidenceLabel = 'low' | 'medium' | 'high';

export interface ScoreDimensions {
  readonly specificity: number;
  readonly originality: number;
  readonly usefulness: number;
  readonly engagementBait: number;
}

export interface ScoringResult {
  readonly itemId: ItemId;
  readonly label: ScoringLabel;
  readonly confidence: ConfidenceLabel;
  readonly dimensions: ScoreDimensions;
  readonly explanation: string;
  readonly scoringVersion: string;
  readonly scoredAt: number;
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

export interface HealthMetrics {
  readonly itemsScored: number;
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
  readonly showExplanations: boolean;
  readonly stickerOpacity: number;
}

export interface PriorityUpdate {
  readonly itemId: ItemId;
  readonly inViewport: boolean;
}

export const DEFAULT_SCORE_DIMENSIONS: ScoreDimensions = {
  specificity: 0,
  originality: 0,
  usefulness: 0,
  engagementBait: 0,
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
    scoringVersion: 'shell-0',
    scoredAt: Date.now(),
  };

  return result;
}

export function createDefaultHealthMetrics(logEntryCount: number): HealthMetrics {
  const healthMetrics: HealthMetrics = {
    itemsScored: 0,
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
