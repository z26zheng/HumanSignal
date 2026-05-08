import { afterEach, describe, expect, it, vi } from 'vitest';

import { GeminiService, validateGeminiResult } from '@/gemini';
import { createRulesItem } from '@/rules-engine';

import type { PromptApiLanguageModel, PromptApiSession } from '@/gemini';
import type { GeminiStatus, ScoringResult } from '@/shared/types';

describe('validateGeminiResult', (): void => {
  it('returns a ScoringResult for valid JSON', (): void => {
    const item = createRulesItem('I shipped a rollout with 27% fewer failures.', 'post');
    const result: ScoringResult | null = validateGeminiResult(
      JSON.stringify({
        primaryLabel: 'Specific',
        color: 'green',
        confidence: 'medium',
        dimensions: {
          authenticity: 0.7,
          originality: 0.6,
          specificity: 0.8,
          engagementBait: 0,
          templating: 0.1,
          usefulness: 0.7,
        },
        reasons: ['Includes a concrete metric.', 'Describes a specific rollout.'],
      }),
      item,
    );

    expect(result?.label).toBe('specific');
    expect(result?.source).toBe('gemini');
  });

  it('returns null for invalid JSON or invalid dimensions', (): void => {
    const item = createRulesItem('Great post.', 'comment');

    expect(validateGeminiResult('{not-json', item)).toBeNull();
    expect(
      validateGeminiResult(
        {
          primaryLabel: 'Thoughtful',
          color: 'green',
          confidence: 'medium',
          dimensions: {
            authenticity: 2,
            originality: 0,
            specificity: 0,
            engagementBait: 0,
            templating: 0,
            usefulness: 0,
          },
          reasons: ['Reason one.', 'Reason two.'],
        },
        item,
      ),
    ).toBeNull();
  });
});

