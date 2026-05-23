import type { ScoringTelemetryEntry } from '@/shared/scoring-telemetry';
import type {
  ExtensionContext,
  ExtractedItem,
  FeedbackType,
  GeminiStatus,
  HealthMetrics,
  ScoringLabel,
  ScoringResult,
  ScoringSource,
  UserSettings,
} from '@/shared/types';

export interface BaseMessage {
  readonly type: string;
  readonly requestId: string;
  readonly source: ExtensionContext;
  readonly target: ExtensionContext;
}

export interface PingMessage extends BaseMessage {
  readonly type: 'PING';
}

export interface ScoreBatchMessage extends BaseMessage {
  readonly type: 'SCORE_BATCH';
  readonly items: readonly ExtractedItem[];
}

export interface ScoreResultMessage extends BaseMessage {
  readonly type: 'SCORE_RESULT';
  readonly results: readonly ScoringResult[];
}

export interface GeminiPromptMessage extends BaseMessage {
  readonly type: 'GEMINI_PROMPT';
  readonly item: ExtractedItem;
}

export interface CheckGeminiStatusMessage extends BaseMessage {
  readonly type: 'CHECK_GEMINI_STATUS';
}

export interface TriggerDownloadMessage extends BaseMessage {
  readonly type: 'TRIGGER_DOWNLOAD';
}

export interface ShowExplanationMessage extends BaseMessage {
  readonly type: 'SHOW_EXPLANATION';
  readonly itemId: string;
}

export interface SettingsChangedMessage extends BaseMessage {
  readonly type: 'SETTINGS_CHANGED';
  readonly settings: Partial<UserSettings>;
}

export interface FeedbackMessage extends BaseMessage {
  readonly type: 'FEEDBACK';
  readonly itemId: string;
  readonly feedback: FeedbackType;
  readonly label: ScoringLabel;
  readonly scoringSource: ScoringSource;
}

export interface GetHealthMessage extends BaseMessage {
  readonly type: 'GET_HEALTH';
}

export interface ClearCacheMessage extends BaseMessage {
  readonly type: 'CLEAR_CACHE';
}

export interface DeleteAllDataMessage extends BaseMessage {
  readonly type: 'DELETE_ALL_DATA';
}

export interface EnsureOffscreenDocumentMessage extends BaseMessage {
  readonly type: 'ENSURE_OFFSCREEN_DOCUMENT';
}

export interface CloseOffscreenDocumentMessage extends BaseMessage {
  readonly type: 'CLOSE_OFFSCREEN_DOCUMENT';
}

export interface DestroyGeminiSessionMessage extends BaseMessage {
  readonly type: 'DESTROY_GEMINI_SESSION';
}

export interface ServiceWorkerAliveMessage extends BaseMessage {
  readonly type: 'SERVICE_WORKER_ALIVE';
}

export interface RediscoverContentMessage extends BaseMessage {
  readonly type: 'REDISCOVER_CONTENT';
}

export interface GetTelemetryMessage extends BaseMessage {
  readonly type: 'GET_TELEMETRY';
}

export interface OpenPopupMessage extends BaseMessage {
  readonly type: 'OPEN_POPUP';
}

export interface GetDebugStateMessage extends BaseMessage {
  readonly type: 'GET_DEBUG_STATE';
}

export interface TmrClassifyMessage extends BaseMessage {
  readonly type: 'TMR_CLASSIFY';
  readonly itemId: string;
  readonly text: string;
}

export interface TmrStatusMessage extends BaseMessage {
  readonly type: 'TMR_STATUS';
}

export interface TmrLoadModelMessage extends BaseMessage {
  readonly type: 'TMR_LOAD_MODEL';
}

export type HumanSignalMessage =
  | PingMessage
  | ScoreBatchMessage
  | ScoreResultMessage
  | GeminiPromptMessage
  | CheckGeminiStatusMessage
  | TriggerDownloadMessage
  | ShowExplanationMessage
  | SettingsChangedMessage
  | FeedbackMessage
  | GetHealthMessage
  | ClearCacheMessage
  | DeleteAllDataMessage
  | EnsureOffscreenDocumentMessage
  | CloseOffscreenDocumentMessage
  | DestroyGeminiSessionMessage
  | ServiceWorkerAliveMessage
  | RediscoverContentMessage
  | GetTelemetryMessage
  | OpenPopupMessage
  | GetDebugStateMessage
  | TmrClassifyMessage
  | TmrStatusMessage
  | TmrLoadModelMessage;

export interface PongPayload {
  readonly type: 'PONG';
  readonly receivedAt: number;
}

export interface ScoreBatchPayload {
  readonly type: 'SCORE_RESULT';
  readonly results: readonly ScoringResult[];
  readonly queued: readonly string[];
}

export interface GeminiResultPayload {
  readonly type: 'GEMINI_RESULT';
  readonly result: ScoringResult | null;
  readonly status: GeminiStatus;
}

export interface GeminiStatusPayload {
  readonly type: 'MODEL_STATUS';
  readonly status: GeminiStatus;
}

export interface HealthPayload {
  readonly type: 'HEALTH_RESULT';
  readonly health: HealthMetrics;
}

export interface SettingsPayload {
  readonly type: 'SETTINGS_RESULT';
  readonly settings: UserSettings;
}

export interface AckPayload {
  readonly type: 'ACK';
}

export interface OffscreenLifecyclePayload {
  readonly type: 'OFFSCREEN_DOCUMENT_RESULT';
  readonly isAvailable: boolean;
}

export interface ServiceWorkerAlivePayload {
  readonly type: 'SERVICE_WORKER_ALIVE';
}

export interface TelemetryPayload {
  readonly type: 'TELEMETRY_RESULT';
  readonly entries: readonly ScoringTelemetryEntry[];
  readonly mode: string;
  readonly itemsScored: number;
}

export interface DebugLogEntry {
  readonly timestamp: number;
  readonly level: 'info' | 'warn' | 'error';
  readonly context: string;
  readonly message: string;
  readonly data: Record<string, unknown>;
}

export interface DebugStatePayload {
  readonly type: 'DEBUG_STATE_RESULT';
  readonly health: HealthMetrics | null;
  readonly geminiAvailability: string;
  readonly scoringMode: string;
  readonly recentLogs: readonly DebugLogEntry[];
}

export interface TmrClassifyResultPayload {
  readonly type: 'TMR_CLASSIFY_RESULT';
  readonly itemId: string;
  readonly aiProbability: number;
  readonly latencyMs: number;
}

export interface TmrStatusResultPayload {
  readonly type: 'TMR_STATUS_RESULT';
  readonly isLoaded: boolean;
  readonly isLoading: boolean;
  readonly downloadProgress: number | null;
  readonly errorMessage: string | null;
}

export type MessagePayload =
  | PongPayload
  | ScoreBatchPayload
  | GeminiResultPayload
  | GeminiStatusPayload
  | HealthPayload
  | SettingsPayload
  | AckPayload
  | OffscreenLifecyclePayload
  | ServiceWorkerAlivePayload
  | TelemetryPayload
  | DebugStatePayload
  | TmrClassifyResultPayload
  | TmrStatusResultPayload;

export interface MessageError {
  readonly code: string;
  readonly message: string;
}

export type MessageResponse =
  | {
      readonly ok: true;
      readonly requestId: string;
      readonly payload: MessagePayload;
    }
  | {
      readonly ok: false;
      readonly requestId: string | null;
      readonly error: MessageError;
    };

export type MessageHandler = (
  message: HumanSignalMessage,
  sender: Browser.runtime.MessageSender,
) => Promise<MessagePayload>;
