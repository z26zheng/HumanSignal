import { DEFAULT_GEMINI_STATUS, type ExtractedItem, type GeminiStatus, type ScoringResult } from '@/shared/types';
import { logger } from '@/shared/logger';
import { setGeminiStatus } from '@/shared/storage';
import { getLanguageModel } from '@/gemini/prompt-api';

import type { PromptApiLanguageModel, PromptApiSession } from '@/gemini/prompt-api';

const SESSION_IDLE_TIMEOUT_MS: number = 60_000;
const FAILURE_PAUSE_MS: number = 5 * 60_000;
const MAX_PROMPT_CHARS: number = 6_000;
const GEMINI_SCORING_VERSION: string = 'gemini-1';
const GEMINI_POST_LABELS: readonly ScoringResult['label'][] = [
  'high-signal',
  'specific',
  'mixed',
  'generic',
  'engagement-bait',
  'low-signal',
  'unclear',
];
const GEMINI_COMMENT_LABELS: readonly ScoringResult['label'][] = [
  'thoughtful',
  'specific',
  'question',
  'generic',
  'low-effort',
  'repeated',
  'unclear',
];
const DIMENSION_KEYS: readonly (keyof ScoringResult['dimensions'])[] = [
  'authenticity',
  'originality',
  'specificity',
  'engagementBait',
  'templating',
  'usefulness',
];

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
      const availability: string = await this.languageModel.availability({
        expectedInputs: [{ type: 'text', languages: ['en'] }],
        expectedOutputs: [{ type: 'text', languages: ['en'] }],
      });

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
        initialPrompts: [{ role: 'system', content: SYSTEM_PROMPT }],
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
      const rawResponse: string = await session.prompt(prompt, { responseConstraint: RESULT_SCHEMA });
      const firstResult: ScoringResult | null = validateGeminiResult(rawResponse, item);

      if (firstResult !== null) {
        this.markSuccess();
        return firstResult;
      }

      const repairResponse: string = await session.prompt(buildScoringPrompt(item, true));
      const repairedResult: ScoringResult | null = validateGeminiResult(repairResponse, item);

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
      initialPrompts: [{ role: 'system', content: SYSTEM_PROMPT }],
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

export function validateGeminiResult(raw: unknown, item: ExtractedItem): ScoringResult | null {
  const parsedValue: unknown = typeof raw === 'string' ? parseJson(raw) : raw;

  if (!isRecord(parsedValue)) {
    return null;
  }

  const label = mapGeminiLabel(parsedValue.primaryLabel, item.itemType);

  if (
    label === null ||
    !isConfidence(parsedValue.confidence) ||
    !isValidColor(parsedValue.color) ||
    !isDimensions(parsedValue.dimensions) ||
    !isReasons(parsedValue.reasons)
  ) {
    return null;
  }

  return {
    itemId: item.itemId,
    label,
    confidence: parsedValue.confidence,
    dimensions: parsedValue.dimensions,
    explanation: parsedValue.reasons.join(' '),
    source: 'gemini',
    scoringVersion: GEMINI_SCORING_VERSION,
    scoredAt: Date.now(),
    isTextTruncated: item.isTruncated || item.text.length > MAX_PROMPT_CHARS,
  };
}

function buildScoringPrompt(item: ExtractedItem, isRepairAttempt: boolean): string {
  const itemKind: string = item.itemType === 'post' ? 'post' : 'comment';
  const text: string = truncatePromptText(item.text);

  if (isRepairAttempt) {
    return `Return only valid JSON for this LinkedIn ${itemKind}: ${text}`;
  }

  return `Classify this LinkedIn ${itemKind}:\n\n---\n${text}\n---\n\nReturn JSON matching the schema.`;
}

function truncatePromptText(text: string): string {
  if (text.length <= MAX_PROMPT_CHARS) {
    return text;
  }

  return `${text.slice(0, MAX_PROMPT_CHARS)}\n[truncated]`;
}

function mapAvailability(value: string): GeminiStatus['availability'] {
  switch (value) {
    case 'available':
    case 'readily':
      return 'available';
    case 'downloadable':
    case 'after-download':
      return 'downloadable';
    case 'downloading':
      return 'downloading';
    case 'unavailable':
    case 'no':
      return 'unavailable';
    default:
      return 'error';
  }
}

function mapGeminiLabel(value: unknown, itemType: ExtractedItem['itemType']): ScoringResult['label'] | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalizedValue: string = value.trim().toLowerCase().replace(/\s+/g, '-');
  const allowedLabels: readonly ScoringResult['label'][] =
    itemType === 'post' ? GEMINI_POST_LABELS : GEMINI_COMMENT_LABELS;

  return allowedLabels.includes(normalizedValue as ScoringResult['label'])
    ? (normalizedValue as ScoringResult['label'])
    : null;
}

function parseJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isConfidence(value: unknown): value is ScoringResult['confidence'] {
  return value === 'low' || value === 'medium' || value === 'high';
}

function isValidColor(value: unknown): boolean {
  return value === 'green' || value === 'yellow' || value === 'orange' || value === 'red' || value === 'gray';
}

function isDimensions(value: unknown): value is ScoringResult['dimensions'] {
  if (!isRecord(value)) {
    return false;
  }

  return DIMENSION_KEYS.every((key: keyof ScoringResult['dimensions']): boolean => {
    const dimensionValue: unknown = value[key];
    return typeof dimensionValue === 'number' && dimensionValue >= 0 && dimensionValue <= 1;
  });
}

function isReasons(value: unknown): value is readonly string[] {
  return (
    Array.isArray(value) &&
    value.length >= 2 &&
    value.length <= 3 &&
    value.every((reason: unknown): boolean => typeof reason === 'string' && reason.trim() !== '')
  );
}

const SYSTEM_PROMPT: string = [
  'You are a content quality classifier for LinkedIn posts and comments.',
  'Classify the given text and return a JSON object.',
  'Do not make binary AI detection claims.',
  'Focus on signal quality, specificity, and originality.',
  'Be conservative: prefer Unclear over overconfident negative labels for ambiguous content.',
].join(' ');

const RESULT_SCHEMA = {
  type: 'object',
  properties: {
    primaryLabel: { type: 'string' },
    color: { type: 'string', enum: ['green', 'yellow', 'orange', 'red', 'gray'] },
    confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
    dimensions: { type: 'object' },
    reasons: { type: 'array' },
  },
  required: ['primaryLabel', 'color', 'confidence', 'dimensions', 'reasons'],
} as const;
