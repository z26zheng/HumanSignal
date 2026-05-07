import {
  addMessageListener,
  type MessagePayload,
  type HumanSignalMessage,
} from '@/shared/messaging';
import { getLogEntries, logger } from '@/shared/logger';
import { getGeminiStatus, getUserSettings, setUserSettings } from '@/shared/storage';
import { createDefaultHealthMetrics, createUnavailableResult } from '@/shared/types';

const OFFSCREEN_DOCUMENT_PATH: '/offscreen.html' = '/offscreen.html';

export default defineBackground((): void => {
  logger.info('background.startup', 'HumanSignal background service worker started', {
    extensionId: browser.runtime.id,
  });

  addMessageListener('background', handleBackgroundMessage);

  browser.runtime.onInstalled.addListener((details: Browser.runtime.InstalledDetails): void => {
    logger.info('background.installed', 'Extension install event received', {
      reason: details.reason,
    });
  });
});

async function handleBackgroundMessage(message: HumanSignalMessage): Promise<MessagePayload> {
  switch (message.type) {
    case 'PING':
      return {
        type: 'PONG',
        receivedAt: Date.now(),
      };

    case 'GET_HEALTH':
      return {
        type: 'HEALTH_RESULT',
        health: createDefaultHealthMetrics(getLogEntries().length),
      };

    case 'SETTINGS_CHANGED':
      return {
        type: 'SETTINGS_RESULT',
        settings: await setUserSettings(message.settings),
      };

    case 'CHECK_GEMINI_STATUS':
      return {
        type: 'MODEL_STATUS',
        status: await getGeminiStatus(),
      };

    case 'TRIGGER_DOWNLOAD':
      return {
        type: 'MODEL_STATUS',
        status: await getGeminiStatus(),
      };

    case 'SCORE_BATCH':
      return {
        type: 'SCORE_RESULT',
        results: message.items.map(createUnavailableResult),
      };

    case 'PRIORITY_UPDATE':
    case 'SHOW_EXPLANATION':
    case 'FEEDBACK':
      return {
        type: 'ACK',
      };

    case 'ENSURE_OFFSCREEN_DOCUMENT':
      return {
        type: 'OFFSCREEN_DOCUMENT_RESULT',
        isAvailable: await ensureOffscreenDocument(),
      };

    case 'CLOSE_OFFSCREEN_DOCUMENT':
      return {
        type: 'OFFSCREEN_DOCUMENT_RESULT',
        isAvailable: await closeOffscreenDocument(),
      };

    case 'GEMINI_PROMPT':
      return {
        type: 'GEMINI_RESULT',
        result: null,
        status: await getGeminiStatus(),
      };
  }
}

async function ensureOffscreenDocument(): Promise<boolean> {
  try {
    if (await hasOffscreenDocument()) {
      return true;
    }

    await browser.offscreen.createDocument({
      url: browser.runtime.getURL(OFFSCREEN_DOCUMENT_PATH),
      reasons: [browser.offscreen.Reason.LOCAL_STORAGE],
      justification: 'Host on-device AI model sessions for HumanSignal.',
    });

    logger.info('background.offscreen', 'Offscreen document created');
    return true;
  } catch (error: unknown) {
    logger.error('background.offscreen.create', error);
    return false;
  }
}

async function closeOffscreenDocument(): Promise<boolean> {
  try {
    if (!(await hasOffscreenDocument())) {
      return false;
    }

    await browser.offscreen.closeDocument();
    logger.info('background.offscreen', 'Offscreen document closed');
    return false;
  } catch (error: unknown) {
    logger.error('background.offscreen.close', error);
    return await hasOffscreenDocument();
  }
}

async function hasOffscreenDocument(): Promise<boolean> {
  try {
    return await browser.offscreen.hasDocument();
  } catch (error: unknown) {
    logger.warn('background.offscreen.check', 'Unable to inspect offscreen contexts', {
      message: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

void getUserSettings();
