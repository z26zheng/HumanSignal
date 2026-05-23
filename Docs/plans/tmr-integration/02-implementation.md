# 02 -- TMR Detector Integration: Implementation

**Revised:** 2026-05-14
**Status:** Draft
**Depends on:** 00-overview, 01-protocol
**Blocks:** 04-testing

## Changes

### 1. New module: `src/tmr/tmr-service.ts`

Handles model loading, inference, and status. Runs inside the offscreen document.

```typescript
export class TmrService {
  private pipeline: TmrPipeline | null = null;
  private loading: boolean = false;
  private errorMessage: string | null = null;

  async initialize(): Promise<TmrStatus>;
  async classify(text: string): Promise<TmrClassifyResult>;
  getStatus(): TmrStatus;
}
```

Uses `@huggingface/transformers` pipeline API with the **bundled** model (loaded from `public/models/tmr-ai-text-detector/`):

```typescript
import { pipeline } from '@huggingface/transformers';

const modelPath = chrome.runtime.getURL('models/tmr-ai-text-detector/');
this.pipeline = await pipeline(
  'text-classification',
  modelPath,
  { dtype: 'q4', local_files_only: true }
);
```

The model files are bundled in `public/models/tmr-ai-text-detector/` (WXT copies `public/` to the build output). No runtime download from HuggingFace is needed.

### 2. New module: `src/tmr/index.ts`

```typescript
export { TmrService } from '@/tmr/tmr-service';
export type { TmrStatus, TmrClassifyResult } from '@/tmr/tmr-service';
```

### 3. New module: `src/scoring-coordinator/score-combiner.ts`

Pure function implementing Strategy A. No side effects, fully testable.

```typescript
export function combineScores(input: CombinerInput): CombinerOutput;
```

Implementation follows the protocol in `01-protocol.md`:
- Rules override for engagement bait and short text.
- TMR adjusts label only when it strongly disagrees and text is long enough.
- Confidence boosted on agreement, lowered on disagreement.

### 4. Modify: `src/shared/types.ts`

```typescript
// Add to ScoringSource
export type ScoringSource = 'rules' | 'gemini' | 'tmr' | 'combined' | 'system';

// Add optional reasons array to ScoringResult
export interface ScoringResult {
  // ... existing fields ...
  readonly reasons?: readonly string[];  // raw reason strings, not joined into explanation
}
```

### 4b. Modify: `src/rules-engine/rules-engine.ts`

Preserve the raw reasons array on the scoring result:

```typescript
return {
  // ... existing fields ...
  explanation: classification.reasons.join(' '),
  reasons: classification.reasons,   // <-- add this line
};
```

This avoids the fragile `explanation.split('. ')` pattern in the combiner. The `reasons` field is optional so existing code that doesn't use it is unaffected.

### 5. Modify: `src/shared/messaging.ts`

Add to `KNOWN_MESSAGE_TYPES`:

```typescript
'TMR_CLASSIFY', 'TMR_CLASSIFY_RESULT', 'TMR_STATUS', 'TMR_STATUS_RESULT', 'TMR_LOAD_MODEL',
```

Add corresponding message interfaces and payload types to the union types.

### 6. Modify: `src/entrypoints/offscreen/main.ts`

Import and instantiate `TmrService`. Add message handlers:

```typescript
import { TmrService } from '@/tmr';

const tmrService: TmrService = new TmrService();

// In handleOffscreenMessage switch:
case 'TMR_CLASSIFY':
  const tmrResult = await tmrService.classify(message.text);
  return { type: 'TMR_CLASSIFY_RESULT', itemId: message.itemId, ...tmrResult };

case 'TMR_STATUS':
  return { type: 'TMR_STATUS_RESULT', ...tmrService.getStatus() };

case 'TMR_LOAD_MODEL':
  return { type: 'TMR_STATUS_RESULT', ...await tmrService.initialize() };
```

TMR initialization is lazy (triggered by first `TMR_LOAD_MODEL` or `TMR_CLASSIFY`), unlike Gemini which warm-ups eagerly.

### 7. Modify: `src/scoring-coordinator/scoring-coordinator.ts`

After rules scoring, if TMR is available, enqueue the item for sequential TMR classification:

```typescript
// After line 86 (rules result pushed to results array):

if (this.isTmrAvailable()) {
  this.tmrQueue.enqueue({ item, rulesResult, tabId });
  void this.processTmrQueue();
}
```

TMR uses a sequential queue with a processing guard, matching the existing Gemini queue pattern. This prevents unbounded parallel `sendToOffscreen` calls — ONNX Runtime inference is single-threaded on WASM, so concurrent requests would serialize at the model level but waste memory for pending promises.

