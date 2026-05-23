import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { clearLogEntries } from '@/shared/logger';
import {
  addFeedbackEntry,
  clearAllStoredData,
  getFeedbackEntries,
  getGeminiStatus,
  getUserSettings,
  readStorageValue,
  setGeminiStatus,
  setUserSettings,
  writeStorageValue,
} from '@/shared/storage';
import {
  DEFAULT_GEMINI_STATUS,
  DEFAULT_USER_SETTINGS,
  type FeedbackEntry,
  type GeminiStatus,
  type UserSettings,
} from '@/shared/types';

/**
 * In-memory fake of `browser.storage.local` used to test storage helpers
 * without depending on the WebExtension runtime.
 */
function createFakeStorage(): {
  readonly store: Record<string, unknown>;
  readonly browser: { storage: { local: { get: ReturnType<typeof vi.fn>; set: ReturnType<typeof vi.fn>; clear: ReturnType<typeof vi.fn> } } };
} {
  const store: Record<string, unknown> = {};
  const browserStub = {
    storage: {
      local: {
        get: vi.fn(async (key: string): Promise<Record<string, unknown>> => {
          if (key in store) {
            return { [key]: store[key] };
          }
          return {};
        }),
        set: vi.fn(async (entries: Record<string, unknown>): Promise<void> => {
          for (const [k, v] of Object.entries(entries)) {
            store[k] = v;
          }
        }),
        clear: vi.fn(async (): Promise<void> => {
          for (const k of Object.keys(store)) {
            delete store[k];
          }
        }),
      },
    },
  };
  return { store, browser: browserStub };
}

describe('readStorageValue', (): void => {
  beforeEach((): void => {
    clearLogEntries();
  });

  afterEach((): void => {
    vi.unstubAllGlobals();
  });

  it('returns stored value when present', async (): Promise<void> => {
    const fake = createFakeStorage();
    fake.store['e2eFailNextScoreBatch'] = true;
    vi.stubGlobal('browser', fake.browser);

    const value: boolean = await readStorageValue('e2eFailNextScoreBatch', false);
    expect(value).toBe(true);
  });

  it('returns fallback when key is missing', async (): Promise<void> => {
    vi.stubGlobal('browser', createFakeStorage().browser);

    const value: boolean = await readStorageValue('e2eFailNextScoreBatch', false);
    expect(value).toBe(false);
  });

  it('returns fallback when storage throws', async (): Promise<void> => {
    vi.spyOn(console, 'error').mockImplementation((): void => {});
    vi.stubGlobal('browser', {
      storage: {
        local: {
          get: vi.fn(async (): Promise<never> => {
            throw new Error('storage unavailable');
          }),
        },
      },
    });

    const value: boolean = await readStorageValue('e2eFailNextScoreBatch', false);
    expect(value).toBe(false);
  });

  it('returns fallback for undefined stored values (e.g., set to undefined)', async (): Promise<void> => {
    const fake = createFakeStorage();
    fake.store['e2eFailNextScoreBatch'] = undefined;
    vi.stubGlobal('browser', fake.browser);

    const value: boolean = await readStorageValue('e2eFailNextScoreBatch', false);
    expect(value).toBe(false);
  });
});

describe('writeStorageValue', (): void => {
  afterEach((): void => {
    vi.unstubAllGlobals();
    clearLogEntries();
  });

  it('writes value to storage and returns true', async (): Promise<void> => {
    const fake = createFakeStorage();
    vi.stubGlobal('browser', fake.browser);

    const ok: boolean = await writeStorageValue('e2eFailNextScoreBatch', true);
    expect(ok).toBe(true);
    expect(fake.store['e2eFailNextScoreBatch']).toBe(true);
  });

  it('returns false when storage throws', async (): Promise<void> => {
    vi.spyOn(console, 'error').mockImplementation((): void => {});
    vi.stubGlobal('browser', {
      storage: {
        local: {
          set: vi.fn(async (): Promise<never> => {
            throw new Error('quota exceeded');
          }),
        },
      },
    });

    const ok: boolean = await writeStorageValue('e2eFailNextScoreBatch', true);
    expect(ok).toBe(false);
  });
});

describe('getUserSettings', (): void => {
  afterEach((): void => {
    vi.unstubAllGlobals();
    clearLogEntries();
  });

  it('returns defaults when no settings are stored', async (): Promise<void> => {
    vi.stubGlobal('browser', createFakeStorage().browser);

    const settings: UserSettings = await getUserSettings();
    expect(settings).toEqual(DEFAULT_USER_SETTINGS);
  });

  it('merges stored settings on top of defaults (back-compat with older stored shapes)', async (): Promise<void> => {
    const fake = createFakeStorage();
    // Older versions of the extension may have stored an incomplete shape.
    // We expect missing fields to be filled from DEFAULT_USER_SETTINGS.
    fake.store['userSettings'] = {
      isEnabled: false,
      stickerOpacity: 0.5,
    } as unknown as UserSettings;
    vi.stubGlobal('browser', fake.browser);

    const settings: UserSettings = await getUserSettings();

    expect(settings.isEnabled).toBe(false);
    expect(settings.stickerOpacity).toBe(0.5);
    // Defaulted because not in stored shape:
    expect(settings.scoringMode).toBe(DEFAULT_USER_SETTINGS.scoringMode);
    expect(settings.stickerVisibility).toBe(DEFAULT_USER_SETTINGS.stickerVisibility);
    expect(settings.strictness).toBe(DEFAULT_USER_SETTINGS.strictness);
    expect(settings.showExplanations).toBe(DEFAULT_USER_SETTINGS.showExplanations);
    expect(settings.isDeveloperMode).toBe(DEFAULT_USER_SETTINGS.isDeveloperMode);
  });

  it('lets stored values override defaults', async (): Promise<void> => {
    const fake = createFakeStorage();
    fake.store['userSettings'] = {
      ...DEFAULT_USER_SETTINGS,
      isEnabled: false,
      isDeveloperMode: true,
    };
    vi.stubGlobal('browser', fake.browser);

    const settings: UserSettings = await getUserSettings();
    expect(settings.isEnabled).toBe(false);
    expect(settings.isDeveloperMode).toBe(true);
  });
});

