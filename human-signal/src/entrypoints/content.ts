import {
  addMessageListener,
  sendToBackground,
  type MessagePayload,
  type HumanSignalMessage,
} from '@/shared/messaging';
import { OverlayController } from '@/overlay/overlay-controller';
import { logger } from '@/shared/logger';

const overlayController: OverlayController = new OverlayController();

export default defineContentScript({
  matches: ['https://www.linkedin.com/*'],
  main(): void {
    logger.info('content.startup', 'HumanSignal content script loaded');

    addMessageListener('content-script', handleContentMessage);
    void overlayController.start().catch((error: unknown): void => {
      logger.error('content.overlay.start', error);
    });

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
    case 'FEEDBACK':
    case 'PRIORITY_UPDATE':
    case 'SCORE_BATCH':
    case 'GEMINI_PROMPT':
    case 'CHECK_GEMINI_STATUS':
    case 'TRIGGER_DOWNLOAD':
    case 'GET_HEALTH':
    case 'CLEAR_CACHE':
    case 'DELETE_ALL_DATA':
    case 'ENSURE_OFFSCREEN_DOCUMENT':
    case 'CLOSE_OFFSCREEN_DOCUMENT':
    case 'DESTROY_GEMINI_SESSION':
      return {
        type: 'ACK',
      };

    case 'SETTINGS_CHANGED':
      await overlayController.applySettings(message.settings);
      return {
        type: 'ACK',
      };

    case 'SCORE_RESULT':
      overlayController.handleScoreResults(message.results);
      return {
        type: 'ACK',
      };
  }
}
