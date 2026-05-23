# 01 -- TMR Detector Integration: Protocol

**Revised:** 2026-05-14
**Status:** Draft
**Depends on:** 00-overview
**Blocks:** 02-implementation

## Message Types

### TMR_CLASSIFY

Sent from background (scoring coordinator) to offscreen document.

```typescript
interface TmrClassifyMessage extends BaseMessage {
  readonly type: 'TMR_CLASSIFY';
  readonly itemId: ItemId;
  readonly text: string;
}
```

### TMR_CLASSIFY_RESULT

Response payload from offscreen to background.

```typescript
interface TmrClassifyResultPayload {
  readonly type: 'TMR_CLASSIFY_RESULT';
  readonly itemId: ItemId;
  readonly aiProbability: number;   // 0.0 (human) to 1.0 (AI)
  readonly latencyMs: number;
}
```

### TMR_STATUS

Request TMR model status from any context.

```typescript
interface TmrStatusMessage extends BaseMessage {
  readonly type: 'TMR_STATUS';
}
```

### TMR_STATUS_RESULT

Response payload.

```typescript
interface TmrStatusResultPayload {
  readonly type: 'TMR_STATUS_RESULT';
  readonly isLoaded: boolean;
  readonly isLoading: boolean;
  readonly downloadProgress: number | null;
  readonly errorMessage: string | null;
}
```

### TMR_LOAD_MODEL

Trigger model download from popup.

```typescript
interface TmrLoadModelMessage extends BaseMessage {
  readonly type: 'TMR_LOAD_MODEL';
}
```

## Scoring Result Changes

```typescript
// types.ts — extend ScoringSource
export type ScoringSource = 'rules' | 'gemini' | 'tmr' | 'combined' | 'system';
```

When the score combiner produces a result, `source` is `'combined'`. The individual engine contributions are recorded in trace events.

## Score Combiner Contract

```typescript
interface CombinerInput {
  readonly text: string;
  readonly itemType: 'post' | 'comment';
  readonly charCount: number;
  readonly rulesLabel: ScoringLabel;
  readonly rulesConfidence: ConfidenceLabel;
  readonly rulesDimensions: ScoreDimensions;
  readonly rulesReasons: readonly string[];
  readonly tmrAiProbability: number;
}

interface CombinerOutput {
  readonly label: ScoringLabel;
  readonly confidence: ConfidenceLabel;
  readonly source: 'combined';
  readonly scoringVersion: string;
}
```

## Combiner Logic: Strategy A (Rules Override + TMR Weighted)

The combiner evaluates rules in order; the first rule that matches determines the output. `rulesDirection` is `'human'` for `feels-human`, `'ai'` for `likely-ai`/`almost-certainly-ai`, and `'neutral'` for `cant-tell`/`possibly-ai`/`unavailable`. `tmrDirection` is `'human'` if `P(AI) < 0.5`, otherwise `'ai'`.

```
0. If itemType is 'comment'
   → label stays as rulesLabel (TMR is unreliable on short comments)
   → if rulesDirection === tmrDirection: boost confidence one step
   → otherwise: leave confidence unchanged
   (we never LOWER confidence on a comment because the spike showed TMR
    misclassifies human comments as AI; lowering would erode correct labels)

1. If rulesLabel is 'almost-certainly-ai' (engagement bait)
   → return rulesLabel with rulesConfidence (rules override — TMR cannot detect bait)

2. If charCount < 100
   → return rulesLabel with rulesConfidence (TMR unreliable below this length)

3. If rulesDirection === tmrDirection (engines agree on direction)
   → return rulesLabel
   → boost confidence one step
   (note: rulesDirection 'neutral' never equals tmrDirection, so neutral rules
    never hit this branch and never have confidence boosted on TMR agreement.)

4. If TMR strongly signals human (P(AI) < 0.15) AND rulesDirection !== tmrDirection
   → return 'feels-human' with confidence 'medium' (TMR override)
   (fires for rulesDirection of 'ai' OR 'neutral'.)

5. If TMR strongly signals AI (P(AI) > 0.85) AND rulesDirection !== tmrDirection
   → return 'likely-ai' with confidence 'medium' (TMR override)
   (fires for rulesDirection of 'human' OR 'neutral'.)

6. Moderate disagreement: if rulesDirection !== 'neutral' AND rulesDirection !== tmrDirection
   → return rulesLabel with confidence lowered one step

7. Otherwise (neutral rules + non-strong TMR)
   → return rulesLabel with rulesConfidence unchanged
```

**Why agreement is checked before strong-override:** if the engines agree, the rules label is correct and we want to boost the existing confidence (which may already be `high`). Checking strong-override first would clobber `high` confidence down to the hardcoded `medium` of the override branch, which is the wrong direction on the strongest possible agreement.

**Why neutral rules don't trigger the confidence-lowering branch (step 6):** a neutral label (e.g., `cant-tell`) means rules has no strong opinion. TMR pointing one direction isn't a disagreement worth penalizing — it's TMR providing additional signal that just isn't strong enough to override. If TMR's signal becomes strong, step 4 or 5 will fire.

Direction comparison uses a simple binary at 0.5. The detailed band mapping (0.25, 0.45, 0.70) created an ambiguous zone where moderate TMR scores would register as disagreements with confident rules labels. A simple 0.5 binary avoids this.

## Cache Versioning

| Source | Version string |
|--------|---------------|
| Rules only | `rules-1` (unchanged) |
| Combined (TMR + rules) | `combined-tmr-q4-1` |
| Gemini | `gemini-1` (unchanged) |

When TMR becomes available mid-session, previously cached rules-only results remain valid. New items get combined scoring. Cached combined results are invalidated when the combiner version bumps.

## Error Handling

| Scenario | Recovery |
|----------|---------|
| TMR model fails to download | Rules-only mode. Popup shows error. No degradation in current behavior. |
| TMR inference fails on a specific item | Use rules-only result for that item. Log error. |
| TMR returns out-of-range probability | Clamp to 0.0-1.0. Log warning. |
| Offscreen document crashes | Scoring coordinator falls back to rules-only. Service worker recreates offscreen on next request. |
| WASM fails to initialize | TMR stays unavailable. Rules + Gemini continue. |
