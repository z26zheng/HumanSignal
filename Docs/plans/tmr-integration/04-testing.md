# 04 -- TMR Detector Integration: Testing

**Revised:** 2026-05-14
**Status:** Draft
**Depends on:** 02-implementation
**Blocks:** None

## Unit Tests

### Score Combiner (`score-combiner.test.ts`)

Pure function — test every path:

```typescript
describe('combineScores', () => {
  it('returns rules label for engagement bait regardless of TMR', () => {
    // rulesLabel: 'almost-certainly-ai', tmrAiProbability: 0.1 (human)
    // Expected: 'almost-certainly-ai' (rules override)
  });

  it('returns rules label for short text under 100 chars', () => {
    // charCount: 80, rulesLabel: 'cant-tell', tmrAiProbability: 0.9
    // Expected: 'cant-tell' (short text override)
  });

  it('returns rules label when both engines agree on direction', () => {
    // rulesLabel: 'feels-human', tmrAiProbability: 0.1
    // Expected: 'feels-human', confidence boosted
  });

  it('returns feels-human when TMR strongly signals human on a post', () => {
    // charCount: 500, itemType: 'post', tmrAiProbability: 0.10, rulesLabel: 'possibly-ai'
    // Expected: 'feels-human'
  });

  it('returns likely-ai when TMR strongly signals AI on a post', () => {
    // charCount: 500, itemType: 'post', tmrAiProbability: 0.90, rulesLabel: 'possibly-ai'
    // Expected: 'likely-ai'
  });

  it('returns rules label for comments even when TMR disagrees', () => {
    // itemType: 'comment', tmrAiProbability: 0.05, rulesLabel: 'likely-ai'
    // Expected: 'likely-ai' (TMR doesn't override on comments)
  });

  it('returns rules label when TMR disagrees moderately', () => {
    // tmrAiProbability: 0.60, rulesLabel: 'feels-human'
    // Expected: 'feels-human' (TMR not strong enough to override)
  });

  it('boosts confidence when engines agree', () => {
    // rulesConfidence: 'medium', agreement
    // Expected: confidence: 'high'
  });

  it('lowers confidence when engines disagree', () => {
    // rulesConfidence: 'medium', disagreement
    // Expected: confidence: 'low'
  });
});
```

### TMR Service (`tmr-service.test.ts`)

```typescript
describe('TmrService', () => {
  it('reports not loaded before initialization', () => {
    // getStatus().isLoaded should be false
  });

  it('classifies text and returns probability between 0 and 1', () => {
    // Mock Transformers.js pipeline, verify aiProbability is clamped
  });

  it('returns error status when model fails to load', () => {
    // Mock pipeline creation failure, verify errorMessage is set
  });

  it('clamps out-of-range probabilities', () => {
    // Mock pipeline returning probability > 1 or < 0
  });
});
```

## Regression Tests

These existing tests must pass unchanged:

| Test file | What it covers | Why it matters |
|-----------|---------------|---------------|
| `rules-engine.test.ts` | Rules scoring accuracy on golden set | Rules engine is not touched |
| `scoring-coordinator.test.ts` | Cache, queue, mode management | Core scoring pipeline |
| `messaging.test.ts` | Message creation, validation, send/receive | New message types must integrate cleanly |
| `overlay.test.ts` | Sticker rendering, registry, failure handling | Sticker update path used by TMR results |
| `gemini-service.test.ts` | Gemini session, validation, repair | Gemini is not touched |

## Integration Tests

### Scoring pipeline end-to-end

```typescript
describe('TMR integration', () => {
  it('returns rules result immediately, then combined result after TMR', () => {
    // Mock offscreen TMR response
    // Verify: first result has source: 'rules', second has source: 'combined'
  });

  it('falls back to rules-only when TMR is unavailable', () => {
    // TMR service returns error
    // Verify: result has source: 'rules', no combined result sent
  });

  it('uses rules override for engagement bait even when TMR is available', () => {
    // Engagement bait text, TMR returns low AI probability
    // Verify: combined label is still 'almost-certainly-ai'
  });

  it('shows upgrade transition animation for combined results', () => {
    // Mock offscreen TMR response with source: 'combined'
    // Verify: sticker enters 'ai-enhancing' state before updating to final label
    // (Tests the isAiUpgrade check includes 'combined')
  });

  it('caches combined result with correct scoring version', () => {
    // TMR returns result that changes label
    // Verify: cache stores result with scoringVersion: 'combined-tmr-q4-1'
    // Verify: next lookup with that version returns the cached combined result
  });

  it('processes TMR requests sequentially, not in parallel', () => {
    // Send 5 items simultaneously
    // Verify: sendToOffscreen called once at a time, not 5 times concurrently
  });
});
```

### Build verification

```bash
# Verify WASM files are emitted correctly
pnpm build
ls .output/chrome-mv3/  # Should contain WASM assets from ONNX Runtime
```

## Manual Test Script

1. Build extension: `pnpm build`
2. Load in Chrome as unpacked extension
3. Open popup → "AI Detection Model" should show "Not enabled"
4. Click "Enable" → model downloads (~68 MB), progress bar shows
5. After download: status shows "Ready"
6. Open LinkedIn feed
7. Scroll through posts → stickers should appear:
   - Rules label first (instant)
   - Combined label shortly after (~113ms, may or may not change)
8. Test engagement bait post → should always show `almost-certainly-ai`
9. Test short comment → should show rules label, no TMR override
10. Test long human post with metrics → should show `feels-human` with high confidence
11. Open Chrome Task Manager → check offscreen document memory usage
12. Disable TMR in popup → stickers should revert to rules-only behavior

## Edge Case Matrix

| Scenario | Expected behavior |
|----------|------------------|
| TMR model not downloaded | Rules-only scoring. No errors. Popup shows "Not enabled." |
| TMR download fails mid-way | Error status in popup. Rules-only continues. Retry button available. |
| TMR inference errors on one item | Rules result for that item. Other items unaffected. Error logged. |
| Offscreen document killed by Chrome | Service worker recreates it. TMR model needs re-download from cache. |
| Very long text (>6000 chars) | TMR's RoBERTa tokenizer truncates to 512 tokens (~2000 chars). Inputs >2000 chars may lose signal from later paragraphs. Verify behavior in manual testing. Consider pre-truncating in `TmrService.classify` to match the tokenizer limit. Rules feature extraction runs on the full text separately. |
| Empty text | Rules returns `cant-tell`. TMR not invoked (charCount < 100). |
| Non-English text | Rules returns `cant-tell`. TMR result ignored (short text or rules override). |
| Service worker restarts mid-TMR-inference | TMR request lost. Content script resends pending scores. |
| Both TMR and Gemini active simultaneously | Both run in offscreen document. Results arrive independently. Gemini provides explanation, TMR provides detection signal. |
| Extension update with new combiner version | Cached `combined-tmr-q4-1` results invalidated. Fresh scoring on next load. |
