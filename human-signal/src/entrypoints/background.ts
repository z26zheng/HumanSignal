import {
  addMessageListener,
  sendToContentScript,
  sendToOffscreen,
  type MessagePayload,
  type MessageResponse,
  type HumanSignalMessage,
} from '@/shared/messaging';
import { getLogEntries, logger } from '@/shared/logger';
import {
  addFeedbackEntry,
  clearAllStoredData,
  getGeminiStatus,
  getUserSettings,
  setUserSettings,
} from '@/shared/storage';
import { ScoringCoordinator } from '@/scoring-coordinator';
import type { ItemId } from '@/shared/types';

const OFFSCREEN_DOCUMENT_PATH: '/offscreen.html' = '/offscreen.html';
const scoringCoordinator: ScoringCoordinator = new ScoringCoordinator();

export default defineBackground((): void => {
  logger.info('background.startup', 'HumanSignal background service worker started', {
    extensionId: browser.runtime.id,
  });

  addMessageListener('background', handleBackgroundMessage);
  void scoringCoordinator.initialize();

  browser.runtime.onInstalled.addListener((details: Browser.runtime.InstalledDetails): void => {
    logger.info('background.installed', 'Extension install event received', {
      reason: details.reason,
    });
  });
});

async function handleBackgroundMessage(
  message: HumanSignalMessage,
  sender: Browser.runtime.MessageSender,
): Promise<MessagePayload> {
  switch (message.type) {
    case 'PING':
      return {
        type: 'PONG',
        receivedAt: Date.now(),
      };

    case 'GET_HEALTH':
      return {
        type: 'HEALTH_RESULT',
        health: await scoringCoordinator.getHealth(getLogEntries().length, 0),
      };

    case 'SETTINGS_CHANGED':
      await relaySettingsToActiveTab(message);
      return {
        type: 'SETTINGS_RESULT',
        settings: await setUserSettings(message.settings),
      };

    case 'CHECK_GEMINI_STATUS':
    case 'TRIGGER_DOWNLOAD':
      return await forwardToOffscreen(message);

    case 'SCORE_BATCH':
      const tabId: number | null = sender.tab?.id ?? null;
      const scoreBatchResult = await scoringCoordinator.handleScoreBatch(message.items, tabId);

      return {
        type: 'SCORE_RESULT',
        results: scoreBatchResult.results,
        queued: scoreBatchResult.queued,
      };

    case 'PRIORITY_UPDATE':
      scoringCoordinator.handlePriorityUpdates(message.updates);
      return {
        type: 'ACK',
      };

    case 'SHOW_EXPLANATION':
    case 'SCORE_RESULT':
      return {
        type: 'ACK',
      };

    case 'FEEDBACK':
      await addFeedbackEntry({
        itemId: message.itemId as ItemId,
        feedback: message.feedback,
        label: message.label,
        source: message.scoringSource,
        createdAt: Date.now(),
      });
      return {
        type: 'ACK',
      };

    case 'CLEAR_CACHE':
      await scoringCoordinator.clearCache();
      return {
        type: 'ACK',
      };

    case 'DELETE_ALL_DATA':
      await scoringCoordinator.clearCache();
      await clearAllStoredData();
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
      return await forwardToOffscreen(message);

    case 'DESTROY_GEMINI_SESSION':
      return await forwardToOffscreen(message);
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

async function forwardToOffscreen(message: HumanSignalMessage): Promise<MessagePayload> {
  const isAvailable: boolean = await ensureOffscreenDocument();

  if (!isAvailable) {
    return {
      type: 'MODEL_STATUS',
      status: await getGeminiStatus(),
    };
  }

  const response: MessageResponse = await sendToOffscreen({
    ...message,
    source: 'background',
  });

  if (response.ok) {
    if (response.payload.type === 'MODEL_STATUS' || response.payload.type === 'GEMINI_RESULT') {
      scoringCoordinator.onGeminiStatus(response.payload.status);
    }

    return response.payload;
  }

  logger.warn('background.offscreen.forward', 'Offscreen message failed', {
    code: response.error.code,
    message: response.error.message,
  });

  return {
    type: 'MODEL_STATUS',
    status: await getGeminiStatus(),
  };
}

async function relaySettingsToActiveTab(message: HumanSignalMessage): Promise<void> {
  if (message.type !== 'SETTINGS_CHANGED') {
    return;
  }

  const tabs: Browser.tabs.Tab[] = await browser.tabs.query({
    active: true,
    currentWindow: true,
    url: 'https://www.linkedin.com/*',
  });
  const tabId: number | undefined = tabs[0]?.id;

  if (tabId === undefined) {
    return;
  }

  await sendToContentScript(tabId, {
    type: 'SETTINGS_CHANGED',
    source: 'background',
    settings: message.settings,
  });
}