describe('setUserSettings', (): void => {
  afterEach((): void => {
    vi.unstubAllGlobals();
    clearLogEntries();
  });

  it('persists merged settings to storage and returns the merged value', async (): Promise<void> => {
    const fake = createFakeStorage();
    vi.stubGlobal('browser', fake.browser);

    const updated: UserSettings = await setUserSettings({ isDeveloperMode: true, stickerOpacity: 0.3 });

    expect(updated.isDeveloperMode).toBe(true);
    expect(updated.stickerOpacity).toBe(0.3);
    expect(fake.store['userSettings']).toEqual(updated);
  });

  it('preserves existing fields when partial update is applied', async (): Promise<void> => {
    const fake = createFakeStorage();
    fake.store['userSettings'] = {
      ...DEFAULT_USER_SETTINGS,
      isDeveloperMode: true,
      stickerOpacity: 0.5,
    };
    vi.stubGlobal('browser', fake.browser);

    const updated: UserSettings = await setUserSettings({ isEnabled: false });

    expect(updated.isEnabled).toBe(false);
    expect(updated.isDeveloperMode).toBe(true);
    expect(updated.stickerOpacity).toBe(0.5);
  });
});

describe('getGeminiStatus / setGeminiStatus', (): void => {
  afterEach((): void => {
    vi.unstubAllGlobals();
    clearLogEntries();
  });

  it('returns default status when none stored', async (): Promise<void> => {
    vi.stubGlobal('browser', createFakeStorage().browser);

    const status: GeminiStatus = await getGeminiStatus();
    expect(status).toEqual(DEFAULT_GEMINI_STATUS);
  });

  it('round-trips through storage', async (): Promise<void> => {
    const fake = createFakeStorage();
    vi.stubGlobal('browser', fake.browser);

    const next: GeminiStatus = { ...DEFAULT_GEMINI_STATUS, availability: 'available', lastCheckedAt: 42 };
    await setGeminiStatus(next);
    const reloaded: GeminiStatus = await getGeminiStatus();

    expect(reloaded.availability).toBe('available');
    expect(reloaded.lastCheckedAt).toBe(42);
  });
});

describe('feedbackEntries', (): void => {
  afterEach((): void => {
    vi.unstubAllGlobals();
    clearLogEntries();
  });

  it('returns empty array when none stored', async (): Promise<void> => {
    vi.stubGlobal('browser', createFakeStorage().browser);
    await expect(getFeedbackEntries()).resolves.toEqual([]);
  });

  it('appends entries up to a max of 500 (FIFO truncation)', async (): Promise<void> => {
    const fake = createFakeStorage();
    fake.store['feedbackEntries'] = Array.from({ length: 500 }, (_, i): FeedbackEntry => ({
      itemId: `id_${i}`,
      thumbsUp: true,
      submittedAt: i,
    } as unknown as FeedbackEntry));
    vi.stubGlobal('browser', fake.browser);

    const newEntry: FeedbackEntry = { itemId: 'id_new', thumbsUp: false, submittedAt: 1000 } as unknown as FeedbackEntry;
    const result: readonly FeedbackEntry[] = await addFeedbackEntry(newEntry);

    expect(result.length).toBe(500);
    expect(result[result.length - 1]).toEqual(newEntry);
    // FIFO: the first historic entry should now be id_1 (id_0 dropped)
    expect((result[0] as unknown as { itemId: string }).itemId).toBe('id_1');
  });

  it('appends entries normally below the 500 cap', async (): Promise<void> => {
    const fake = createFakeStorage();
    vi.stubGlobal('browser', fake.browser);

    const entry: FeedbackEntry = { itemId: 'id_a', thumbsUp: true, submittedAt: 1 } as unknown as FeedbackEntry;
    const result: readonly FeedbackEntry[] = await addFeedbackEntry(entry);

    expect(result.length).toBe(1);
    expect(result[0]).toEqual(entry);
  });
});

describe('clearAllStoredData', (): void => {
  afterEach((): void => {
    vi.unstubAllGlobals();
    clearLogEntries();
  });

  it('clears all storage and returns true on success', async (): Promise<void> => {
    const fake = createFakeStorage();
    fake.store['userSettings'] = DEFAULT_USER_SETTINGS;
    fake.store['feedbackEntries'] = [{} as unknown];
    vi.stubGlobal('browser', fake.browser);

    const ok: boolean = await clearAllStoredData();
    expect(ok).toBe(true);
    expect(Object.keys(fake.store)).toHaveLength(0);
  });

  it('returns false when clear() throws', async (): Promise<void> => {
    vi.spyOn(console, 'error').mockImplementation((): void => {});
    vi.stubGlobal('browser', {
      storage: {
        local: {
          clear: vi.fn(async (): Promise<never> => {
            throw new Error('not allowed');
          }),
        },
      },
    });

    const ok: boolean = await clearAllStoredData();
    expect(ok).toBe(false);
  });
});
