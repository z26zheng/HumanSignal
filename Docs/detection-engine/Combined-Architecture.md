# Combined Detection Architecture

Date: 2026-05-13

**Goal:** Combine three detection engines into a single scoring pipeline that produces accurate, explainable labels on the "Feels Human → Almost Certainly AI" spectrum.

**Based on:** TMR spike results, rules engine codebase audit, Gemini Nano architecture review.

---

## Why Three Engines

No single engine covers the full problem. The TMR spike proved this:

| Content type | TMR | Rules engine | Gemini Nano |
|-------------|-----|-------------|-------------|
| Human posts with specific details | Excellent (0.12-0.21 AI score) | Good (catches first-person + metrics) | Good with prompting |
| Polished AI posts | Good (RAID benchmark) | Weak (misses polished AI without cliches) | Untested at scale |
| Engagement bait | **Fails** (classifies as human) | Excellent (pattern matching) | Good |
| Short generic comments ("Great insights") | Moderate (0.60-0.64 AI) | Excellent (generic phrase detection) | Good |
| Human questions in comments | **Fails** (0.90 AI — misclassified) | Good (question detection) | Good |
| Short/ambiguous text | **Fails** (defaults to AI) | Good (returns `cant-tell`) | Good (with prompting) |
| Hybrid (human + AI polish) | Untested but promising | Weak (no hybrid detection) | Untested |
| Explanations | None — binary/probability only | Reason strings but template-based | Best — generates natural explanations |

Each engine's strengths cover the others' weaknesses.

---

## Architecture

```
LinkedIn post/comment text
        │
        ├──→ TMR Detector (offscreen, ONNX)  →  P(AI): 0.0-1.0
        │         ~113ms, strong on posts, weak on short text
        │
        ├──→ Rules Engine (synchronous)       →  label + dimensions + reasons
        │         <5ms, strong on patterns/bait/short text
        │
        └──→ Gemini Nano (offscreen, async)   →  label + explanation + confidence
                  ~1-3s, strong on nuance/explanations, optional
        │
        ▼
   Score Combiner
        │
        ▼
   Final label + confidence + explanation
```

### Timing

The three engines run at very different speeds. The pipeline uses this:

1. **Rules engine runs first** (synchronous, <5ms). Sticker appears immediately with a rules-based label.
2. **TMR runs second** (~113ms, async). When TMR returns, the combiner re-evaluates. If the combined label differs from rules-only, the sticker updates.
3. **Gemini runs third** (~1-3s, async, optional). When Gemini returns, it provides the explanation. If Gemini disagrees with the combined TMR+rules label, confidence is lowered.

This is the same "show fast, upgrade later" pattern we already use for rules→Gemini. Adding TMR as a middle step means the sticker upgrades faster (113ms vs 1-3s) and with better accuracy on posts.

---

## The Score Combiner

### Inputs

```typescript
interface CombinerInputs {
  text: string;
  itemType: 'post' | 'comment';
  charCount: number;

  // From rules engine (always available)
  rulesLabel: ScoringLabel;
  rulesConfidence: ConfidenceLabel;
  rulesDimensions: ScoreDimensions;
  rulesReasons: readonly string[];

  // From TMR (available after ~113ms)
  tmrAiProbability: number | null;   // 0.0 (human) to 1.0 (AI), null if TMR unavailable

  // From Gemini (available after ~1-3s, optional)
  geminiLabel: ScoringLabel | null;
  geminiConfidence: ConfidenceLabel | null;
  geminiExplanation: string | null;
}
```

### TMR Weight Gate

TMR's biggest failure mode is short text. The combiner must gate TMR's influence by text length:

```typescript
function getTmrWeight(charCount: number, itemType: string): number {
  if (charCount < 50)  return 0.0;   // Too short — TMR defaults to "AI", which is wrong
  if (charCount < 100) return 0.1;   // Low confidence zone
  if (charCount < 200) return 0.3;   // Moderate
  if (itemType === 'comment') return 0.4;  // TMR is weaker on comments
  return 0.6;                        // Full weight on longer posts
}
```

