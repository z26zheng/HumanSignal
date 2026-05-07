import type {
  ExtensionContext,
  ExtractedItem,
  FeedbackType,
  GeminiStatus,
  HealthMetrics,
  PriorityUpdate,
  ScoringResult,
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

export interface PriorityUpdateMessage extends BaseMessage {
  readonly type: 'PRIORITY_UPDATE';
  readonly updates: readonly PriorityUpdate[];
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
}

export interface GetHealthMessage extends BaseMessage {
  readonly type: 'GET_HEALTH';
}

export interface EnsureOffscreenDocumentMessage extends BaseMessage {
  readonly type: 'ENSURE_OFFSCREEN_DOCUMENT';
}

export interface CloseOffscreenDocumentMessage extends BaseMessage {
  readonly type: 'CLOSE_OFFSCREEN_DOCUMENT';
}

export type HumanSignalMessage =
  | PingMessage
  | ScoreBatchMessage
  | PriorityUpdateMessage
  | GeminiPromptMessage
  | CheckGeminiStatusMessage
  | TriggerDownloadMessage
  | ShowExplanationMessage
  | SettingsChangedMessage
  | FeedbackMessage
  | GetHealthMessage
  | EnsureOffscreenDocumentMessage
  | CloseOffscreenDocumentMessage;

export interface PongPayload {
  readonly type: 'PONG';
  readonly receivedAt: number;
}

export interface ScoreBatchPayload {
  readonly type: 'SCORE_RESULT';
  readonly results: readonly ScoringResult[];
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

export type MessagePayload =
  | PongPayload
  | ScoreBatchPayload
  | GeminiResultPayload
  | GeminiStatusPayload
  | HealthPayload
  | SettingsPayload
  | AckPayload
  | OffscreenLifecyclePayload;

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

export function createRequestId(): string {
  const randomId: string = crypto.randomUUID();
  return randomId;
}

export function createMessage<TMessage extends Omit<BaseMessage, 'requestId'>>(
  message: TMessage,
): TMessage & { readonly requestId: string } {
  const signalLensMessage: TMessage & { readonly requestId: string } = {
    ...message,
    requestId: createRequestId(),
  };

  return signalLensMessage;
}

export function createSuccessResponse(
  requestId: string,
  payload: MessagePayload,
): MessageResponse {
  const response: MessageResponse = {
    ok: true,
    requestId,
    payload,
  };

  return response;
}

export function createErrorResponse(
  requestId: string | null,
  code: string,
  message: string,
): MessageResponse {
  const response: MessageResponse = {
    ok: false,
    requestId,
    error: {
      code,
      message,
    },
  };

  return response;
}

export function isHumanSignalMessage(value: unknown): value is HumanSignalMessage {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.type === 'string' &&
    typeof value.requestId === 'string' &&
    isExtensionContext(value.source) &&
    isExtensionContext(value.target) &&
    isKnownMessageType(value.type)
  );
}

export function addMessageListener(
  context: ExtensionContext,
  handler: MessageHandler,
): () => void {
  const listener = (
    rawMessage: unknown,
    sender: Browser.runtime.MessageSender,
    sendResponse: (response: MessageResponse) => void,
  ): boolean => {
    if (!isHumanSignalMessage(rawMessage) || rawMessage.target !== context) {
      return false;
    }

    void handler(rawMessage, sender)
      .then((payload: MessagePayload): void => {
        sendResponse(createSuccessResponse(rawMessage.requestId, payload));
      })
      .catch((error: unknown): void => {
        sendResponse(
          createErrorResponse(
            rawMessage.requestId,
            'HANDLER_FAILED',
            error instanceof Error ? error.message : String(error),
          ),
        );
      });

    return true;
  };

  browser.runtime.onMessage.addListener(listener);

  return (): void => {
    browser.runtime.onMessage.removeListener(listener);
  };
}

export async function sendToBackground(
  message: Omit<HumanSignalMessage, 'requestId' | 'target'>,
): Promise<MessageResponse> {
  const targetedMessage: HumanSignalMessage = createMessage({
    ...message,
    target: 'background',
  }) as HumanSignalMessage;

  return await sendRuntimeMessage(targetedMessage);
}

export async function sendToOffscreen(
  message: Omit<HumanSignalMessage, 'requestId' | 'target'>,
): Promise<MessageResponse> {
  const targetedMessage: HumanSignalMessage = createMessage({
    ...message,
    target: 'offscreen',
  }) as HumanSignalMessage;

  return await sendRuntimeMessage(targetedMessage);
}

export async function sendToContentScript(
  tabId: number,
  message: Omit<HumanSignalMessage, 'requestId' | 'target'>,
): Promise<MessageResponse> {
  const targetedMessage: HumanSignalMessage = createMessage({
    ...message,
    target: 'content-script',
  }) as HumanSignalMessage;

  try {
    const response: unknown = await browser.tabs.sendMessage(tabId, targetedMessage);

    if (isMessageResponse(response)) {
      return response;
    }

    return createErrorResponse(targetedMessage.requestId, 'INVALID_RESPONSE', 'Invalid response shape.');
  } catch (error: unknown) {
    return createErrorResponse(
      targetedMessage.requestId,
      'SEND_FAILED',
      error instanceof Error ? error.message : String(error),
    );
  }
}

async function sendRuntimeMessage(message: HumanSignalMessage): Promise<MessageResponse> {
  try {
    const response: unknown = await browser.runtime.sendMessage(message);

    if (isMessageResponse(response)) {
      return response;
    }

    return createErrorResponse(message.requestId, 'INVALID_RESPONSE', 'Invalid response shape.');
  } catch (error: unknown) {
    return createErrorResponse(
      message.requestId,
      'SEND_FAILED',
      error instanceof Error ? error.message : String(error),
    );
  }
}

function isMessageResponse(value: unknown): value is MessageResponse {
  if (!isRecord(value) || typeof value.ok !== 'boolean') {
    return false;
  }

  if (value.ok === true) {
    return typeof value.requestId === 'string' && isRecord(value.payload);
  }

  return (
    (typeof value.requestId === 'string' || value.requestId === null) &&
    isRecord(value.error) &&
    typeof value.error.code === 'string' &&
    typeof value.error.message === 'string'
  );
}

function isKnownMessageType(type: string): boolean {
  const knownTypes: readonly string[] = [
    'PING',
    'SCORE_BATCH',
    'PRIORITY_UPDATE',
    'GEMINI_PROMPT',
    'CHECK_GEMINI_STATUS',
    'TRIGGER_DOWNLOAD',
    'SHOW_EXPLANATION',
    'SETTINGS_CHANGED',
    'FEEDBACK',
    'GET_HEALTH',
    'ENSURE_OFFSCREEN_DOCUMENT',
    'CLOSE_OFFSCREEN_DOCUMENT',
  ];

  return knownTypes.includes(type);
}

function isExtensionContext(value: unknown): value is ExtensionContext {
  const contexts: readonly ExtensionContext[] = [
    'background',
    'content-script',
    'offscreen',
    'popup',
  ];

  return typeof value === 'string' && contexts.includes(value as ExtensionContext);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
