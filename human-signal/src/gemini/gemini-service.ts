import { DEFAULT_GEMINI_STATUS, type ExtractedItem, type GeminiStatus, type ScoringResult } from '@/shared/types';
import { logger } from '@/shared/logger';
import { setGeminiStatus } from '@/shared/storage';
import { getLanguageModel } from '@/gemini/prompt-api';
import {
  buildScoringPrompt,
  coerceToString,
  mapAvailability,
  RESULT_SCHEMA,
  SYSTEM_PROMPT,
  validateGeminiResult,
} from '@/gemini/gemini-validation';

import type { PromptApiLanguageModel, PromptApiSession } from '@/gemini/prompt-api';

const SESSION_IDLE_TIMEOUT_MS: number = 60_000;
const FAILURE_PAUSE_MS: number = 5 * 60_000;

export { validateGeminiResult } from '@/gemini/gemini-validation';

export class GeminiService {
  private session: PromptApiSession | null = null;
  private idleTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private consecutiveFailures: number = 0;
  private pauseUntil: number = 0;

  public constructor(
    private readonly languageModel: PromptApiLanguageModel | null = getLanguageModel(),
    private readonly statusWriter: (status: GeminiStatus) => Promise<GeminiStatus> = setGeminiStatus,
  ) {}

  public async checkGeminiAvailability(): Promise<GeminiStatus> {
    if (this.languageModel === null) {
      return await this.persistStatus({
        ...DEFAULT_GEMINI_STATUS,
        availability: 'unavailable',
        lastCheckedAt: Date.now(),
      });
    }

    try {
      const availability: string = await this.languageModel.availability();

      return await this.persistStatus({
        availability: mapAvailability(availability),
        downloadProgress: null,
        lastCheckedAt: Date.now(),
        errorMessage: null,
      });
    } catch (error: unknown) {
      logger.error('gemini.availability', error);
      return await this.persistStatus({
        availability: 'error',
        downloadProgress: null,
        lastCheckedAt: Date.now(),
        errorMessage: error instanceof Error ? error.message : String(error),
      });
    }
  }

  public async triggerModelDownload(): Promise<GeminiStatus> {
    if (this.languageModel === null) {
      return await this.checkGeminiAvailability();
    }

    try {
      await this.persistStatus({
        availability: 'downloading',
        downloadProgress: 0,
        lastCheckedAt: Date.now(),
        errorMessage: null,
      });

      this.session = await this.languageModel.create({
        systemPrompt: SYSTEM_PROMPT,
        monitor: (monitor): void => {
          monitor.addEventListener('downloadprogress', (event): void => {
            const percent: number = Math.round(event.loaded * 100);
            void this.persistStatus({
              availability: 'downloading',
              downloadProgress: percent,
              lastCheckedAt: Date.now(),
              errorMessage: null,
            });
          });
        },
      });
      this.resetIdleTimer();

      return await this.persistStatus({
        availability: 'available',
        downloadProgress: 100,
        lastCheckedAt: Date.now(),
        errorMessage: null,
      });
    } catch (error: unknown) {
      logger.error('gemini.download', error);
      return await this.persistStatus({
        availability: 'error',
        downloadProgress: null,
        lastCheckedAt: Date.now(),
        errorMessage: error instanceof Error ? error.message : String(error),
      });
    }
  }

  public async scoreWithGemini(item: ExtractedItem): Promise<ScoringResult | null> {
    if (Date.now() < this.pauseUntil) {
      return null;
    }

    try {
      const session: PromptApiSession = await this.getOrCreateSession();
      const prompt: string = buildScoringPrompt(item, false);
      const rawResponse: unknown = await session.prompt(prompt, { responseConstraint: RESULT_SCHEMA });
      const firstResult: ScoringResult | null = validateGeminiResult(coerceToString(rawResponse), item);

      if (firstResult !== null) {
        this.markSuccess();
        return firstResult;
      }

      const repairRaw: unknown = await session.prompt(buildScoringPrompt(item, true), { responseConstraint: RESULT_SCHEMA });
      const repairedResult: ScoringResult | null = validateGeminiResult(coerceToString(repairRaw), item);

      if (repairedResult !== null) {
        this.markSuccess();
        return repairedResult;
      }

      await this.markFailure('Gemini returned invalid JSON twice.');
      return null;
    } catch (error: unknown) {
      logger.error('gemini.score', error);
      await this.markFailure(error instanceof Error ? error.message : String(error));
      return null;
    }
  }

  public async warmUp(): Promise<void> {
    if (this.languageModel === null) {
      logger.info('gemini.warmUp', 'Skipped warm-up: LanguageModel not available');
      return;
    }

    try {
      await this.getOrCreateSession();
      logger.info('gemini.warmUp', 'Session pre-warmed successfully');
    } catch (error: unknown) {
      logger.warn('gemini.warmUp', 'Session warm-up failed; will retry on first prompt', {
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      this.session = null;
    }
  }

  public async destroySession(): Promise<void> {
    if (this.idleTimeoutId !== null) {
      clearTimeout(this.idleTimeoutId);
      this.idleTimeoutId = null;
    }

    this.session?.destroy?.();
    this.session = null;
    logger.info('gemini.session', 'Gemini session destroyed');
  }

  private async getOrCreateSession(): Promise<PromptApiSession> {
    if (this.languageModel === null) {
      throw new Error('Prompt API is unavailable.');
    }

    if (this.session !== null) {
      this.resetIdleTimer();
      return this.session;
    }

    this.session = await this.languageModel.create({
      systemPrompt: SYSTEM_PROMPT,
    });
    this.resetIdleTimer();
    logger.info('gemini.session', 'Gemini session created');
    return this.session;
  }

  private resetIdleTimer(): void {
    if (this.idleTimeoutId !== null) {
      clearTimeout(this.idleTimeoutId);
    }

    this.idleTimeoutId = setTimeout((): void => {
      void this.destroySession();
    }, SESSION_IDLE_TIMEOUT_MS);
  }

  private markSuccess(): void {
    this.consecutiveFailures = 0;
    this.resetIdleTimer();
  }

  private async markFailure(errorMessage: string): Promise<void> {
    this.consecutiveFailures += 1;

    if (this.consecutiveFailures >= 3) {
      this.pauseUntil = Date.now() + FAILURE_PAUSE_MS;
      await this.persistStatus({
        availability: 'error',
        downloadProgress: null,
        lastCheckedAt: Date.now(),
        errorMessage,
      });
    }
  }

  private async persistStatus(status: GeminiStatus): Promise<GeminiStatus> {
    return await this.statusWriter(status);
  }
}
