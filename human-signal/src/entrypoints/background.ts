import {
  addMessageListener,
  sendToContentScript,
  sendToOffscreen,
  type MessagePayload,
  type MessageResponse,
  type HumanSignalMessage,
} from '@/shared/messaging';
import { getLogEntries, logger, type LogEntry } from '@/shared/logger';
import type { DebugLogEntry } from '@/shared/message-types';
import {
  addFeedbackEntry,
  clearAllStoredData,
  getGeminiStatus,
  readStorageValue,
  writeStorageValue,
  setUserSettings,
} from '@/shared/storage';
import { ScoringCoordinator } from '@/scoring-coordinator';
import { closeOffscreenDocument, ensureOffscreenDocument } from '@/background/offscreen-lifecycle';
import {
  createE2EGeminiDownloadResponse,
  createE2EGeminiStatusResponse,
} from '@/gemini/e2e-gemini-mock';
import { DEFAULT_E2E_GEMINI_MOCK_CONFIG, DEFAULT_USER_SETTINGS } from '@/shared/types';
import type { E2EGeminiMockConfig, GeminiStatus, HealthMetrics, ItemId } from '@/shared/types';

const scoringCoordinator: ScoringCoordinator = new ScoringCoordinator();

export default defineBackground((): void => {
  scoringCoordinator.setEnsureOffscreen(ensureOffscreenDocument);
  logger.info('background.startup', 'HumanSignal background service worker started', {
    extensionId: browser.runtime.id,
  });

  addMessageListener('background', handleBackgroundMessage);
  void checkTmrOnStartup();

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
      if ('isDeveloperMode' in message.settings) {
        await writeStorageValue('devModeExplicitlySet', true);
      }
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
        queued: [],
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

    case 'OPEN_POPUP':
      try {
        await browser.action.openPopup();
      } catch {
        logger.warn('background.popup', 'Unable to open popup programmatically');
      }
      return {
        type: 'ACK',
      };

    case 'GET_TELEMETRY': {
      const summary = scoringCoordinator.getTelemetrySummary();
      logger.info('background.telemetry', 'Telemetry requested', {
        entryCount: summary.entries.length,
        mode: summary.mode,
      });
      return {
        type: 'TELEMETRY_RESULT',
        entries: summary.entries,
        mode: summary.mode,
        itemsScored: summary.itemsScored,
      };
    }

    case 'GET_DEBUG_STATE': {
      const debugHealth: HealthMetrics = await scoringCoordinator.getHealth(getLogEntries().length, 0);
      const debugGeminiStatus: GeminiStatus = await getGeminiStatus();
      const recentLogs: readonly DebugLogEntry[] = getLogEntries()
        .slice(-50)
        .map((e: LogEntry): DebugLogEntry => ({
          timestamp: e.timestamp,
          level: e.level === 'warn' || e.level === 'error' ? e.level : 'info',
          context: e.context,
          message: e.message,
          data: (e.data ?? {}) as Record<string, unknown>,
        }));
      return {
        type: 'DEBUG_STATE_RESULT',
        health: debugHealth,
        geminiAvailability: debugGeminiStatus.availability,
        scoringMode: 'rules',
        recentLogs,
      };
    }

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

    case 'TMR_CLASSIFY':
    case 'TMR_STATUS':
    case 'TMR_LOAD_MODEL':
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

async function forwardToOffscreen(message: HumanSignalMessage): Promise<MessagePayload> {
  const mockPayload: MessagePayload | null = await handleE2EGeminiMockInBackground(message);

  if (mockPayload !== null) {
    return mockPayload;
  }

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
    if (response.payload.type === 'TMR_STATUS_RESULT') {
      scoringCoordinator.setTmrAvailable(response.payload.isLoaded);
    }

    if (response.payload.type === 'TMR_CLASSIFY_RESULT') {
      scoringCoordinator.setTmrAvailable(true);
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
    url: 'https://www.linkedin.com/*',
  });

  for (const tab of tabs) {
    if (tab.id !== undefined) {
      await sendToContentScript(tab.id, {
        type: 'SETTINGS_CHANGED',
        source: 'background',
        settings: message.settings,
      });
    }
  }
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

const TMR_POLL_INTERVAL_MS: number = 2000;
const TMR_MAX_POLL_ATTEMPTS: number = 30;

async function checkTmrOnStartup(): Promise<void> {
  try {

    for (let attempt: number = 0; attempt < TMR_MAX_POLL_ATTEMPTS; attempt++) {
      const tmrPayload: MessagePayload = await forwardToOffscreen({
        type: 'TMR_STATUS',
        requestId: '',
        source: 'background',
        target: 'offscreen',
      } as HumanSignalMessage);

      if (tmrPayload.type === 'TMR_STATUS_RESULT' && tmrPayload.isLoaded) {
        scoringCoordinator.setTmrAvailable(true);
        logger.info('background.startup', 'TMR model ready', { attempt });
        void rescoreActiveTabsWithTmr();
        return;
      }

      if (tmrPayload.type === 'TMR_STATUS_RESULT' && tmrPayload.errorMessage !== null) {
        logger.warn('background.startup', 'TMR model failed to load', {
          error: tmrPayload.errorMessage,
        });
        return;
      }

      await new Promise<void>((resolve: () => void): void => {
        setTimeout(resolve, TMR_POLL_INTERVAL_MS);
      });
    }

    logger.warn('background.startup', 'TMR model did not load within polling window');
  } catch (error: unknown) {
    logger.error('background.startup.tmr', error);
  }
}

async function rescoreActiveTabsWithTmr(): Promise<void> {
  const tabs: Browser.tabs.Tab[] = await browser.tabs.query({
    url: 'https://www.linkedin.com/*',
  });

  for (const tab of tabs) {
    if (tab.id !== undefined) {
      await sendToContentScript(tab.id, {
        type: 'REDISCOVER_CONTENT',
        source: 'background',
      });
    }
  }

  logger.info('background.tmr', 'Triggered re-score on LinkedIn tabs after TMR ready', {
    tabCount: tabs.length,
  });
}


