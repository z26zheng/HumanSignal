import { logger } from '@/shared/logger';

import type { ExtensionContext } from '@/shared/types';
import type {
  BaseMessage,
  HumanSignalMessage,
  MessageHandler,
  MessagePayload,
  MessageResponse,
} from '@/shared/message-types';

export type {
  BaseMessage,
  HumanSignalMessage,
  MessageError,
  MessageHandler,
  MessagePayload,
  MessageResponse,
} from '@/shared/message-types';

type OutboundMessage = DistributiveOmit<HumanSignalMessage, 'requestId' | 'target'>;

type DistributiveOmit<TValue, TKeys extends PropertyKey> = TValue extends unknown
  ? Omit<TValue, TKeys>
  : never;

const KNOWN_MESSAGE_TYPES: readonly string[] = [
  'PING', 'SCORE_BATCH', 'SCORE_RESULT', 'PRIORITY_UPDATE',
  'GEMINI_PROMPT', 'CHECK_GEMINI_STATUS', 'TRIGGER_DOWNLOAD',
  'SHOW_EXPLANATION', 'SETTINGS_CHANGED', 'FEEDBACK',
  'GET_HEALTH', 'CLEAR_CACHE', 'DELETE_ALL_DATA',
  'ENSURE_OFFSCREEN_DOCUMENT', 'CLOSE_OFFSCREEN_DOCUMENT',
  'DESTROY_GEMINI_SESSION', 'SERVICE_WORKER_ALIVE', 'REDISCOVER_CONTENT',
];

const EXTENSION_CONTEXTS: readonly ExtensionContext[] = [
  'background', 'content-script', 'offscreen', 'popup',
];

export function createRequestId(): string {
  return crypto.randomUUID();
}

export function createMessage<TMessage extends Omit<BaseMessage, 'requestId'>>(
  message: TMessage,
): TMessage & { readonly requestId: string } {
  return { ...message, requestId: createRequestId() };
}

export function createSuccessResponse(
  requestId: string,
  payload: MessagePayload,
): MessageResponse {
  return { ok: true, requestId, payload };
}

export function createErrorResponse(
  requestId: string | null,
  code: string,
  message: string,
): MessageResponse {
  return { ok: false, requestId, error: { code, message } };
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
        logger.error('messaging.handler', error, {
          messageType: rawMessage.type,
          source: rawMessage.source,
          target: rawMessage.target,
        });
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
  message: OutboundMessage,
): Promise<MessageResponse> {
  const targetedMessage: HumanSignalMessage = createMessage({
    ...message,
    target: 'background',
  }) as HumanSignalMessage;

  return await sendRuntimeMessage(targetedMessage);
}

export async function sendToOffscreen(
  message: OutboundMessage,
): Promise<MessageResponse> {
  const targetedMessage: HumanSignalMessage = createMessage({
    ...message,
    target: 'offscreen',
  }) as HumanSignalMessage;

  return await sendRuntimeMessage(targetedMessage);
}

export async function sendToContentScript(
  tabId: number,
  message: OutboundMessage,
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

    logger.warn('messaging.content.invalidResponse', 'Content script returned invalid response', {
      messageType: targetedMessage.type,
      tabId,
    });
    return createErrorResponse(targetedMessage.requestId, 'INVALID_RESPONSE', 'Invalid response shape.');
  } catch (error: unknown) {
    logger.error('messaging.content.send', error, {
      messageType: targetedMessage.type,
      tabId,
    });
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

    logger.warn('messaging.runtime.invalidResponse', 'Runtime message returned invalid response', {
      messageType: message.type,
      source: message.source,
      target: message.target,
    });
    return createErrorResponse(message.requestId, 'INVALID_RESPONSE', 'Invalid response shape.');
  } catch (error: unknown) {
    logger.error('messaging.runtime.send', error, {
      messageType: message.type,
      source: message.source,
      target: message.target,
    });
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
  return KNOWN_MESSAGE_TYPES.includes(type);
}

function isExtensionContext(value: unknown): value is ExtensionContext {
  return typeof value === 'string' && EXTENSION_CONTEXTS.includes(value as ExtensionContext);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
