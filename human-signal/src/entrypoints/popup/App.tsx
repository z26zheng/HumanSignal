import { useEffect, useRef, useState } from 'preact/hooks';
import type { JSX } from 'preact';

import { sendToBackground } from '@/shared/messaging';
import { logger } from '@/shared/logger';
import { getGeminiStatus, getUserSettings } from '@/shared/storage';
import { DEFAULT_GEMINI_STATUS, DEFAULT_USER_SETTINGS } from '@/shared/types';
import { getAiAnalysisStatus } from '@/entrypoints/popup/ai-analysis-status';
import type { ScoringTelemetryEntry } from '@/shared/scoring-telemetry';

import type {
  GeminiStatus,
  HealthMetrics,
  ScoringLabel,
  StrictnessLevel,
  StickerVisibility,
  UserSettings,
} from '@/shared/types';


type LabelCounts = Readonly<Record<ScoringLabel, number>>;

const EMPTY_LABEL_COUNTS: LabelCounts = {
  'feels-human': 0,
  'possibly-ai': 0,
  'likely-ai': 0,
  'almost-certainly-ai': 0,
  'cant-tell': 0,
  'unavailable': 0,
};

interface LabelDisplayConfig {
  readonly label: ScoringLabel;
  readonly display: string;
  readonly color: string;
}

const VISIBLE_LABELS: readonly LabelDisplayConfig[] = [
  { label: 'feels-human', display: 'Feels Human', color: '#22c55e' },
  { label: 'possibly-ai', display: 'Possibly AI', color: '#eab308' },
  { label: 'likely-ai', display: 'Likely AI', color: '#f97316' },
  { label: 'almost-certainly-ai', display: 'Almost Certainly AI', color: '#ef4444' },
  { label: 'cant-tell', display: "Can't Tell", color: '#9ca3af' },
];

interface SensitivityOption {
  readonly value: StrictnessLevel;
  readonly display: string;
}

const SENSITIVITY_OPTIONS: readonly SensitivityOption[] = [
  { value: 'low', display: 'Relaxed' },
  { value: 'medium', display: 'Normal' },
  { value: 'high', display: 'Strict' },
];

const DOWNLOAD_POLL_MS: number = 2000;
const DEV_LONG_PRESS_MS: number = 500;

