import {
  addMessageListener,
  type MessagePayload,
  type HumanSignalMessage,
} from '@/shared/messaging';
import { logger } from '@/shared/logger';
import { getGeminiStatus } from '@/shared/storage';

logger.info('offscreen.startup', 'HumanSignal offscreen document loaded');

addMessageListener('offscreen', handleOffscreenMessage);

async function handleOffscreenMessage(message: HumanSignalMessage): Promise<MessagePayload> {
  switch (message.type) {
    case 'PING':
      return {
        type: 'PONG',
        receivedAt: Date.now(),
      };

    case 'CHECK_GEMINI_STATUS':
    case 'TRIGGER_DOWNLOAD':
      return {
        type: 'MODEL_STATUS',
        status: await getGeminiStatus(),
      };

    case 'GEMINI_PROMPT':
      return {
        type: 'GEMINI_RESULT',
        result: null,
        status: await getGeminiStatus(),
      };

    case 'SCORE_BATCH':
    case 'PRIORITY_UPDATE':
    case 'SHOW_EXPLANATION':
    case 'SETTINGS_CHANGED':
    case 'FEEDBACK':
    case 'GET_HEALTH':
    case 'ENSURE_OFFSCREEN_DOCUMENT':
    case 'CLOSE_OFFSCREEN_DOCUMENT':
      return {
        type: 'ACK',
      };
  }
}
