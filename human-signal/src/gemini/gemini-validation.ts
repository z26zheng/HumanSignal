import type { ExtractedItem, ScoringResult } from '@/shared/types';
import type { GeminiStatus } from '@/shared/types';

const GEMINI_SCORING_VERSION: string = 'gemini-1';
const MAX_PROMPT_CHARS: number = 6_000;

const DIMENSION_KEYS: readonly (keyof ScoringResult['dimensions'])[] = [
  'authenticity', 'originality', 'specificity', 'engagementBait', 'templating', 'usefulness',
];

export const SYSTEM_PROMPT: string = [
  'You are a content quality classifier for LinkedIn posts and comments.',
  'Your job is to assess whether the content feels genuinely human-written or AI-generated.',
  'Focus on personal specificity, concrete details, original thinking, and human voice.',
  'Do not make binary AI detection claims. Use probabilistic language.',
  'Be conservative: prefer "Can\'t Tell" over overconfident negative labels for ambiguous content.',
  'Describe the content signals, never judge the author.',
].join(' ');

export const RESULT_SCHEMA = {
  type: 'object',
  properties: {
    primaryLabel: {
      type: 'string',
      enum: ['Feels Human', 'Possibly AI', 'Likely AI', 'Almost Certainly AI', "Can't Tell"],
    },
    color: { type: 'string', enum: ['green', 'yellow', 'orange', 'red', 'gray'] },
    confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
    dimensions: {
      type: 'object',
      properties: {
        authenticity: { type: 'number' },
        originality: { type: 'number' },
        specificity: { type: 'number' },
        engagementBait: { type: 'number' },
        templating: { type: 'number' },
        usefulness: { type: 'number' },
      },
      required: ['authenticity', 'originality', 'specificity', 'engagementBait', 'templating', 'usefulness'],
    },
    reasons: { type: 'array', items: { type: 'string' }, minItems: 2, maxItems: 3 },
  },
  required: ['primaryLabel', 'color', 'confidence', 'dimensions', 'reasons'],
} as const;

export function validateGeminiResult(raw: unknown, item: ExtractedItem): ScoringResult | null {
  const parsedValue: unknown = typeof raw === 'string' ? parseJson(raw) : raw;

  if (!isRecord(parsedValue)) {
    return null;
  }

  const label: ScoringResult['label'] | null = mapGeminiLabel(parsedValue.primaryLabel);

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

export function coerceToString(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }

  if (value === null || value === undefined) {
    return '';
  }

  return JSON.stringify(value);
}

export function buildScoringPrompt(item: ExtractedItem, isRepairAttempt: boolean): string {
  const itemKind: string = item.itemType === 'post' ? 'post' : 'comment';
  const text: string = truncatePromptText(item.text);

  if (isRepairAttempt) {
    return `Return only valid JSON for this LinkedIn ${itemKind}: ${text}`;
  }

  return [
    `Classify this LinkedIn ${itemKind}:`,
    '',
    '---',
    text,
    '---',
    '',
    'Assess whether it feels genuinely human-written or AI-generated.',
    'Focus on personal specificity, concrete details, and original voice.',
    'Return JSON matching the schema.',
  ].join('\n');
}

export function mapAvailability(value: string): GeminiStatus['availability'] {
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

function truncatePromptText(text: string): string {
  if (text.length <= MAX_PROMPT_CHARS) {
    return text;
  }

  return `${text.slice(0, MAX_PROMPT_CHARS)}\n[truncated]`;
}

function mapGeminiLabel(value: unknown): ScoringResult['label'] | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized: string = value.trim().toLowerCase();
  const labelMap: Record<string, ScoringResult['label']> = {
    'feels human': 'feels-human',
    'probably human': 'probably-human',
    'possibly human': 'possibly-human',
    'possibly ai': 'possibly-ai',
    'probably ai': 'probably-ai',
    'almost certainly ai': 'almost-certainly-ai',
    // Backward-compatible mappings for older Gemini prompt responses
    'likely ai': 'probably-ai',
    "can't tell": 'possibly-human',
    'cant tell': 'possibly-human',
  };

  return labelMap[normalized] ?? null;
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