export function App(): JSX.Element {
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_USER_SETTINGS);
  const [geminiStatus, setGeminiStatus] = useState<GeminiStatus>(DEFAULT_GEMINI_STATUS);
  const [health, setHealth] = useState<HealthMetrics | null>(null);
  const [connection, setConnection] = useState<'checking' | 'connected' | 'unavailable'>('checking');
  const [isOnLinkedIn, setIsOnLinkedIn] = useState<boolean>(true);
  const [labelCounts, setLabelCounts] = useState<LabelCounts>(EMPTY_LABEL_COUNTS);
  const [totalScored, setTotalScored] = useState<number>(0);
  const [settingsOpen, setSettingsOpen] = useState<boolean>(false);
  const [privacyOpen, setPrivacyOpen] = useState<boolean>(false);
  const [tmrLoaded, setTmrLoaded] = useState<boolean>(false);
  const [tmrError, setTmrError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<boolean>(false);
  const [devToast, setDevToast] = useState<string | null>(null);

  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect((): (() => void) => {
    let mounted: boolean = true;

    void loadPopupState().then((state): void => {
      if (!mounted) return;
      setSettings(state.settings);
      setGeminiStatus(state.geminiStatus);
      setHealth(state.health);
      setConnection(state.isConnected ? 'connected' : 'unavailable');
      setIsOnLinkedIn(state.isOnLinkedIn);
      setLabelCounts(state.labelCounts);
      setTotalScored(state.totalScored);
      void checkTmrStatus();
    });

    return (): void => {
      mounted = false;
    };
  }, []);

  useEffect((): (() => void) => {
    if (geminiStatus.availability !== 'downloading') {
      return (): void => {};
    }

    const poll = async (): Promise<void> => {
      const response = await sendToBackground({ type: 'CHECK_GEMINI_STATUS', source: 'popup' });
      if (response.ok && response.payload.type === 'MODEL_STATUS') {
        setGeminiStatus(response.payload.status);
      }
    };

    const id: ReturnType<typeof setInterval> = setInterval((): void => {
      void poll();
    }, DOWNLOAD_POLL_MS);

    return (): void => {
      clearInterval(id);
    };
  }, [geminiStatus.availability]);

  async function updateSettings(next: Partial<UserSettings>): Promise<void> {
    setSettings((prev: UserSettings): UserSettings => ({ ...prev, ...next }));
    logger.info('popup.settings', 'Popup settings changed', { keys: Object.keys(next) });
    await sendToBackground({ type: 'SETTINGS_CHANGED', source: 'popup', settings: next });
  }

  function handleToggle(): void {
    const nextEnabled: boolean = !settings.isEnabled;
    void updateSettings({ isEnabled: nextEnabled });
  }

  async function handleTriggerDownload(): Promise<void> {
    const response = await sendToBackground({ type: 'TRIGGER_DOWNLOAD', source: 'popup' });
    if (response.ok && response.payload.type === 'MODEL_STATUS') {
      setGeminiStatus(response.payload.status);
    }
  }

  async function checkTmrStatus(): Promise<void> {
    const response = await sendToBackground({ type: 'TMR_STATUS', source: 'popup' });
    if (response.ok && response.payload.type === 'TMR_STATUS_RESULT') {
      setTmrLoaded(response.payload.isLoaded);
      setTmrError(response.payload.errorMessage);
    }
  }

  async function handleClearCache(): Promise<void> {
    await sendToBackground({ type: 'CLEAR_CACHE', source: 'popup' });
    logger.info('popup.data', 'Clear cache requested');
    setHealth(await fetchHealth());
  }

  async function handleDeleteAll(): Promise<void> {
    await sendToBackground({ type: 'DELETE_ALL_DATA', source: 'popup' });
    logger.info('popup.data', 'Delete all data requested');
    setSettings(DEFAULT_USER_SETTINGS);
    setGeminiStatus(DEFAULT_GEMINI_STATUS);
    setHealth(await fetchHealth());
    setConfirmDelete(false);
  }

  function handleBrandPointerDown(): void {
    longPressTimer.current = setTimeout((): void => {
      const next: boolean = !settings.isDeveloperMode;
      void updateSettings({ isDeveloperMode: next });
      setDevToast(next ? 'Developer mode enabled' : 'Developer mode disabled');
      setTimeout((): void => setDevToast(null), 1500);
    }, DEV_LONG_PRESS_MS);
  }

  function handleBrandPointerUp(): void {
    if (longPressTimer.current !== null) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }

  function brandHeader(showToggle: boolean): JSX.Element {
    return (
      <header className="brand">
        <div
          className="brand-text"
          onPointerDown={handleBrandPointerDown}
          onPointerUp={handleBrandPointerUp}
          onPointerLeave={handleBrandPointerUp}
        >
          <p className="brand-name">HumanSignal</p>
          <p className="brand-tagline">Make LinkedIn feel human again.</p>
        </div>
        {showToggle ? (
          <label className="toggle" aria-label="Enable HumanSignal">
            <input type="checkbox" checked={settings.isEnabled} onChange={handleToggle} />
            <span className="toggle-track" />
          </label>
        ) : null}
      </header>
    );
  }

  function aiAnalysisContent(): JSX.Element {
    const status = getAiAnalysisStatus({
      tmrLoaded,
      tmrError,
      geminiAvailability: geminiStatus.availability,
    });

    return (
      <div className="gemini-section">
        <div className="gemini-headline">
          {status.dot !== null ? <span className={`dot dot--${status.dot}`} /> : null}
          <span className="gemini-headline-text">{status.headline}</span>
        </div>
        {status.showEnhancedExplanationsLink ? (
          <p className="muted">
            <a className="link" onClick={(): void => { void handleTriggerDownload(); }}>
              Enable enhanced explanations
            </a>
          </p>
        ) : null}
        {status.showTryAgain ? (
          <button type="button" className="btn btn--sm" onClick={(): void => { void checkTmrStatus(); }}>
            Try again
          </button>
        ) : null}
      </div>
    );
  }

  if (connection === 'checking') {
    return (
      <main className="popup">
        {brandHeader(false)}
        <p className="state-msg">Scoring posts on this page…</p>
      </main>
    );
  }

  if (!isOnLinkedIn) {
    return (
      <main className="popup">
        {brandHeader(false)}
        <p className="state-msg">Open LinkedIn to start.</p>
      </main>
    );
  }

  if (connection === 'unavailable') {
    return (
      <main className="popup">
        {brandHeader(true)}
        <p className="state-msg">
          HumanSignal is reconnecting. Try refreshing the LinkedIn page.
        </p>
      </main>
    );
  }

  if (!settings.isEnabled) {
    return (
      <main className="popup">
        {brandHeader(true)}
        <p className="state-msg">HumanSignal is paused.</p>
        <section className="panel" style={{ textAlign: 'center' }}>
          <button
            type="button"
            className="btn btn--accent"
            style={{ width: '100%' }}
            onClick={handleToggle}
          >
            Resume scoring
          </button>
          <p className="muted" style={{ marginTop: '8px' }}>Stickers will reappear on LinkedIn posts.</p>
        </section>
      </main>
    );
  }

  return (
    <main className="popup">
      {brandHeader(true)}

      {devToast !== null ? (
        <div className="dev-toast">{devToast}</div>
      ) : null}

      <section className="summary" aria-label="Scoring summary">
        <p className="summary-title">This page: {totalScored} posts scored</p>
        <div className="label-grid">
          {VISIBLE_LABELS.map((cfg: LabelDisplayConfig): JSX.Element => {
            const count: number = labelCounts[cfg.label];
            return (
              <div
                key={cfg.label}
                className={`label-row${count === 0 ? ' label-row--dim' : ''}`}
              >
                <span className="label-dot" style={{ backgroundColor: cfg.color }} />
                <span className="label-name">{cfg.display}</span>
                <span className="label-count">{count}</span>
              </div>
            );
          })}
        </div>
      </section>

      <section className="panel" aria-label="Settings">
        <button
          type="button"
          className="collapse-toggle"
          onClick={(): void => setSettingsOpen(!settingsOpen)}
          aria-expanded={settingsOpen}
        >
          <span className="chevron">{settingsOpen ? '▾' : '▸'}</span>
          Settings
        </button>

        {settingsOpen ? (
          <div className="collapse-body">
            <label className="field">
              <span className="field-label">Show stickers on</span>
              <select
                value={settings.stickerVisibility}
                onChange={(event): void => {
                  const value: StickerVisibility = event.currentTarget.value as StickerVisibility;
                  void updateSettings({ stickerVisibility: value });
                }}
              >
                <option value="all">All</option>
                <option value="posts">Posts only</option>
                <option value="comments">Comments only</option>
              </select>
            </label>

            <div className="field">
              <span className="field-label">Sensitivity</span>
              <div className="segmented">
                {SENSITIVITY_OPTIONS.map((opt: SensitivityOption): JSX.Element => (
                  <button
                    key={opt.value}
                    type="button"
                    className={`segment${settings.strictness === opt.value ? ' segment--active' : ''}`}
                    onClick={(): void => {
                      void updateSettings({ strictness: opt.value });
                    }}
                  >
                    {opt.display}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : null}
      </section>

      <section className="panel" aria-label="AI Analysis">
        <h2 className="panel-heading">AI Analysis</h2>
        {aiAnalysisContent()}
      </section>

      <section className="panel" aria-label="Data and privacy">
        <button
          type="button"
          className="collapse-toggle"
          onClick={(): void => setPrivacyOpen(!privacyOpen)}
          aria-expanded={privacyOpen}
        >
          <span className="chevron">{privacyOpen ? '▾' : '▸'}</span>
          Data &amp; privacy
        </button>

        {privacyOpen ? (
          <div className="collapse-body">
            <p className="panel-desc">
              All analysis happens on your device. Nothing is sent to a server.
            </p>

            <div className="btn-row">
              <button
                type="button"
                className="btn"
                onClick={(): void => { void handleClearCache(); }}
              >
                Clear cache
              </button>
              {!confirmDelete ? (
                <button
                  type="button"
                  className="btn btn--danger"
                  onClick={(): void => setConfirmDelete(true)}
                >
                  Delete all data
                </button>
              ) : (
                <div className="confirm-row">
                  <span className="confirm-text">Are you sure? This removes all scores, settings, and saved data.</span>
                  <button
                    type="button"
                    className="btn"
                    onClick={(): void => setConfirmDelete(false)}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="btn btn--danger"
                    onClick={(): void => { void handleDeleteAll(); }}
                  >
                    Delete
                  </button>
                </div>
              )}
            </div>
          </div>
        ) : null}
      </section>

      {settings.isDeveloperMode ? (
        <section className="panel dev-panel-link" aria-label="Developer tools">
          <button
            type="button"
            className="btn"
            style={{ width: '100%' }}
            onClick={(): void => {
              const rt = browser.runtime as unknown as { getURL: (path: string) => string };
              void browser.tabs.create({ url: rt.getURL('debug.html') });
            }}
          >
            Open debug panel
          </button>
        </section>
      ) : null}
    </main>
  );
}

interface PopupState {
  readonly settings: UserSettings;
  readonly geminiStatus: GeminiStatus;
  readonly health: HealthMetrics | null;
  readonly isConnected: boolean;
  readonly isOnLinkedIn: boolean;
  readonly labelCounts: LabelCounts;
  readonly totalScored: number;
}

async function loadPopupState(): Promise<PopupState> {
  let isOnLinkedIn: boolean = false;

  try {
    const tabs: Browser.tabs.Tab[] = await browser.tabs.query({
      active: true,
      currentWindow: true,
    });
    isOnLinkedIn = (tabs[0]?.url ?? '').includes('linkedin.com');
  } catch {
    isOnLinkedIn = false;
  }

  const [settings, geminiStatus, pingResponse, health] = await Promise.all([
    getUserSettings(),
    getGeminiStatus(),
    sendToBackground({ type: 'PING', source: 'popup' }),
    fetchHealth(),
  ]);

  const isConnected: boolean = pingResponse.ok;
  let labelCounts: LabelCounts = EMPTY_LABEL_COUNTS;
  let totalScored: number = 0;

  if (isOnLinkedIn && isConnected) {
    try {
      const response = await sendToBackground({ type: 'GET_TELEMETRY', source: 'popup' });
      if (response.ok && response.payload.type === 'TELEMETRY_RESULT') {
        totalScored = response.payload.itemsScored;
        labelCounts = countLabels(response.payload.entries);
      }
    } catch {
      // Telemetry unavailable
    }
  }

  return { settings, geminiStatus, health, isConnected, isOnLinkedIn, labelCounts, totalScored };
}

async function fetchHealth(): Promise<HealthMetrics | null> {
  const response = await sendToBackground({ type: 'GET_HEALTH', source: 'popup' });
  return response.ok && response.payload.type === 'HEALTH_RESULT' ? response.payload.health : null;
}

function countLabels(entries: readonly ScoringTelemetryEntry[]): LabelCounts {
  const counts: Record<ScoringLabel, number> = { ...EMPTY_LABEL_COUNTS };

  for (const entry of entries) {
    const label: string | null = entry.finalSource === 'gemini' ? entry.geminiLabel : entry.rulesLabel;

    if (label !== null && label in counts) {
      counts[label as ScoringLabel] += 1;
    }
  }

  return counts;
}