### Rules Override Gate

Rules engine has hard-override authority for patterns TMR cannot detect:

```typescript
function shouldRulesOverride(rulesLabel: ScoringLabel): boolean {
  // Engagement bait is a pattern, not a writing style — TMR can't see it
  if (rulesLabel === 'almost-certainly-ai' && isEngagementBait) return true;

  // Very short text — rules says cant-tell, trust it regardless of TMR
  if (rulesLabel === 'cant-tell') return true;

  return false;
}
```

When rules override fires, the combiner skips TMR and uses the rules label directly.

### Combined Score Calculation

When no override applies:

```typescript
// TMR score: 0.0 = human, 1.0 = AI
// Map to same direction as rules: -1 = human, +1 = AI
const tmrSignal: number = (tmrAiProbability - 0.5) * 2;  // maps 0.0→-1.0, 0.5→0.0, 1.0→+1.0

// Rules dimensions already encode human vs AI signals
const rulesSignal: number =
  (rulesDimensions.engagementBait + rulesDimensions.templating) -
  (rulesDimensions.authenticity + rulesDimensions.specificity);
  // roughly -2.0 (very human) to +2.0 (very AI), normalize to -1..+1

const tmrWeight: number = getTmrWeight(charCount, itemType);
const rulesWeight: number = 1.0 - tmrWeight;

const combinedScore: number = tmrWeight * tmrSignal + rulesWeight * normalize(rulesSignal);
```

### Score → Label Mapping

| Combined score | Label | Confidence |
|---------------|-------|-----------|
| < -0.4 | `feels-human` | high if TMR < 0.2 and rules agrees |
| -0.4 to -0.1 | `feels-human` | medium |
| -0.1 to 0.1 | `possibly-ai` | low |
| 0.1 to 0.4 | `likely-ai` | medium |
| > 0.4 | `almost-certainly-ai` | high if TMR > 0.8 and rules agrees |

### Confidence Boosting and Lowering

```
If TMR and rules agree on direction → boost confidence one level
If TMR and rules disagree on direction → lower confidence one level
If Gemini available and disagrees with combined label → lower confidence one level
If all three agree → high confidence regardless of individual levels
```

### Explanation Assembly

The explanation shown to the user comes from the best available source:

1. **Gemini explanation** if available — most natural, context-aware.
2. **Rules reasons** as fallback — template-based but always available.
3. **TMR probability** supplements but never provides the explanation text. It's referenced as: "On-device analysis confidence: 82% human" in the explanation details.

---

## Scoring Pipeline Flow

### When TMR is available (model downloaded)

```
1. Item arrives from content script
2. Check cache → if hit, return cached result
3. Rules engine scores (sync, <5ms) → return rules result immediately to sticker
4. TMR classifies (async, ~113ms) → combiner produces combined label
   → if combined label ≠ rules label, send updated result to sticker
5. If Gemini mode: queue for Gemini (async, ~1-3s)
   → Gemini returns explanation + optional label override
   → if combined label changes, send updated result to sticker
6. Cache the final result
```

### When TMR is not available (model not downloaded)

```
1-3. Same as above
4. Skip TMR. Rules result stands alone.
5. If Gemini mode: same as above
```

The pipeline degrades gracefully. TMR is an enhancement, not a dependency.

---

## Integration Changes

### Type System

```typescript
// types.ts
export type ScoringSource = 'rules' | 'gemini' | 'tmr' | 'combined' | 'system';
```

`'combined'` is the new primary source when multiple engines contribute. The `ScoringResult` stores `source: 'combined'` and individual engine contributions are tracked in trace events.

### New Module: Score Combiner

```
src/scoring-coordinator/score-combiner.ts
```

Pure function, no side effects, fully testable:

