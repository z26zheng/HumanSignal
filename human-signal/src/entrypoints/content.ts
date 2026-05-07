import {
  addMessageListener,
  sendToBackground,
  type MessagePayload,
  type HumanSignalMessage,
} from '@/shared/messaging';
import { logger } from '@/shared/logger';

export default defineContentScript({
  matches: ['https://www.linkedin.com/*'],
  main(): void {
    logger.info('content.startup', 'HumanSignal content script loaded');

    addMessageListener('content-script', handleContentMessage);

    void sendToBackground({
      type: 'PING',
      source: 'content-script',
    }).then((response): void => {
      logger.info('content.messaging', 'Background ping completed', {
        ok: response.ok,
      });
    });
  },
});

async function handleContentMessage(message: HumanSignalMessage): Promise<MessagePayload> {
  switch (message.type) {
    case 'PING':
      return {
        type: 'PONG',
        receivedAt: Date.now(),
      };

    case 'SHOW_EXPLANATION':
    case 'SETTINGS_CHANGED':
    case 'FEEDBACK':
    case 'PRIORITY_UPDATE':
    case 'SCORE_BATCH':
    case 'GEMINI_PROMPT':
    case 'CHECK_GEMINI_STATUS':
    case 'TRIGGER_DOWNLOAD':
    case 'GET_HEALTH':
    case 'ENSURE_OFFSCREEN_DOCUMENT':
    case 'CLOSE_OFFSCREEN_DOCUMENT':
      return {
        type: 'ACK',
      };
  }
}
