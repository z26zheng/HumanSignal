export const GENERIC_PRAISE_PHRASES: readonly string[] = [
  'great insights',
  "couldn't agree more",
  'well said',
  'this is gold',
  'love this',
  'so true',
  'needed to hear this',
  'spot on',
  'thanks for sharing',
  'inspiring post',
];

export const MOTIVATIONAL_CLICHES: readonly string[] = [
  "here's what i learned",
  'things nobody tells you',
  'stop doing',
  'start doing',
  'the secret to success',
  "most people don't realize",
  'most people do not realize',
  'hard truth',
  'unpopular opinion',
  'read that again',
  'let that sink in',
];

export const ENGAGEMENT_BAIT_PATTERNS: readonly string[] = [
  "comment ai and i'll send you",
  'comment ai and i will send you',
  'comment playbook and i will send',
  'comment template and i will send',
  'comment guide and i will send',
  'comment below and i will send',
  'like if you agree',
  'repost for reach',
  'tag someone who needs this',
  'follow for more',
  'dm me the word',
  'drop a yes',
  'comment interested',
  'share this with your network',
];

export const FIRST_PERSON_PATTERNS: readonly string[] = [
  'i built',
  'i shipped',
  'i led',
  'i learned',
  'i wrote',
  'i used',
  'we shipped',
  'we migrated',
  'last quarter we',
  'in my experience',
  'when i was',
  'at exampleco i',
];

export const EVIDENCE_PATTERNS: readonly string[] = [
  'reduced',
  'increased',
  'measured',
  'tested',
  'after',
  'before',
  'because',
  'case study',
  'rollout',
  'migration',
];

/**
 * Phrases that signal the author is directly addressing the reader or a
 * specific group of people — a strong human signal that AI-generated
 * marketing/motivational posts rarely produce.
 */
export const DIRECT_ADDRESS_PATTERNS: readonly string[] = [
  'to my network',
  'to all of you',
  'to those of you',
  'for those of you',
  'let me know',
  'reach out',
  'feel free',
  'you all',
  'all of you',
  'thank you',
  'please consider',
  "don't be a stranger",
  'do not be a stranger',
  'i can help',
  'help in any way',
];

/**
 * Empathetic / emotional vocabulary that signals genuine human connection
 * (condolences, congratulations, support, gratitude).
 */
export const EMPATHY_PATTERNS: readonly string[] = [
  'miss you',
  'lucky to',
  'honored to',
  'humbled to',
  'mission-driven',
  'mission driven',
  'dear colleagues',
  'dear friends',
  'my dear',
  'grateful',
  'blessed',
  'proud of',
  'proud to',
  'i miss',
  'shape, or form',
  'shape or form',
  'pleasure',
  'rally',
];

/**
 * Community / relationship references that suggest the author knows the
 * reader (insider language, group jargon).
 */
export const COMMUNITY_TERMS: readonly string[] = [
  'ex-hoodies',
  'my team',
  'my colleagues',
  'my coworkers',
  'my friends',
  'my mentor',
  'my mentee',
  'fellow',
];

/**
 * Generic "ex-<company>" pattern (ex-Googler, ex-Stripe, ex-hoodies).
 * Captures insider community references without hardcoding every company.
 */
export const EX_COMMUNITY_PATTERN: RegExp = /\bex-[a-z][a-z]+/gi;