```typescript
export function combineScores(inputs: CombinerInputs): CombinedResult {
  // ... weight gate, override gate, score calculation, label mapping, confidence
}

export interface CombinedResult {
  label: ScoringLabel;
  confidence: ConfidenceLabel;
  explanation: string;
  source: 'combined';
  tmrContribution: { probability: number; weight: number } | null;
  rulesContribution: { label: ScoringLabel; weight: number };
  geminiContribution: { label: ScoringLabel; explanation: string } | null;
}
```

### New Module: TMR Service

```
src/tmr/tmr-service.ts
src/tmr/index.ts
```

Handles model loading, classification requests, and health status. Mirrors `GeminiService` pattern:

```typescript
export class TmrService {
  async initialize(): Promise<TmrStatus>;
  async classify(text: string): Promise<TmrResult>;
  async getStatus(): Promise<TmrStatus>;
  async destroyModel(): Promise<void>;
}

export interface TmrResult {
  aiProbability: number;   // 0.0 (human) to 1.0 (AI)
  latencyMs: number;
}

export interface TmrStatus {
  isLoaded: boolean;
  isLoading: boolean;
  downloadProgress: number | null;
  modelSizeBytes: number | null;
  errorMessage: string | null;
}
```

### Messaging Changes

New message types to add to `KNOWN_MESSAGE_TYPES` and the message union:

| Message | Direction | Payload |
|---------|-----------|---------|
| `TMR_CLASSIFY` | background → offscreen | `{ text: string, itemId: ItemId }` |
| `TMR_RESULT` | offscreen → background | `{ itemId: ItemId, aiProbability: number, latencyMs: number }` |
| `TMR_STATUS` | any → background | Request TMR model status |
| `TMR_STATUS_RESULT` | background → any | `TmrStatus` |
| `TMR_LOAD_MODEL` | popup → background | Trigger model download |

### Offscreen Document Changes

The offscreen document hosts both Gemini Nano and TMR. They share the document but use separate runtimes (Chrome Prompt API vs ONNX Runtime Web).

```typescript
// offscreen/main.ts additions
import { TmrService } from '@/tmr';

const tmrService: TmrService = new TmrService();

// In message handler, add:
case 'TMR_CLASSIFY':
  const tmrResult = await tmrService.classify(message.text);
  return { type: 'TMR_RESULT', ...tmrResult };

case 'TMR_STATUS':
  return { type: 'TMR_STATUS_RESULT', status: await tmrService.getStatus() };

case 'TMR_LOAD_MODEL':
  return { type: 'TMR_STATUS_RESULT', status: await tmrService.initialize() };
```

### Scoring Coordinator Changes

The scoring coordinator gains a TMR step between rules and Gemini:

```typescript
// In handleScoreBatch, after rules scoring:

// If TMR is loaded, request classification
if (tmrAvailable) {
  const tmrResponse = await sendToOffscreen({ type: 'TMR_CLASSIFY', text: item.text, itemId: item.itemId });
  if (tmrResponse.ok && tmrResponse.payload.type === 'TMR_RESULT') {
    const combined = combineScores({
      ...rulesInputs,
      tmrAiProbability: tmrResponse.payload.aiProbability,
    });
    // If combined label differs from rules label, send update to content script
  }
}
```

### WXT Config Changes

```typescript
// wxt.config.ts
export default defineConfig({
  manifest: {
    permissions: ['storage', 'offscreen', 'activeTab'],
    host_permissions: [
      'https://www.linkedin.com/*',
      'https://huggingface.co/*',       // if runtime download chosen
    ],
    content_security_policy: {
      extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'",
    },
  },
});
```

### Dependencies

```
pnpm add @huggingface/transformers
```

Verify WASM files are emitted as separate assets by `wxt build`, not inlined by Vite.

### Offscreen Reason

May need to add `WORKERS` to the offscreen reasons array:

```typescript
// offscreen-lifecycle.ts
reasons: [browser.offscreen.Reason.LOCAL_STORAGE, browser.offscreen.Reason.WORKERS],
```