```typescript
private isTmrProcessing: boolean = false;
private readonly tmrQueue: TmrQueueItem[] = [];

private async processTmrQueue(): Promise<void> {
  if (this.isTmrProcessing) return;
  this.isTmrProcessing = true;

  try {
    while (this.tmrQueue.length > 0) {
      const queueItem = this.tmrQueue.shift();
      if (queueItem === undefined) break;
      await this.classifyWithTmr(queueItem);
    }
  } finally {
    this.isTmrProcessing = false;
  }
}

private async classifyWithTmr(
  { item, rulesResult, tabId }: TmrQueueItem,
): Promise<void> {
  const tmrResponse = await sendToOffscreen({
    type: 'TMR_CLASSIFY',
    source: 'background',
    itemId: item.itemId,
    text: item.text,
  });

  if (!tmrResponse.ok || tmrResponse.payload.type !== 'TMR_CLASSIFY_RESULT') {
    return; // TMR failed — rules result stands
  }

  const combined = combineScores({
    text: item.text,
    itemType: item.itemType,
    charCount: item.text.length,
    rulesLabel: rulesResult.label,
    rulesConfidence: rulesResult.confidence,
    rulesDimensions: rulesResult.dimensions,
    rulesReasons: rulesResult.reasons ?? [rulesResult.explanation],
    tmrAiProbability: tmrResponse.payload.aiProbability,
  });

  // Update cache and notify tab when label OR confidence changes
    if (combined.label !== rulesResult.label || combined.confidence !== rulesResult.confidence) {
    const updatedResult: ScoringResult = {
      ...rulesResult,
      label: combined.label,
      confidence: combined.confidence,
      source: 'combined',
      scoringVersion: 'combined-tmr-q4-1',
    };
    await this.cache.set(item.metadata.contentHash, updatedResult);
    if (tabId !== null) {
      await this.sendResultToTab(tabId, updatedResult);
    }
  }
}
```

#### TMR availability wiring (critical)

`processTmrQueue` only runs when `tmrAvailable === true`. The background script must observe TMR-related responses and update the coordinator. Add to `forwardToOffscreen` in `background.ts`:

```typescript
if (response.payload.type === 'TMR_STATUS_RESULT') {
  scoringCoordinator.setTmrAvailable(response.payload.isLoaded);
}

if (response.payload.type === 'TMR_CLASSIFY_RESULT') {
  scoringCoordinator.setTmrAvailable(true);
}
```

Without this wiring, `tmrAvailable` stays `false` forever and the TMR queue is dead code. Triggers:
- Popup polls `TMR_STATUS` periodically → coordinator learns when the offscreen reports `isLoaded: true`.
- User clicks "Enable" in popup → `TMR_LOAD_MODEL` succeeds → `TMR_STATUS_RESULT` with `isLoaded: true` → coordinator flips the flag.
- Any successful `TMR_CLASSIFY_RESULT` is a defensive backstop (TMR is provably alive).

### 8. Modify: `src/overlay/overlay-controller.ts`

Extend the `isAiUpgrade` check to include combined TMR results. Without this, combined results update the label but skip the smooth transition animation, making the change look like a rendering glitch.

```typescript
// Change line 141 from:
const isAiUpgrade: boolean = entry.score !== null && result.source === 'gemini';

// To:
const isAiUpgrade: boolean = entry.score !== null &&
  (result.source === 'gemini' || result.source === 'combined');
```

### 9. Modify: `src/background/offscreen-lifecycle.ts`

Add `WORKERS` reason for ONNX Runtime WASM:

```typescript
reasons: [browser.offscreen.Reason.LOCAL_STORAGE, browser.offscreen.Reason.WORKERS],
```

### 10. Modify: `wxt.config.ts`

```typescript
manifest: {
  permissions: ['storage', 'offscreen', 'activeTab'],
  host_permissions: [
    'https://www.linkedin.com/*',
    'https://huggingface.co/*',
  ],
  content_security_policy: {
    extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'",
  },
},
```

### 11. Modify: `package.json`

```bash
pnpm add @huggingface/transformers
```

### 12. Modify: `src/entrypoints/popup/App.tsx`

Add TMR model status section to the "Enhanced analysis" panel. The popup is Preact-based (see `wxt.config.ts` `@preact/preset-vite`); the JSX below uses `className` (Preact-compatible). `tmrStatus` is local state populated by sending `TMR_STATUS` via `sendToBackground` and reading the `TMR_STATUS_RESULT` payload directly — no separate helper module is required.

