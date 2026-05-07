# 03 Rules Engine

## Purpose

Build the deterministic scoring engine that classifies LinkedIn posts and comments using feature extraction and rule-based logic. This engine is the sole scorer when Gemini Nano is unavailable.

## Depends On

- **01 Extension Shell** (shared types: `ExtractedItem`, `ScoringResult`, label enums)

## Outputs

- A `RulesEngine` module that accepts extracted text and returns a `ScoringResult`.
- Feature extraction functions for all supported signals.
- Label mapping logic.
- Explanation generation.
- A golden-set test suite of 100+ items with expected labels.
- Passes golden set with at least 80% label agreement.

## Architecture Context

The rules engine is active only when Gemini is unavailable. Once Gemini is downloaded, the rules engine is never invoked. It must be:

- Fast (synchronous, no async).
- Conservative (prefer Unclear over overconfident labels).
- Explainable (every label includes reasons).
- Deterministic (same input always produces same output).

## Tasks

### 1. Feature Extractor

Implement feature extraction from raw text:

```typescript
interface TextFeatures {
  charCount: number
  wordCount: number
  sentenceCount: number
  paragraphCount: number
  hasFirstPerson: boolean
  firstPersonCount: number
  concreteNumberCount: number
  dateReferenceCount: number
  percentageCount: number
  namedEntityCount: number
  genericPhraseCount: number
  genericPhraseRatio: number
  motivationalClicheCount: number
  engagementBaitScore: number
  listicleScore: number
  questionCount: number
  claimCount: number
  evidenceCount: number
  claimEvidenceRatio: number
  uniqueWordRatio: number
  averageSentenceLength: number
}

function extractFeatures(text: string): TextFeatures
```

### 2. Pattern Dictionaries

Create curated lists for pattern matching:

**Generic praise phrases** (for comments):
- "Great insights", "Couldn't agree more", "Well said", "This is gold", "Love this", "So true", "Needed to hear this", "Spot on", etc.

**Motivational cliches** (for posts):
- "Here's what I learned", "X things nobody tells you about", "Stop doing X, start doing Y", "The secret to success is", "Most people don't realize", etc.

**Engagement bait patterns:**
- "Comment X and I'll send you", "Like if you agree", "Repost for reach", "Tag someone who needs this", "Follow for more", "DM me the word", etc.

**First-person experience indicators:**
- "I built", "I shipped", "last quarter we", "at [Company] I", "when I was", "in my experience at", etc.

**Specificity indicators:**
- Dollar amounts, percentages, dates, company names, product names, role titles, specific metrics.

Store as simple string arrays with case-insensitive matching.

### 3. Label Classification Logic

Implement the decision function:

```typescript
function classify(features: TextFeatures, itemType: 'post' | 'comment', thresholds: ClassificationThresholds): {
  primaryLabel: string
  color: string
  confidence: string
  dimensions: Dimensions
  reasons: string[]
}
```

All thresholds live in a configuration object (not hardcoded in the classify function):

```typescript
interface ClassificationThresholds {
  engagementBaitMin: number        // default 0.7
  shortPostMaxChars: number        // default 50
  genericPhraseRatioMin: number    // default 0.5
  listicleScoreMin: number         // default 0.6
  specificNumbersMin: number       // default 2
  specificEntitiesMin: number      // default 2
  shortCommentMaxChars: number     // default 20
  thoughtfulMinChars: number       // default 100
  thoughtfulUniqueWordMin: number  // default 0.6
  questionMinChars: number         // default 30
}
```

**Post classification rules:**

