# 00 -- TMR Detector Integration: Overview and Architecture

**Revised:** 2026-05-14
**Status:** Draft
**Depends on:** None
**Blocks:** 01-protocol, 02-implementation

## Goal

Replace the rules-based engine as the primary AI detection signal with the TMR AI Text Detector (RoBERTa ONNX, 125M params, via Transformers.js). The rules engine is retained as a safety net for TMR's known failure modes. Gemini Nano continues to provide explanations only.

## Context

The combined scoring spike produced these results on 104 of the 112 golden set items (8 items excluded where TMR scores were unavailable from the spike):

| Strategy | Acceptable accuracy | Flicker rate | FP on human |
|----------|-------------------|-------------|-------------|
| Rules only (baseline) | 98.1% | 0% | 0 |
| TMR only | 36.5% | 61.5% | 20 |
| Strategy A: Override + Weighted (100 cutoff) | 98.1% | 0% | 0 |
| Strategy B: TMR as Tiebreaker | 81.7% | 20.2% | 0 |
| Strategy C: TMR as Confidence Modifier | 96.2% | 1.9% | 0 |

The rules engine is already strong on the synthetic golden set. TMR's value is on **real-world content the golden set doesn't cover** — polished AI without cliches, hybrid human+AI posts, cross-model AI detection (RAID: 99.28% AUROC on 672K samples). Strategy A (rules override + TMR weighted) preserves the rules engine's strengths while gaining TMR's trained detection capability for harder content.

## Data Flow

```
LinkedIn post/comment text
        |
        v
  [1] Rules Engine (sync, <5ms)
        |
        +--> Sticker shown immediately with rules label
        |
        v
  [2] TMR Detector (async, ~113ms, offscreen document)
        |
        v
  [3] Score Combiner
        |  - Rules override: engagement bait, short text (<100 chars)
        |  - Otherwise: TMR probability adjusts label
        |  - Agreement: boost confidence
        |  - Disagreement: lower confidence
        |
        +--> Sticker updated if combined label differs from rules label
        |
        v
  [4] Gemini Nano (async, ~1-3s, optional)
        |
        +--> Explanation text attached to result
```

## What Changes vs What Stays the Same

| Aspect | Before | After |
|--------|--------|-------|
| Primary detector | Rules engine | TMR + rules combined |
| Sticker timing | Rules label appears instantly | Rules label appears instantly, may update ~113ms later |
| Engagement bait detection | Rules engine | Rules engine (unchanged — TMR can't detect engagement bait) |
| Short text (<100 chars) | Rules engine | Rules engine (unchanged — TMR unreliable on short text) |
| Comment classification | Rules engine | Rules engine primary, TMR low weight |
| Post classification | Rules engine | TMR primary, rules override for bait/short |
| Explanations | Gemini Nano or rules reasons | Gemini Nano or rules reasons (unchanged) |
| Model download | Gemini Nano only (Chrome-managed) | Gemini Nano + TMR ONNX Q4 (~202 MB bundled with extension) |
| Offscreen document | Hosts Gemini Nano | Hosts Gemini Nano + TMR (Transformers.js/ONNX Runtime) |
| CSP | No WASM | `wasm-unsafe-eval` required |
| Extension permissions | `linkedin.com` only | `linkedin.com` only (TMR model bundled, no external download) |

## Scope

### v1 (this plan)

- Bundle Transformers.js, ONNX Runtime, and TMR Q4 model (~202 MB) with the extension.
- Load TMR Q4 model locally in the offscreen document (no network download).
- Add TMR classification to the scoring pipeline (async, after rules).
- Implement score combiner with Strategy A (rules override + TMR weighted).
- TMR initializes eagerly on offscreen document startup.
- Popup shows TMR model status (loading/ready/error).
- Cache versioning for combined results.
- No `huggingface.co` host permission needed (model is bundled).

### Deferred

- WebGPU acceleration for TMR (WASM-only for v1).
- Per-category combiner weight profiles.
- TMR-specific evaluation set beyond the golden set.
- Removing Gemini Nano dependency entirely.

## Dependencies

| Module | Touched? | Why |
|--------|----------|-----|
| `src/tmr/` | New | TMR service: model loading, classification, status |
| `src/scoring-coordinator/` | Modified | Add TMR step, score combiner, new scoring source |
| `src/entrypoints/offscreen/` | Modified | Host TMR alongside Gemini |
| `src/background/offscreen-lifecycle.ts` | Modified | Add `WORKERS` reason |
| `src/shared/types.ts` | Modified | Add `'tmr'` and `'combined'` to `ScoringSource` |
| `src/shared/messaging.ts` | Modified | Add TMR message types to allowlist |
| `src/entrypoints/background.ts` | Modified | Observe `TMR_STATUS_RESULT`/`TMR_CLASSIFY_RESULT` to flip `coordinator.setTmrAvailable(...)` |
| `wxt.config.ts` | Modified | CSP, host_permissions |
| `package.json` | Modified | Add `@huggingface/transformers` |
| `src/entrypoints/popup/` | Modified | TMR model status section |
| `src/shared/message-types.ts` | Modified | Add TMR message interfaces and payload types |
| `src/rules-engine/rules-engine.ts` | Modified | Preserve raw `reasons` array on `ScoringResult` (add optional `reasons` field) |
| `src/overlay/overlay-controller.ts` | Modified | Extend `isAiUpgrade` check to include `source: 'combined'` |
| `src/gemini/` | Not touched | Gemini stays as-is |
| `src/linkedin-adapter/` | Not touched | |