describe('GeminiService', (): void => {
  afterEach((): void => {
    vi.restoreAllMocks();
  });

  it('maps missing Prompt API to unavailable status', async (): Promise<void> => {
    const service: GeminiService = new GeminiService(null, persistStatus);

    await expect(service.checkGeminiAvailability()).resolves.toMatchObject({
      availability: 'unavailable',
    });
  });

  it('scores with a valid Prompt API response', async (): Promise<void> => {
    const session: PromptApiSession = {
      prompt: vi.fn(async (): Promise<string> => {
        return JSON.stringify({
          primaryLabel: 'Specific',
          color: 'green',
          confidence: 'medium',
          dimensions: {
            authenticity: 0.7,
            originality: 0.6,
            specificity: 0.8,
            engagementBait: 0,
            templating: 0.1,
            usefulness: 0.7,
          },
          reasons: ['Includes a concrete metric.', 'Describes a specific rollout.'],
        });
      }),
      destroy: vi.fn(),
    };
    const languageModel: PromptApiLanguageModel = {
      availability: vi.fn(async (): Promise<string> => 'available'),
      create: vi.fn(async (): Promise<PromptApiSession> => session),
    };
    const service: GeminiService = new GeminiService(languageModel, persistStatus);
    const result: ScoringResult | null = await service.scoreWithGemini(
      createRulesItem('I shipped a rollout with 27% fewer failures.', 'post'),
    );

    expect(result?.label).toBe('specific');

    await service.destroySession();
  });

  it('reprompts once after invalid JSON', async (): Promise<void> => {
    const prompt = vi
      .fn<PromptApiSession['prompt']>()
      .mockResolvedValueOnce('not json')
      .mockResolvedValueOnce(
        JSON.stringify({
          primaryLabel: 'Question',
          color: 'green',
          confidence: 'medium',
          dimensions: {
            authenticity: 0.4,
            originality: 0.6,
            specificity: 0.3,
            engagementBait: 0,
            templating: 0,
            usefulness: 0.7,
          },
          reasons: ['Asks a substantive question.', 'Adds context.'],
        }),
      );
    const languageModel: PromptApiLanguageModel = {
      availability: vi.fn(async (): Promise<string> => 'available'),
      create: vi.fn(async (): Promise<PromptApiSession> => ({ prompt })),
    };
    const service: GeminiService = new GeminiService(languageModel, persistStatus);
    const result: ScoringResult | null = await service.scoreWithGemini(
      createRulesItem('How did you decide which tradeoffs mattered first?', 'comment'),
    );

    expect(result?.label).toBe('question');
    expect(prompt).toHaveBeenCalledTimes(2);

    await service.destroySession();
  });

  it('persists download progress and available status when model download succeeds', async (): Promise<void> => {
    const persistedStatuses: GeminiStatus[] = [];
    const session: PromptApiSession = {
      prompt: vi.fn(),
      destroy: vi.fn(),
    };
    const languageModel: PromptApiLanguageModel = {
      availability: vi.fn(async (): Promise<string> => 'downloadable'),
      create: vi.fn(async (options): Promise<PromptApiSession> => {
        options.monitor?.({
          addEventListener: (_eventName: string, listener: (event: { readonly loaded: number }) => void): void => {
            listener({ loaded: 0.42 });
          },
        });
        return session;
      }),
    };
    const service: GeminiService = new GeminiService(languageModel, async (status: GeminiStatus): Promise<GeminiStatus> => {
      persistedStatuses.push(status);
      return status;
    });

    await expect(service.triggerModelDownload()).resolves.toMatchObject({
      availability: 'available',
      downloadProgress: 100,
    });
    expect(persistedStatuses).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ availability: 'downloading', downloadProgress: 0 }),
        expect.objectContaining({ availability: 'downloading', downloadProgress: 42 }),
        expect.objectContaining({ availability: 'available', downloadProgress: 100 }),
      ]),
    );

    await service.destroySession();
  });

  it('persists error status when model download fails', async (): Promise<void> => {
    const persistedStatuses: GeminiStatus[] = [];
    const languageModel: PromptApiLanguageModel = {
      availability: vi.fn(async (): Promise<string> => 'downloadable'),
      create: vi.fn(async (): Promise<PromptApiSession> => {
        throw new Error('download failed');
      }),
    };
    const service: GeminiService = new GeminiService(languageModel, async (status: GeminiStatus): Promise<GeminiStatus> => {
      persistedStatuses.push(status);
      return status;
    });

    await expect(service.triggerModelDownload()).resolves.toMatchObject({
      availability: 'error',
      errorMessage: 'download failed',
    });
    expect(persistedStatuses.at(-1)).toMatchObject({
      availability: 'error',
      downloadProgress: null,
      errorMessage: 'download failed',
    });
  });

  it('pauses scoring and persists error status after repeated invalid responses', async (): Promise<void> => {
    const persistedStatuses: GeminiStatus[] = [];
    const prompt = vi.fn<PromptApiSession['prompt']>().mockResolvedValue('not json');
    const languageModel: PromptApiLanguageModel = {
      availability: vi.fn(async (): Promise<string> => 'available'),
      create: vi.fn(async (): Promise<PromptApiSession> => ({ prompt })),
    };
    const service: GeminiService = new GeminiService(languageModel, async (status: GeminiStatus): Promise<GeminiStatus> => {
      persistedStatuses.push(status);
      return status;
    });
    const item = createRulesItem('This should fail Gemini validation.', 'post');

    await expect(service.scoreWithGemini(item)).resolves.toBeNull();
    await expect(service.scoreWithGemini(item)).resolves.toBeNull();
    await expect(service.scoreWithGemini(item)).resolves.toBeNull();
    await expect(service.scoreWithGemini(item)).resolves.toBeNull();

    expect(prompt).toHaveBeenCalledTimes(6);
    expect(persistedStatuses.at(-1)).toMatchObject({
      availability: 'error',
      errorMessage: 'Gemini returned invalid JSON twice.',
    });

    await service.destroySession();
  });
});

async function persistStatus(status: GeminiStatus): Promise<GeminiStatus> {
  return status;
}
