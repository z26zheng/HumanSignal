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
  readStorageValue,
  writeStorageValue,
  setUserSettings,
} from '@/shared/storage';
import { ScoringCoordinator } from '@/scoring-coordinator';
import { GeminiService } from '@/gemini';
import { closeOffscreenDocument, ensureOffscreenDocument } from '@/background/offscreen-lifecycle';
import {
  createE2EGeminiDownloadResponse,
  createE2EGeminiStatusResponse,
} from '@/gemini/e2e-gemini-mock';
import { DEFAULT_E2E_GEMINI_MOCK_CONFIG, DEFAULT_USER_SETTINGS } from '@/shared/types';
import type { LogDataValue } from '@/shared/logger';
import type { ContentHash, E2EGeminiMockConfig, ItemId } from '@/shared/types';

const scoringCoordinator: ScoringCoordinator = new ScoringCoordinator();
const geminiService: GeminiService = new GeminiService();

export default defineBackground((): void => {
  logger.info('background.startup', 'HumanSignal background service worker started', {
    extensionId: browser.runtime.id,
  });

  addMessageListener('background', handleBackgroundMessage);
  void scoringCoordinator.initialize().then(async (): Promise<void> => {
    const testResults: Record<string, unknown> = { startedAt: Date.now() };

    try {
      const statusPayload = await forwardToOffscreen({
        type: 'CHECK_GEMINI_STATUS',
        requestId: '',
        source: 'background',
        target: 'offscreen',
      } as HumanSignalMessage);

      testResults['checkStatus'] = { ok: true, type: statusPayload.type };

      if (statusPayload.type === 'MODEL_STATUS') {
        scoringCoordinator.onGeminiStatus(statusPayload.status);
        testResults['availability'] = statusPayload.status.availability;
        testResults['mode'] = scoringCoordinator.getMode();

        logger.info('background.startup', 'Gemini status checked on startup', {
          availability: statusPayload.status.availability,
          mode: scoringCoordinator.getMode(),
        });

        if (statusPayload.status.availability === 'available') {
          const promptPayload = await forwardToOffscreen({
            type: 'GEMINI_PROMPT',
            requestId: '',
            source: 'background',
            target: 'offscreen',
            item: {
              itemId: 'startup-test' as ItemId,
              itemType: 'post',
              text: 'I shipped a rollout in April and reduced failures by 27%.',
              metadata: { contentHash: 'hash_startuptest' as ContentHash, sourceUrl: null, detectedAt: Date.now(), idStability: 'content-hash' },
              isTruncated: false,
            },
          } as HumanSignalMessage);

          testResults['promptResponse'] = {
            ok: true,
            type: promptPayload.type,
            hasResult: promptPayload.type === 'GEMINI_RESULT' && promptPayload.result !== null,
            label: promptPayload.type === 'GEMINI_RESULT' ? promptPayload.result?.label : null,
            source: promptPayload.type === 'GEMINI_RESULT' ? promptPayload.result?.source : null,
          };
        }
      }
    } catch (error: unknown) {
      testResults['error'] = error instanceof Error ? error.message : String(error);
    }

    testResults['completedAt'] = Date.now();
    testResults['elapsedMs'] = (testResults['completedAt'] as number) - (testResults['startedAt'] as number);
    await browser.storage.local.set({ geminiIntegrationTest: testResults });
    logger.info('background.startup', 'Gemini integration test completed', testResults as Record<string, LogDataValue>);
  }).catch((): void => {});

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
      logger.info('background.settings', 'Settings changed', {
        keys: Object.keys(message.settings),
      });
      return {
        type: 'SETTINGS_RESULT',
        settings: await setUserSettings(message.settings),
      };

    case 'CHECK_GEMINI_STATUS':
    case 'TRIGGER_DOWNLOAD':
      return await forwardToOffscreen(message);

    case 'SCORE_BATCH':
      const tabId: number | null = sender.tab?.id ?? null;
      if (await shouldFailScoreBatchForE2E()) {
        logger.warn('background.scoring', 'E2E score batch failure injected', {
          itemCount: message.items.length,
        });
        throw new Error('E2E injected SCORE_BATCH failure.');
      }
      logger.info('background.scoring', 'Score batch received', {
        itemCount: message.items.length,
        tabId: tabId ?? -1,
      });
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

    case 'SERVICE_WORKER_ALIVE':
      await relayServiceWorkerAliveToLinkedInTabs();
      return {
        type: 'ACK',
      };

    case 'REDISCOVER_CONTENT':
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
      logger.info('background.feedback', 'Feedback saved', {
        feedback: message.feedback,
        label: message.label,
        source: message.scoringSource,
      });
      return {
        type: 'ACK',
      };

    case 'CLEAR_CACHE':
      await scoringCoordinator.clearCache();
      logger.info('background.cache', 'Score cache cleared from message');
      return {
        type: 'ACK',
      };

    case 'DELETE_ALL_DATA':
      await scoringCoordinator.clearCache();
      await clearAllStoredData();
      await relaySettingsToActiveTab({
        ...message,
        type: 'SETTINGS_CHANGED',
        settings: DEFAULT_USER_SETTINGS,
      });
      logger.info('background.data', 'All extension data deleted');
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

async function shouldFailScoreBatchForE2E(): Promise<boolean> {
  const shouldFail: boolean = await readStorageValue('e2eFailNextScoreBatch', false);

  if (!shouldFail) {
    return false;
  }

  await writeStorageValue('e2eFailNextScoreBatch', false);
  return true;
}

void getUserSettings();

async function forwardToOffscreen(message: HumanSignalMessage): Promise<MessagePayload> {
  const mockPayload: MessagePayload | null = await handleE2EGeminiMockInBackground(message);

  if (mockPayload !== null) {
    if (mockPayload.type === 'MODEL_STATUS' || mockPayload.type === 'GEMINI_RESULT') {
      scoringCoordinator.onGeminiStatus(mockPayload.status);
    }

    return mockPayload;
  }

  const isAvailable: boolean = await ensureOffscreenDocument();

  if (!isAvailable) {
    const status = await getGeminiStatus();
    scoringCoordinator.onGeminiStatus(status);
    return {
      type: 'MODEL_STATUS',
      status,
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

async function handleE2EGeminiMockInBackground(message: HumanSignalMessage): Promise<MessagePayload | null> {
  const config: E2EGeminiMockConfig = await readStorageValue('e2eGeminiMock', DEFAULT_E2E_GEMINI_MOCK_CONFIG);

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

    default:
      return null;
  }
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

async function relayServiceWorkerAliveToLinkedInTabs(): Promise<void> {
  const tabs: Browser.tabs.Tab[] = await browser.tabs.query({
    url: 'https://www.linkedin.com/*',
  });

  logger.info('background.lifecycle', 'Relaying service worker alive message', {
    tabCount: tabs.length,
  });

  for (const tab of tabs) {
    if (tab.id === undefined) {
      continue;
    }

    await sendToContentScript(tab.id, {
      type: 'SERVICE_WORKER_ALIVE',
      source: 'background',
    });
  }
}
