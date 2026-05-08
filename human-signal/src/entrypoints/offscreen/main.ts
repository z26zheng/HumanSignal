import {
  addMessageListener,
  type MessagePayload,
  type HumanSignalMessage,
} from '@/shared/messaging';
import { GeminiService } from '@/gemini';
import {
  createE2EGeminiDownloadResponse,
  createE2EGeminiMockStatus,
  createE2EGeminiScoringResult,
  createE2EGeminiStatusResponse,
} from '@/gemini/e2e-gemini-mock';
import { logger } from '@/shared/logger';
import { readStorageValue } from '@/shared/storage';
import { DEFAULT_E2E_GEMINI_MOCK_CONFIG } from '@/shared/types';

import type { E2EGeminiMockConfig } from '@/shared/types';

logger.info('offscreen.startup', 'HumanSignal offscreen document loaded');

const geminiService: GeminiService = new GeminiService();

addMessageListener('offscreen', handleOffscreenMessage);

async function handleOffscreenMessage(message: HumanSignalMessage): Promise<MessagePayload> {
  const mockResponse: MessagePayload | null = await handleMockGeminiMessage(message);

  if (mockResponse !== null) {
    return mockResponse;
  }

  switch (message.type) {
    case 'PING':
      return {
        type: 'PONG',
        receivedAt: Date.now(),
      };

    case 'CHECK_GEMINI_STATUS':
      logger.info('offscreen.gemini', 'Checking Gemini status');
      return {
        type: 'MODEL_STATUS',
        status: await geminiService.checkGeminiAvailability(),
      };

    case 'TRIGGER_DOWNLOAD':
      logger.info('offscreen.gemini', 'Triggering Gemini download');
      return {
        type: 'MODEL_STATUS',
        status: await geminiService.triggerModelDownload(),
      };

    case 'GEMINI_PROMPT':
      logger.info('offscreen.gemini', 'Scoring item with Gemini', {
        itemType: message.item.itemType,
        contentHash: message.item.metadata.contentHash,
        isTruncated: message.item.isTruncated,
      });
      return {
        type: 'GEMINI_RESULT',
        result: await geminiService.scoreWithGemini(message.item),
        status: await geminiService.checkGeminiAvailability(),
      };

    case 'DESTROY_GEMINI_SESSION':
      await geminiService.destroySession();
      return {
        type: 'ACK',
      };

    case 'SCORE_BATCH':
    case 'SCORE_RESULT':
    case 'PRIORITY_UPDATE':
    case 'SHOW_EXPLANATION':
    case 'SETTINGS_CHANGED':
    case 'FEEDBACK':
    case 'GET_HEALTH':
    case 'CLEAR_CACHE':
    case 'DELETE_ALL_DATA':
    case 'ENSURE_OFFSCREEN_DOCUMENT':
    case 'CLOSE_OFFSCREEN_DOCUMENT':
    case 'SERVICE_WORKER_ALIVE':
    case 'REDISCOVER_CONTENT':
      return {
        type: 'ACK',
      };
  }
}

async function handleMockGeminiMessage(message: HumanSignalMessage): Promise<MessagePayload | null> {
  const config: E2EGeminiMockConfig = await readStorageValue(
    'e2eGeminiMock',
    DEFAULT_E2E_GEMINI_MOCK_CONFIG,
  );

  if (!config.isEnabled) {
    return null;
  }

  switch (message.type) {
    case 'CHECK_GEMINI_STATUS':
      return {
        type: 'MODEL_STATUS',
        status: createE2EGeminiStatusResponse(config),
      };

    case 'TRIGGER_DOWNLOAD':
      return {
        type: 'MODEL_STATUS',
        status: createE2EGeminiDownloadResponse(config),
      };

    case 'GEMINI_PROMPT':
      return {
        type: 'GEMINI_RESULT',
        result: createE2EGeminiScoringResult(message.item, config),
        status: createE2EGeminiMockStatus('available', 100),
      };

    default:
      return null;
  }
}