Test which reasons ONNX Runtime requires.

---

## Popup UX Changes

The popup's "Enhanced analysis" section needs to account for two models:

```
┌─────────────────────────────────────┐
│  Enhanced analysis                  │
│                                     │
│  AI Detection Model                 │
│  Status: Active (Q4, 68 MB)         │
│                                     │
│  On-Device Explanations             │
│  Status: Not enabled                │
│  [Enable]                           │
│                                     │
└─────────────────────────────────────┘
```

TMR is the "AI Detection Model" — always loaded if available, provides the detection signal.
Gemini Nano is "On-Device Explanations" — optional, provides richer explanations.

Users don't need to understand the architecture. They see two capabilities with independent status.

---

## Cache Versioning

Each scoring source needs its own version:

| Source | Version key | Bump when |
|--------|------------|-----------|
| Rules | `rules-1` | Rules engine logic changes |
| TMR | `tmr-q4-1` | Model variant or combiner weights change |
| Combined | `combined-1` | Combiner logic, weights, or any engine changes |
| Gemini | `gemini-2` | Gemini prompt changes |

Cache lookup should match the current active version. When TMR becomes available mid-session, previously cached rules-only results should be re-scored through the combiner (not invalidated — the rules component is still valid, TMR just adds signal).

---

## Testing Strategy

### Score Combiner (unit tests)

Pure function — test every path:

- TMR weight gate by text length
- Rules override for engagement bait
- Rules override for short text
- Score calculation with various TMR + rules combinations
- Confidence boosting when engines agree
- Confidence lowering when engines disagree
- Label boundary edge cases
- Null TMR (model unavailable)
- Null Gemini (not enabled)

### Integration Tests

- Full pipeline: item → rules → TMR → combiner → sticker update
- Graceful degradation: TMR unavailable → rules-only pipeline still works
- Graceful degradation: Gemini unavailable → TMR + rules still works
- Cache behavior across scoring source changes
- Sticker update timing: rules label appears first, then combined label after ~113ms

### Golden Set Regression

Run the full 112-item golden set through the combined pipeline. Compare:

- Combined accuracy vs rules-only accuracy
- Combined accuracy vs TMR-only accuracy
- How often the combiner overrides rules
- How often the combiner overrides TMR
- Sticker flicker rate (how often the label changes between rules and combined)

---

## Delivery Sequence

| Step | What | Depends on |
|------|------|-----------|
| 1 | Bundle `@huggingface/transformers` with WXT/Vite, verify WASM assets | Nothing |
| 2 | Implement `TmrService` in offscreen document | Step 1 |
| 3 | Add TMR message types to messaging layer | Nothing (can parallel) |
| 4 | Implement `combineScores()` with full unit tests | Nothing (can parallel) |
| 5 | Wire TMR into scoring coordinator pipeline | Steps 2, 3, 4 |
| 6 | Update popup for dual-model status | Step 2 |
| 7 | Run golden set regression, tune combiner weights | Step 5 |
| 8 | Update cache versioning for combined source | Step 5 |

Steps 1, 3, and 4 can run in parallel. Total: ~2-3 weeks for one developer.

---

## Open Questions

1. **Should TMR model download be automatic or user-initiated?** Gemini Nano requires user action. TMR is smaller (68 MB vs 2+ GB) — auto-download on first install may be acceptable.
2. **Memory budget for offscreen document?** TMR + Gemini Nano in one process. What's the ceiling before Chrome kills the offscreen document?
3. **Should the combiner weights be configurable by the user?** The "Sensitivity" slider in the popup could map to combiner weight profiles (Relaxed = trust TMR more, Strict = trust rules more).
4. **What happens when TMR and rules strongly disagree?** E.g., TMR says 0.15 AI (very human) but rules says `likely-ai` (generic cliches). The combiner produces `possibly-ai` — is that the right answer, or should one engine win?
