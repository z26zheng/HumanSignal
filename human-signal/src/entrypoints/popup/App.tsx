import { useEffect, useState } from 'preact/hooks';
import type { JSX } from 'preact';

import { sendToBackground } from '@/shared/messaging';
import { logger } from '@/shared/logger';
import { getGeminiStatus, getUserSettings } from '@/shared/storage';
import { DEFAULT_GEMINI_STATUS, DEFAULT_USER_SETTINGS } from '@/shared/types';

import type { GeminiStatus, HealthMetrics, StrictnessLevel, UserSettings, StickerVisibility } from '@/shared/types';

export function App(): JSX.Element {
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_USER_SETTINGS);
  const [geminiStatus, setGeminiStatusState] = useState<GeminiStatus>(DEFAULT_GEMINI_STATUS);
  const [health, setHealth] = useState<HealthMetrics | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<'checking' | 'connected' | 'unavailable'>('checking');

  useEffect((): (() => void) => {
    let isMounted: boolean = true;

    void loadPopupState().then((state): void => {
      if (!isMounted) {
        return;
      }

      setSettings(state.settings);
      setGeminiStatusState(state.geminiStatus);
      setHealth(state.health);
      setConnectionStatus(state.isConnected ? 'connected' : 'unavailable');
    });

    return (): void => {
      isMounted = false;
    };
  }, []);

  async function updateSettings(nextSettings: Partial<UserSettings>): Promise<void> {
    const mergedSettings: UserSettings = {
      ...settings,
      ...nextSettings,
    };
    setSettings(mergedSettings);
    logger.info('popup.settings', 'Popup settings changed', {
      keys: Object.keys(nextSettings),
    });

    await sendToBackground({
      type: 'SETTINGS_CHANGED',
      source: 'popup',
      settings: nextSettings,
    });
  }

  async function refreshModelStatus(): Promise<void> {
    const response = await sendToBackground({
      type: 'CHECK_GEMINI_STATUS',
      source: 'popup',
    });

    if (response.ok && response.payload.type === 'MODEL_STATUS') {
      setGeminiStatusState(response.payload.status);
      logger.info('popup.model', 'Model status refreshed', {
        availability: response.payload.status.availability,
        progress: response.payload.status.downloadProgress ?? -1,
      });
    }
  }

  async function triggerDownload(): Promise<void> {
    const response = await sendToBackground({
      type: 'TRIGGER_DOWNLOAD',
      source: 'popup',
    });

    if (response.ok && response.payload.type === 'MODEL_STATUS') {
      setGeminiStatusState(response.payload.status);
      logger.info('popup.model', 'Model download triggered', {
        availability: response.payload.status.availability,
        progress: response.payload.status.downloadProgress ?? -1,
      });
    }
  }

  async function clearCache(): Promise<void> {
    await sendToBackground({
      type: 'CLEAR_CACHE',
      source: 'popup',
    });
    logger.info('popup.data', 'Clear cache requested');
    setHealth(await fetchHealth());
  }

  async function deleteAllData(): Promise<void> {
    await sendToBackground({
      type: 'DELETE_ALL_DATA',
      source: 'popup',
    });
    logger.info('popup.data', 'Delete all data requested');
    setSettings(DEFAULT_USER_SETTINGS);
    setGeminiStatusState(DEFAULT_GEMINI_STATUS);
    setHealth(await fetchHealth());
  }

  return (
    <main className="human-signal-popup">
      <section className="hero">
        <p className="eyebrow">HumanSignal</p>
        <h1>LinkedIn signal intelligence</h1>
        <p className="description">Signal Stickers classify visible LinkedIn posts and comments locally.</p>
      </section>

      <section className="status-card" aria-label="Extension status">
        <span className={`status-dot status-dot--${connectionStatus}`} aria-hidden="true" />
        <div>
          <p className="status-label">Background service worker</p>
          <p className="status-value">{formatConnectionStatus(connectionStatus)}</p>
        </div>
      </section>

      <section className="panel">
        <h2>Settings</h2>
        <label>
          Signal Stickers
          <select
            value={settings.stickerVisibility}
            onChange={(event): void => {
              void updateSettings({
                stickerVisibility: event.currentTarget.value as StickerVisibility,
                isEnabled: event.currentTarget.value !== 'off',
              });
            }}
          >
            <option value="all">All</option>
            <option value="posts">Posts</option>
            <option value="comments">Comments</option>
            <option value="off">Off</option>
          </select>
        </label>
        <label>
          Strictness
          <select
            value={settings.strictness}
            onChange={(event): void => {
              void updateSettings({ strictness: event.currentTarget.value as StrictnessLevel });
            }}
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        </label>
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={settings.weeklySummaryEnabled}
            onChange={(event): void => {
              void updateSettings({ weeklySummaryEnabled: event.currentTarget.checked });
            }}
          />
          Weekly summary
        </label>
      </section>

      <section className="panel">
        <h2>On-Device AI</h2>
        <p className="status-value">{formatGeminiStatus(geminiStatus)}</p>
        {geminiStatus.availability === 'downloading' ? (
          <progress value={geminiStatus.downloadProgress ?? 0} max={100} />
        ) : null}
        <div className="button-row">
          <button type="button" onClick={(): void => void refreshModelStatus()}>
            Refresh
          </button>
          {geminiStatus.availability === 'downloadable' || geminiStatus.availability === 'error' ? (
            <button type="button" onClick={(): void => void triggerDownload()}>
              Enable On-Device AI
            </button>
          ) : null}
        </div>
        <p className="muted">Chrome manages the model download. It may require about 2GB of free space.</p>
      </section>

      <section className="panel">
        <h2>Data & Diagnostics</h2>
        {health === null ? (
          <p className="muted">No scoring data yet. Browse LinkedIn to start.</p>
        ) : (
          <dl className="diagnostics">
            <dt>Mode</dt>
            <dd>{health.scoringMode}</dd>
            <dt>Items scored</dt>
            <dd>{health.itemsScored}</dd>
            <dt>Cache</dt>
            <dd>{health.cacheEntries} items</dd>
            <dt>Queue</dt>
            <dd>{health.queueDepth}</dd>
            <dt>Failures</dt>
            <dd>{health.failureCount}</dd>
          </dl>
        )}
        <div className="button-row">
          <button type="button" onClick={(): void => void clearCache()}>
            Clear cache
          </button>
          <button type="button" className="danger" onClick={(): void => void deleteAllData()}>
            Delete all data
          </button>
        </div>
      </section>
    </main>
  );
}

