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
import { TmrService } from '@/tmr';
import { logger } from '@/shared/logger';
import { readStorageValue } from '@/shared/storage';
import { DEFAULT_E2E_GEMINI_MOCK_CONFIG } from '@/shared/types';

import type { E2EGeminiMockConfig } from '@/shared/types';

logger.info('offscreen.startup', 'HumanSignal offscreen document loaded');

let geminiService: GeminiService | null = null;
const tmrService: TmrService = new TmrService();

void tmrService.initialize().then((): void => {
  const status = tmrService.getStatus();
  logger.info('offscreen.tmrInit', 'TMR model initialized eagerly', {
    isLoaded: status.isLoaded,
    errorMessage: status.errorMessage ?? 'none',
  });
}).catch((): void => {
  logger.warn('offscreen.tmrInit', 'TMR eager initialization failed');
});

function getGemini(): GeminiService {
  if (geminiService === null) {
    geminiService = new GeminiService();
  }
  return geminiService;
}

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
      return {
        type: 'MODEL_STATUS',
        status: await getGemini().checkGeminiAvailability(),
      };

    case 'TRIGGER_DOWNLOAD':
      logger.info('offscreen.gemini', 'Triggering Gemini download');
      return {
        type: 'MODEL_STATUS',
        status: await getGemini().triggerModelDownload(),
      };

    case 'GEMINI_PROMPT':
      logger.info('offscreen.gemini', 'Scoring item with Gemini', {
        itemType: message.item.itemType,
        contentHash: message.item.metadata.contentHash,
        isTruncated: message.item.isTruncated,
      });
      return {
        type: 'GEMINI_RESULT',
        result: await getGemini().scoreWithGemini(message.item),
        status: await getGemini().checkGeminiAvailability(),
      };

    case 'DESTROY_GEMINI_SESSION':
      if (geminiService !== null) {
        await geminiService.destroySession();
      }
      return {
        type: 'ACK',
      };

    case 'TMR_CLASSIFY': {
      const tmrResult = await tmrService.classify(message.text);
      return {
        type: 'TMR_CLASSIFY_RESULT',
        itemId: message.itemId,
        aiProbability: tmrResult.aiProbability,
        latencyMs: tmrResult.latencyMs,
      };
    }

    case 'TMR_STATUS':
      return {
        type: 'TMR_STATUS_RESULT',
        ...tmrService.getStatus(),
      };

    case 'TMR_LOAD_MODEL': {
      const tmrStatus = await tmrService.initialize();
      return {
        type: 'TMR_STATUS_RESULT',
        ...tmrStatus,
      };
    }

    default:
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