1. If `engagementBaitScore > thresholds.engagementBaitMin` → Engagement Bait (red, high confidence)
2. If `charCount < thresholds.shortPostMaxChars` → Unclear (gray, low confidence)
3. If `genericPhraseRatio > thresholds.genericPhraseRatioMin` and `concreteNumberCount === 0` and `namedEntityCount === 0` → Generic (orange, medium confidence)
4. If `listicleScore > thresholds.listicleScoreMin` and `evidenceCount === 0` → Low Signal (orange, medium confidence)
5. If `concreteNumberCount >= thresholds.specificNumbersMin` or `dateReferenceCount >= 1` and `hasFirstPerson` → Specific (green, medium confidence)
6. If `namedEntityCount >= thresholds.specificEntitiesMin` and `firstPersonCount >= 2` → High Signal (green, medium confidence)
7. If mixed signals → Mixed (yellow, low confidence)
8. Default → Unclear (gray, low confidence)

**Comment classification rules:**

1. If `charCount < thresholds.shortCommentMaxChars` and matches generic praise list → Low Effort (orange, high confidence)
2. If `charCount < 10` → Unclear (gray, low confidence)
3. If matches generic praise pattern → Generic (orange, medium confidence)
4. If `questionCount >= 1` and `charCount > thresholds.questionMinChars` → Question (green, medium confidence)
5. If `concreteNumberCount >= 1` or `namedEntityCount >= 1` → Specific (green, medium confidence)
6. If `charCount > thresholds.thoughtfulMinChars` and `uniqueWordRatio > thresholds.thoughtfulUniqueWordMin` → Thoughtful (green, medium confidence)
7. Default → Unclear (gray, low confidence)

Note: `Repeated` is not a rules engine label. Detecting repeated comments requires cross-comment author comparison which the rules engine does not perform. Gemini can assign `Repeated` when it has sufficient context.

These thresholds are starting points. Tune against the golden set before locking.

### 4. Dimension Scoring

Map features to 0-1 dimension scores:

```typescript
interface Dimensions {
  authenticity: number
  originality: number
  specificity: number
  engagementBait: number
  templating: number
  usefulness: number
}
```

Use simple weighted formulas from extracted features. These are secondary to the primary label.

### 5. Explanation Generation

Generate 2-3 concise reasons for the label:

```typescript
function generateReasons(features: TextFeatures, label: string): string[]
```

Examples:
- "Uses broad motivational language with no specific example."
- "Includes concrete numbers and a named company."
- "Comment is short praise without additional context."
- "Post contains a specific personal sequence of events."

Reasons should be factual (citing what was detected), not accusatory.

### 6. Full Scoring Function

Compose everything into the public API:

```typescript
function scoreWithRules(item: ExtractedItem): ScoringResult
```

Returns the full `ScoringResult` shape with `source: 'rules'` and current `scoringVersion`.

### 7. Golden Set Creation

Create a test fixture file with 100+ items:

- 30+ posts (mix of high signal, generic, engagement bait, mixed, unclear).
- 30+ comments (mix of thoughtful, generic, low effort, questions, unclear).
- 40+ edge cases (very short, very long, non-English, mixed signals, borderline cases).

For each item, record:
- Raw text.
- Expected `primaryLabel`.
- Expected `color`.
- Acceptable alternative labels (for borderline cases).

### 8. Golden Set Test Runner

Implement a test that:
- Runs `scoreWithRules()` on every golden set item.
- Compares output label to expected label.
- Reports agreement rate.
- Fails if agreement is below 80%.
- Reports which items disagree for debugging.

Run on every build.

### 9. Scoring Version

- Export a `RULES_SCORING_VERSION: number` constant.
- Increment whenever classification logic or thresholds change.
- Include in every `ScoringResult` output.

## Verification

- [ ] `extractFeatures()` produces correct features for 10+ known text samples.
- [ ] `classify()` returns correct labels for obvious cases (engagement bait, generic praise, specific posts).
- [ ] `generateReasons()` produces coherent, non-empty reasons for all labels.
- [ ] `scoreWithRules()` returns a valid `ScoringResult` matching the contract shape.
- [ ] Golden set passes with 80%+ agreement.
- [ ] All scoring is synchronous (no async, no network).
- [ ] Edge cases (empty string, single character, 10,000+ chars) do not crash.

## Duration Estimate

4-5 days.