interface PopupState {
  readonly settings: UserSettings;
  readonly geminiStatus: GeminiStatus;
  readonly health: HealthMetrics | null;
  readonly isConnected: boolean;
}

async function loadPopupState(): Promise<PopupState> {
  const [settings, geminiStatus, pingResponse, health] = await Promise.all([
    getUserSettings(),
    getGeminiStatus(),
    sendToBackground({ type: 'PING', source: 'popup' }),
    fetchHealth(),
  ]);

  return {
    settings,
    geminiStatus,
    health,
    isConnected: pingResponse.ok,
  };
}

async function fetchHealth(): Promise<HealthMetrics | null> {
  const response = await sendToBackground({
    type: 'GET_HEALTH',
    source: 'popup',
  });

  return response.ok && response.payload.type === 'HEALTH_RESULT' ? response.payload.health : null;
}

function formatConnectionStatus(status: 'checking' | 'connected' | 'unavailable'): string {
  switch (status) {
    case 'checking':
      return 'Checking...';
    case 'connected':
      return 'Connected';
    case 'unavailable':
      return 'Unavailable';
  }
}

function formatGeminiStatus(status: GeminiStatus): string {
  switch (status.availability) {
    case 'available':
      return 'Active';
    case 'downloadable':
      return 'Not enabled';
    case 'downloading':
      return `Downloading ${status.downloadProgress ?? 0}%`;
    case 'unavailable':
      return 'Not available';
    case 'error':
      return status.errorMessage ?? 'Error';
  }
}