```tsx
<section className="panel">
  <h2>AI Detection Model</h2>
  <p className="status-value">
    {tmrStatus.isLoaded ? 'Ready' :
     tmrStatus.isLoading ? 'Downloading…' :
     tmrStatus.errorMessage !== null ? `Error: ${tmrStatus.errorMessage}` :
     'Not enabled'}
  </p>
  {tmrStatus.isLoading && tmrStatus.downloadProgress !== null ? (
    <progress value={tmrStatus.downloadProgress} max={100} />
  ) : null}
  {!tmrStatus.isLoaded && !tmrStatus.isLoading ? (
    <button onClick={(): void => { void sendToBackground({ type: 'TMR_LOAD_MODEL', source: 'popup' }); }}>
      Enable
    </button>
  ) : null}
  <p className="muted">68 MB download. Runs locally for AI detection.</p>
</section>
```

### 13. Vite/WXT build verification

Build verification is required early. Run `wxt build`, load in Chrome, attempt TMR initialization. If WASM files are missing from the output, investigate `vite-plugin-wasm` or manual asset copying. This is a known risk (see 00-overview Risk Assessment).

Do not commit speculative Vite config. Test empirically first, then add only the configuration that's needed.

## Files Changed vs Not Changed

| File | Changed? | What |
|------|----------|------|
| `src/tmr/tmr-service.ts` | New | TMR model loading, inference, status |
| `src/tmr/index.ts` | New | Module exports |
| `src/scoring-coordinator/score-combiner.ts` | New | Strategy A combiner logic |
| `src/shared/types.ts` | Modified | `ScoringSource` extended, optional `reasons` field on `ScoringResult` |
| `src/shared/messaging.ts` | Modified | 5 new message type strings in `KNOWN_MESSAGE_TYPES` |
| `src/shared/message-types.ts` | Modified | TMR message interfaces + payload types in union types |
| `src/rules-engine/rules-engine.ts` | Modified | Populate `reasons` field on `ScoringResult` from `classification.reasons` |
| `src/entrypoints/offscreen/main.ts` | Modified | TMR service instantiation + 3 message handlers |
| `src/scoring-coordinator/scoring-coordinator.ts` | Modified | TMR queue, sequential processing, combiner integration |
| `src/entrypoints/background.ts` | Modified | `forwardToOffscreen` observes `TMR_STATUS_RESULT`/`TMR_CLASSIFY_RESULT` and calls `coordinator.setTmrAvailable(...)` |
| `src/overlay/overlay-controller.ts` | Modified | Extend `isAiUpgrade` to include `source: 'combined'` |
| `src/background/offscreen-lifecycle.ts` | Modified | Add `WORKERS` reason |
| `wxt.config.ts` | Modified | CSP + host_permissions |
| `package.json` | Modified | `@huggingface/transformers` dependency |
| `src/entrypoints/popup/App.tsx` | Modified | TMR status section |
| `src/gemini/*` | Not changed | Gemini stays as-is |
| `src/linkedin-adapter/*` | Not changed | |

## Key Decisions

1. **TMR loads eagerly on offscreen startup.** The model is bundled with the extension (~202 MB Q4 ONNX), so initialization is a local WASM compile, not a network download. TMR initializes in parallel with Gemini warm-up.

2. **TMR runs async, same pattern as Gemini.** The scoring coordinator returns rules results immediately and upgrades with TMR asynchronously. This preserves the existing "show fast, upgrade later" UX pattern.

3. **Strategy A (rules override + TMR weighted) is the combiner.** Chosen because it preserves the rules engine's 98% accuracy on known patterns while adding TMR's strength on unknown content.

4. **Q4 quantization variant.** Best size/speed tradeoff from the spike: ~202 MB bundled, ~113ms inference.

5. **Model bundled with extension, not downloaded at runtime.** Eliminates the HuggingFace download, removes the `huggingface.co` host permission, and makes TMR available instantly. Extension package size is ~240 MB (within Chrome Web Store's ~500 MB limit).

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|-----------|
| `wasm-unsafe-eval` CSP rejected by Chrome Web Store | Blocks distribution | Test with Chrome Web Store review early. The Slop Detector extension uses the same CSP and is published. |
| ONNX Runtime WASM files don't bundle correctly with WXT/Vite | Blocks build | Test `wxt build` early. May need Vite plugin or manual asset copy. |
| Combined memory (TMR + Gemini) exceeds device limits | Offscreen crashes on low-RAM devices | Monitor memory. Can defer Gemini when TMR is active. |
| Extension package size (~240 MB) slows initial install | User experience on slow connections | Well within Chrome Web Store ~500 MB limit. One-time cost; model is instantly available after install. |
| TMR model accuracy degrades on LinkedIn content not in RAID | Lower accuracy than expected | Rules engine remains the safety net. Combiner only lets TMR override on high-confidence signals. |
