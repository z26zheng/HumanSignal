import {
  ENGAGEMENT_BAIT_PATTERNS,
  EVIDENCE_PATTERNS,
  FIRST_PERSON_PATTERNS,
  GENERIC_PRAISE_PHRASES,
  MOTIVATIONAL_CLICHES,
} from '@/rules-engine/patterns';

export interface TextFeatures {
  readonly charCount: number;
  readonly wordCount: number;
  readonly sentenceCount: number;
  readonly paragraphCount: number;
  readonly hasFirstPerson: boolean;
  readonly firstPersonCount: number;
  readonly concreteNumberCount: number;
  readonly dateReferenceCount: number;
  readonly percentageCount: number;
  readonly namedEntityCount: number;
  readonly genericPhraseCount: number;
  readonly genericPhraseRatio: number;
  readonly motivationalClicheCount: number;
  readonly engagementBaitScore: number;
  readonly listicleScore: number;
  readonly questionCount: number;
  readonly claimCount: number;
  readonly evidenceCount: number;
  readonly claimEvidenceRatio: number;
  readonly uniqueWordRatio: number;
  readonly averageSentenceLength: number;
}

const WORD_PATTERN: RegExp = /[a-zA-Z][a-zA-Z'-]*/g;
const NUMBER_PATTERN: RegExp = /(?:\$?\d+(?:,\d{3})*(?:\.\d+)?%?)|(?:\d+x)/gi;
const PERCENTAGE_PATTERN: RegExp = /\d+(?:\.\d+)?%/g;
const DATE_PATTERN: RegExp =
  /\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|january|february|march|april|june|july|august|september|october|november|december|q[1-4]|20\d{2}|last quarter|last year)\b/gi;
const NAMED_ENTITY_PATTERN: RegExp =
  /\b(?:at|from|inside|with|for)\s+([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)?)\b|\b(?:CEO|CTO|VP|PM|SRE|API|SDK|Chrome|LinkedIn|ExampleCo|Example Labs)\b/g;
const CLAIM_PATTERN: RegExp = /\b(?:should|must|will|always|never|is|are|means|proves)\b/gi;
const LISTICLE_PATTERN: RegExp = /\b(?:\d+\s+(?:lessons|things|ways|tips|rules)|here are|framework)\b/gi;

export function extractFeatures(text: string): TextFeatures {
  const normalizedText: string = text.trim();
  const lowerText: string = normalizedText.toLowerCase();
  const words: readonly string[] = normalizedText.match(WORD_PATTERN) ?? [];
  const sentenceCount: number = countMatches(normalizedText, /[.!?]+/g) || (words.length > 0 ? 1 : 0);
  const paragraphCount: number =
    normalizedText === '' ? 0 : normalizedText.split(/\n{2,}|\n/).filter(Boolean).length;
  const firstPersonCount: number =
    countPhraseMatches(lowerText, FIRST_PERSON_PATTERNS) + countMatches(lowerText, /\b(?:i|we|my|our)\b/g);
  const concreteNumberCount: number = countMatches(normalizedText, NUMBER_PATTERN);
  const dateReferenceCount: number = countMatches(normalizedText, DATE_PATTERN);
  const genericPhraseCount: number = countPhraseMatches(lowerText, GENERIC_PRAISE_PHRASES);
  const motivationalClicheCount: number = countPhraseMatches(lowerText, MOTIVATIONAL_CLICHES);
  const evidenceCount: number =
    countPhraseMatches(lowerText, EVIDENCE_PATTERNS) + concreteNumberCount + dateReferenceCount;
  const claimCount: number = countMatches(normalizedText, CLAIM_PATTERN);

  return {
    charCount: normalizedText.length,
    wordCount: words.length,
    sentenceCount,
    paragraphCount,
    hasFirstPerson: firstPersonCount > 0,
    firstPersonCount,
    concreteNumberCount,
    dateReferenceCount,
    percentageCount: countMatches(normalizedText, PERCENTAGE_PATTERN),
    namedEntityCount: countMatches(normalizedText, NAMED_ENTITY_PATTERN),
    genericPhraseCount,
    genericPhraseRatio: words.length === 0 ? 0 : Math.min(1, genericPhraseCount / words.length),
    motivationalClicheCount,
    engagementBaitScore: scorePatternCoverage(lowerText, ENGAGEMENT_BAIT_PATTERNS),
    listicleScore: Math.min(1, countMatches(normalizedText, LISTICLE_PATTERN)),
    questionCount: countMatches(normalizedText, /\?/g),
    claimCount,
    evidenceCount,
    claimEvidenceRatio: claimCount === 0 ? 0 : evidenceCount / claimCount,
    uniqueWordRatio: calculateUniqueWordRatio(words),
    averageSentenceLength: sentenceCount === 0 ? 0 : words.length / sentenceCount,
  };
}

function scorePatternCoverage(text: string, patterns: readonly string[]): number {
  const matchCount: number = countPhraseMatches(text, patterns);
  return Math.min(1, matchCount);
}

function countPhraseMatches(text: string, phrases: readonly string[]): number {
  return phrases.reduce((count: number, phrase: string): number => {
    return text.includes(phrase) ? count + 1 : count;
  }, 0);
}

function countMatches(text: string, pattern: RegExp): number {
  return Array.from(text.matchAll(pattern)).length;
}

function calculateUniqueWordRatio(words: readonly string[]): number {
  if (words.length === 0) {
    return 0;
  }

  const normalizedWords: readonly string[] = words.map((word: string): string => word.toLowerCase());
  return new Set(normalizedWords).size / normalizedWords.length;
}
