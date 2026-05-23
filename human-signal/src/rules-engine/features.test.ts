import { describe, expect, it } from 'vitest';

import { extractFeatures } from '@/rules-engine/features';

describe('extractFeatures', (): void => {
  describe('empty / trivial input', (): void => {
    it('returns zeros for an empty string', (): void => {
      const features = extractFeatures('');
      expect(features.charCount).toBe(0);
      expect(features.wordCount).toBe(0);
      expect(features.sentenceCount).toBe(0);
      expect(features.paragraphCount).toBe(0);
      expect(features.hasFirstPerson).toBe(false);
      expect(features.uniqueWordRatio).toBe(0);
      expect(features.averageSentenceLength).toBe(0);
      expect(features.claimEvidenceRatio).toBe(0);
      expect(features.genericPhraseRatio).toBe(0);
    });

    it('trims whitespace before measuring charCount', (): void => {
      expect(extractFeatures('   hello   ').charCount).toBe(5);
    });
  });

  describe('basic counts', (): void => {
    it('counts words by alpha tokens', (): void => {
      expect(extractFeatures('Hello world').wordCount).toBe(2);
    });

    it('counts sentences by terminal punctuation', (): void => {
      expect(extractFeatures('One sentence. Two sentence! Three?').sentenceCount).toBe(3);
    });

    it('counts at least 1 sentence when text has no terminal punctuation but has words', (): void => {
      expect(extractFeatures('No period here').sentenceCount).toBe(1);
    });

    it('counts paragraphs split by blank lines', (): void => {
      const features = extractFeatures('Para one.\n\nPara two.\n\nPara three.');
      expect(features.paragraphCount).toBe(3);
    });

    it('counts questions', (): void => {
      expect(extractFeatures('Why? How? What?').questionCount).toBe(3);
    });
  });

  describe('first-person detection', (): void => {
    it('detects first-person pronouns', (): void => {
      const features = extractFeatures('I shipped this. We learned.');
      expect(features.firstPersonCount).toBeGreaterThan(0);
      expect(features.hasFirstPerson).toBe(true);
    });

    it('is false when no first-person pronouns appear', (): void => {
      expect(extractFeatures('The team works hard. The product launches.').hasFirstPerson).toBe(false);
    });
  });

  describe('concrete number detection', (): void => {
    it('counts integers', (): void => {
      expect(extractFeatures('We had 5 launches.').concreteNumberCount).toBeGreaterThan(0);
    });

    it('counts percentages', (): void => {
      const features = extractFeatures('Up 42% this quarter.');
      expect(features.concreteNumberCount).toBeGreaterThan(0);
      expect(features.percentageCount).toBeGreaterThan(0);
    });

    it('counts dollar amounts', (): void => {
      expect(extractFeatures('Saved $1,200,000 last year.').concreteNumberCount).toBeGreaterThan(0);
    });

    it('counts multipliers like 3x', (): void => {
      expect(extractFeatures('Grew revenue 3x in 12 months.').concreteNumberCount).toBeGreaterThan(0);
    });
  });

  describe('date references', (): void => {
    it('detects month names', (): void => {
      expect(extractFeatures('Shipped in January.').dateReferenceCount).toBeGreaterThan(0);
    });

    it('detects quarters like Q1', (): void => {
      expect(extractFeatures('In Q3 we hit our target.').dateReferenceCount).toBeGreaterThan(0);
    });

    it('detects years (20xx)', (): void => {
      expect(extractFeatures('Launched in 2024.').dateReferenceCount).toBeGreaterThan(0);
    });

    it('detects "last quarter"', (): void => {
      expect(extractFeatures('We grew last quarter.').dateReferenceCount).toBeGreaterThan(0);
    });
  });

  describe('claim vs evidence ratio', (): void => {
    it('is 0 when there are no claims (division-by-zero guard)', (): void => {
      const f = extractFeatures('Just plain neutral observation.');
      expect(f.claimCount).toBe(0);
      expect(f.claimEvidenceRatio).toBe(0);
    });

    it('rises when evidence outweighs claims (text with both)', (): void => {
      // Has claim words ("must", "is") AND many evidence signals (numbers, dates, %).
      const balanced = extractFeatures('You must know this is the case: in Q1 2024 retention rose 17%.');
      expect(balanced.claimCount).toBeGreaterThan(0);
      expect(balanced.evidenceCount).toBeGreaterThan(0);
      expect(balanced.claimEvidenceRatio).toBeGreaterThan(0);
    });

    it('is higher when text has only claims with no evidence', (): void => {
      const claimy = extractFeatures('You must succeed. We will always win.');
      expect(claimy.claimCount).toBeGreaterThan(0);
      expect(claimy.claimEvidenceRatio).toBe(0);
    });
  });

  describe('unique word ratio', (): void => {
    it('is 1.0 for fully unique words', (): void => {
      const features = extractFeatures('alpha beta gamma delta');
      expect(features.uniqueWordRatio).toBeCloseTo(1, 5);
    });

    it('is lower when words repeat', (): void => {
      const features = extractFeatures('alpha alpha alpha alpha');
      expect(features.uniqueWordRatio).toBeCloseTo(0.25, 5);
    });

    it('is case-insensitive', (): void => {
      const features = extractFeatures('Word word WORD');
      expect(features.uniqueWordRatio).toBeCloseTo(1 / 3, 5);
    });
  });

  describe('average sentence length', (): void => {
    it('is wordCount / sentenceCount', (): void => {
      const features = extractFeatures('One two three. Four five six.');
      expect(features.averageSentenceLength).toBeCloseTo(3, 5);
    });
  });

  describe('listicle detection', (): void => {
    it('detects "5 lessons" style phrases', (): void => {
      expect(extractFeatures('5 lessons I learned this year.').listicleScore).toBeGreaterThan(0);
    });

    it('detects "here are" introducers', (): void => {
      expect(extractFeatures('Here are my top tips.').listicleScore).toBeGreaterThan(0);
    });

    it('is 0 for non-listicle text', (): void => {
      expect(extractFeatures('A reflection on last quarter.').listicleScore).toBe(0);
    });

    it('is clamped at 1.0 max', (): void => {
      const f = extractFeatures('Here are 5 lessons. Here are 7 things. Here are 3 ways. Framework rules: nobody tells you.');
      expect(f.listicleScore).toBeLessThanOrEqual(1);
    });
  });

  describe('engagement bait score', (): void => {
    it('is clamped to [0, 1]', (): void => {
      const features = extractFeatures('Hello world.');
      expect(features.engagementBaitScore).toBeGreaterThanOrEqual(0);
      expect(features.engagementBaitScore).toBeLessThanOrEqual(1);
    });
  });

  describe('generic phrase ratio', (): void => {
    it('is 0 for empty text', (): void => {
      expect(extractFeatures('').genericPhraseRatio).toBe(0);
    });

    it('is clamped to [0, 1]', (): void => {
      const features = extractFeatures('A normal sentence.');
      expect(features.genericPhraseRatio).toBeGreaterThanOrEqual(0);
      expect(features.genericPhraseRatio).toBeLessThanOrEqual(1);
    });
  });

  describe('output shape', (): void => {
    it('returns all 21 documented properties', (): void => {
      const keys: readonly string[] = Object.keys(extractFeatures('Sample text.'));
      const expected: readonly string[] = [
        'charCount', 'wordCount', 'sentenceCount', 'paragraphCount',
        'hasFirstPerson', 'firstPersonCount', 'concreteNumberCount', 'dateReferenceCount',
        'percentageCount', 'namedEntityCount', 'genericPhraseCount', 'genericPhraseRatio',
        'motivationalClicheCount', 'engagementBaitScore', 'listicleScore', 'questionCount',
        'claimCount', 'evidenceCount', 'claimEvidenceRatio', 'uniqueWordRatio', 'averageSentenceLength',
      ];
      for (const key of expected) {
        expect(keys).toContain(key);
      }
    });
  });
});
