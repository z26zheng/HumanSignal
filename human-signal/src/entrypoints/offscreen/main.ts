import {
  addMessageListener,
  type MessagePayload,
  type HumanSignalMessage,
} from '@/shared/messaging';
import { GeminiService } from '@/gemini';
import { logger } from '@/shared/logger';

logger.info('offscreen.startup', 'HumanSignal offscreen document loaded');

const geminiService: GeminiService = new GeminiService();

addMessageListener('offscreen', handleOffscreenMessage);

async function handleOffscreenMessage(message: HumanSignalMessage): Promise<MessagePayload> {
  switch (message.type) {
    case 'PING':
      return {
        type: 'PONG',
        receivedAt: Date.now(),
      };

    case 'CHECK_GEMINI_STATUS':
      return {
        type: 'MODEL_STATUS',
        status: await geminiService.checkGeminiAvailability(),
      };

    case 'TRIGGER_DOWNLOAD':
      return {
        type: 'MODEL_STATUS',
        status: await geminiService.triggerModelDownload(),
      };

    case 'GEMINI_PROMPT':
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
      return {
        type: 'ACK',
      };
  }
}
