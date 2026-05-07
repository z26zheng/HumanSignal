import { logger } from '@/shared/logger';
import { safeCatchAsync } from '@/shared/safe-catch';
import {
  DEFAULT_GEMINI_STATUS,
  DEFAULT_USER_SETTINGS,
  type FeedbackEntry,
  type GeminiStatus,
  type UserSettings,
} from '@/shared/types';

interface StorageSchema {
  readonly userSettings: UserSettings;
  readonly geminiStatus: GeminiStatus;
  readonly feedbackEntries: readonly FeedbackEntry[];
}

export type StorageKey = keyof StorageSchema;

export async function readStorageValue<TKey extends StorageKey>(
  key: TKey,
  fallback: StorageSchema[TKey],
): Promise<StorageSchema[TKey]> {
  return await safeCatchAsync(
    async (): Promise<StorageSchema[TKey]> => {
      const result: Partial<StorageSchema> = await browser.storage.local.get(key);
      const value: StorageSchema[TKey] | undefined = result[key];

      return value ?? fallback;
    },
    fallback,
    `storage.read.${key}`,
  );
}

export async function writeStorageValue<TKey extends StorageKey>(
  key: TKey,
  value: StorageSchema[TKey],
): Promise<boolean> {
  return await safeCatchAsync(
    async (): Promise<boolean> => {
      await browser.storage.local.set({ [key]: value });
      logger.info('storage.write', 'Storage value written', { key });
      return true;
    },
    false,
    `storage.write.${key}`,
  );
}

export async function getUserSettings(): Promise<UserSettings> {
  const storedSettings: UserSettings = await readStorageValue('userSettings', DEFAULT_USER_SETTINGS);
  return {
    ...DEFAULT_USER_SETTINGS,
    ...storedSettings,
  };
}

export async function setUserSettings(settings: Partial<UserSettings>): Promise<UserSettings> {
  return await safeCatchAsync(
    async (): Promise<UserSettings> => {
      const existingSettings: UserSettings = await getUserSettings();
      const nextSettings: UserSettings = {
        ...existingSettings,
        ...settings,
      };

      await writeStorageValue('userSettings', nextSettings);
      return nextSettings;
    },
    DEFAULT_USER_SETTINGS,
    'storage.setUserSettings',
  );
}

export async function getGeminiStatus(): Promise<GeminiStatus> {
  return await readStorageValue('geminiStatus', DEFAULT_GEMINI_STATUS);
}

export async function setGeminiStatus(status: GeminiStatus): Promise<GeminiStatus> {
  return await safeCatchAsync(
    async (): Promise<GeminiStatus> => {
      await writeStorageValue('geminiStatus', status);
      return status;
    },
    DEFAULT_GEMINI_STATUS,
    'storage.setGeminiStatus',
  );
}

export async function getFeedbackEntries(): Promise<readonly FeedbackEntry[]> {
  return await readStorageValue('feedbackEntries', []);
}

export async function addFeedbackEntry(entry: FeedbackEntry): Promise<readonly FeedbackEntry[]> {
  return await safeCatchAsync(
    async (): Promise<readonly FeedbackEntry[]> => {
      const existingEntries: readonly FeedbackEntry[] = await getFeedbackEntries();
      const nextEntries: readonly FeedbackEntry[] = [...existingEntries, entry].slice(-500);

      await writeStorageValue('feedbackEntries', nextEntries);
      return nextEntries;
    },
    [],
    'storage.addFeedbackEntry',
  );
}

export async function clearAllStoredData(): Promise<boolean> {
  return await safeCatchAsync(
    async (): Promise<boolean> => {
      await browser.storage.local.clear();
      logger.info('storage.clear', 'All extension storage cleared');
      return true;
    },
    false,
    'storage.clearAllStoredData',
  );
}
