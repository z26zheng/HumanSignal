# Research Spike: TMR AI Text Detector in Chrome Extension

**Revised:** 2026-05-13

**Goal:** Confirm that the TMR AI Text Detector (RoBERTa ONNX) loads and runs correctly inside a Chrome extension, and that it returns usable probability scores on LinkedIn-like content.

**Not in scope:** Accuracy benchmarking (already validated on RAID: 99.28% AUROC, 672K samples, 2.6% FPR). We trust the benchmark. We just need to confirm it works in our environment.

---

## What We're Testing

1. Can Transformers.js + ONNX Runtime load the model in a Chrome extension offscreen document?
2. Which quantized variant (Q4, int8, uint8) gives the best size/speed tradeoff?
3. Does it return probability scores (not just binary labels)?
4. How fast is inference on real text?
5. How much memory does it use?
6. Can it coexist with our existing extension architecture?

---

## The Model

| | |
|---|---|
| Source | `onnx-community/tmr-ai-text-detector-ONNX` on HuggingFace |
| Base | RoBERTa-base (125M params), fine-tuned for AI text detection |
| Training | 50K stratified RAID samples, Focal Loss, Self-Hard-Negative mining |
| RAID benchmark | 99.28% AUROC, 97.4% accuracy, 2.6% FPR |
| License | MIT |
| Variants | FP32, FP16, int8, uint8, Q4, Q4F16, BNB4 |
| Runtime | Transformers.js (`@huggingface/transformers`) + ONNX Runtime Web |
| Output | Text classification: `{ label: "AI" | "Human", score: 0.0-1.0 }` |

---

## Step 1: Load the Model in a Standalone Page

Before touching the extension, confirm the model loads and runs in a plain HTML page.

### Tasks

1. Create a minimal test page:

```html
<script type="module">
  import { pipeline } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers';

  const detector = await pipeline(
    'text-classification',
    'onnx-community/tmr-ai-text-detector-ONNX',
    { dtype: 'q4' }  // try each variant
  );

  const result = await detector('I shipped a billing fix in April and false positives dropped from 18% to 4%.');
  console.log(result);
  // Expected: [{ label: "Human", score: 0.95 }] or similar
</script>
```

2. Open in Chrome. Confirm:
   - Model downloads from HuggingFace.
   - No errors in console.
   - `result` contains a label and a score.
   - The score is a float between 0 and 1 (not just 0 or 1).

3. Test each quantized variant and record:

| Variant | Download size | Load time | Works? |
|---------|--------------|-----------|--------|
| `q4` | ? | ? | ? |
| `q4f16` | ? | ? | ? |
| `int8` | ? | ? | ? |
| `uint8` | ? | ? | ? |
| `fp16` | ? | ? | ? |

Pick the smallest variant that loads successfully.

### Quick functional test

Run these 5 texts through the model to confirm it returns sensible scores:

| Text | Expected direction |
|------|-------------------|
| "I shipped a billing fix in April and false positives dropped from 18% to 4%." | Human (high score) |
| "Here's what I learned about leadership: most people don't realize that consistency beats talent." | AI (high score) |
| "Great insights, this really resonates with how leaders should think about growth." | AI (high score) |
| "Comment AI and I will send you the full template." | AI (high score) |
| "Big week." | Low confidence / near 0.5 |

We're not benchmarking accuracy here — just confirming the model gives directionally correct scores and that the probability output is usable.

---

## Step 2: Load in a Chrome Extension Offscreen Document

### Tasks

1. Create a minimal test extension:

```
test-tmr-extension/
├── manifest.json
├── background.js
├── offscreen.html
└── offscreen.js
```

2. `manifest.json`:

```json
{
  "manifest_version": 3,
  "name": "TMR Detector Test",
  "version": "0.0.1",
  "permissions": ["offscreen", "storage"],
  "background": { "service_worker": "background.js", "type": "module" },
  "content_security_policy": {
    "extension_pages": "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'"
  }
}
```

3. `offscreen.js`: Import Transformers.js (bundled with the extension, not from CDN), load the model, expose a `CLASSIFY_TEXT` message handler.

4. `background.js`: Create offscreen document, forward classification requests.

5. Test: load the extension, send a classification request from the background console, confirm result.

### What to record

| Metric | Value |
|--------|-------|
| Does the model load in the offscreen document? | yes / no |
| Does `wasm-unsafe-eval` CSP work? | yes / no |
| Which offscreen `Reason` is required for ONNX Runtime? | Current production uses `LOCAL_STORAGE` — may not authorize WASM/WebGPU. Try `WORKERS` if ONNX fails to initialize. |
| Can the offscreen document fetch from HuggingFace without additional `host_permissions`? | yes / no. Current permissions only include `linkedin.com`. |
| Model download: from HuggingFace at runtime or must be bundled? | |
| If bundled: total extension package size? | |
| If downloaded at runtime: first-load time? | |
| Memory usage (Chrome Task Manager → offscreen process) | |
| Inference latency (5-item test) | |
| Does WebGPU work in offscreen? Or WASM only? | |

### Key risk: bundling vs runtime download

Two options for getting the model into the extension:

**Option A: Download from HuggingFace at runtime.** Like the Slop Detector does. Extension is small, model downloads on first use (~60-80 MB). Requires adding `https://huggingface.co/*` to `host_permissions` — this triggers a user-facing permission prompt on extension update and a Chrome Web Store re-review.

**Option B: Bundle the ONNX file with the extension.** No runtime download, works immediately. But the extension package is 60-80 MB. Chrome Web Store allows up to ~500 MB, so it fits, but users download it all upfront.

Test both and note the tradeoffs.

---

## Step 3: Measure Performance

With the extension working, measure what matters for production:

### Latency

Run 20 texts of varying lengths:

| Length | Count | Expected latency |
|--------|-------|-----------------|
| Short (<50 chars) | 5 | Very fast |
| Medium (200-500 chars) | 5 | ~50-150ms |
| Long (1000-2000 chars) | 5 | ~100-300ms |
| Very long (4000-6000 chars) | 5 | ~200-500ms |

Record per-item latency. Compare WASM vs WebGPU if both work.

### Memory

| Measurement | How |
|------------|-----|
| Idle memory (model loaded, no inference) | Chrome Task Manager |
| Peak memory during inference | Chrome Task Manager |
| Memory after 50 classifications | Check for leaks |

### Concurrency

- Can we run inference while the user scrolls LinkedIn?
- Does inference block the offscreen document's event loop?
- Can we queue multiple items and process sequentially without issues?

---

## Step 4: Test Coexistence with HumanSignal

### Can TMR and Gemini Nano share the same offscreen document?

Chrome only allows one offscreen document per extension. Our architecture already uses the offscreen document for Gemini Nano. Two options:

**Option A: Both models in the same offscreen document.** Transformers.js loads alongside the Gemini Nano session. Test whether they conflict (memory, WASM instances, message handling). Measure **combined** memory of both models loaded simultaneously, not just TMR alone — the Gemini session already uses several hundred MB from its warm-up. If combined memory exceeds 500 MB, Option A is not viable on 8 GB machines.

**Option B: TMR replaces Gemini Nano for detection.** Gemini Nano is only used for explanation generation (telling users *why*), not for label classification. TMR handles the label, Gemini handles the explanation.

**Option C: TMR runs in a Web Worker inside the offscreen document.** Isolates the ONNX runtime from the Gemini session. Transformers.js supports Web Workers.

Test Option A first (simplest). If it fails, try C.

### Integration points

The production extension uses **WXT** (`wxt.config.ts`), not a raw `manifest.json`. The manifest is generated. CSP, permissions, and offscreen reasons are all configured through WXT.

| Component | Change needed |
|-----------|--------------|
| `wxt.config.ts` | Add `content_security_policy: { extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'" }` to manifest config. Verify WXT passes this through correctly to the generated manifest. Possibly add `https://huggingface.co/*` to `host_permissions` if runtime download is chosen. |
| `background/offscreen-lifecycle.ts` | May need to add `WORKERS` to the `reasons` array alongside `LOCAL_STORAGE` for ONNX Runtime WASM execution. |
| `shared/messaging.ts` | Add `'CLASSIFY_TEXT'` to `KNOWN_MESSAGE_TYPES` array. Without this, messages are silently dropped by `isHumanSignalMessage`. |
| `shared/message-types.ts` or equivalent | Add `ClassifyTextMessage` and `ClassifyTextResultPayload` interfaces to the message union types. |
| `shared/types.ts` | Add `'tmr'` to `ScoringSource` type (currently `'rules' \| 'gemini' \| 'system'`). This ripples through scoring coordinator, cache (needs a `scoringVersion` for TMR entries), UI (popover shows source), and telemetry. |
| `offscreen/main.ts` | Add TMR model loading + `CLASSIFY_TEXT` handler alongside Gemini handlers. Note: Gemini warm-up runs eagerly on load — both models will try to initialize simultaneously if TMR is also added. |
| `scoring-coordinator.ts` | Route TMR classification to/from offscreen. Combine TMR probability with rules score into a `ScoringResult`. |
| `package.json` | Add `@huggingface/transformers` dependency. |

**WXT/Vite bundling note:** Verify that `@huggingface/transformers` bundles correctly with WXT/Vite. ONNX Runtime's WASM files must be emitted as separate assets, not inlined by the bundler. Test with `wxt build` and confirm the offscreen document can load the bundled library. This is a 30-minute check that could save days of debugging later.

Don't implement these during the spike. Just confirm they're feasible and document any blockers.

---

## Step 5: Confirm Probability Output Is Usable

The whole reason to prefer TMR over the Slop Detector is the probability score. Confirm it's actually useful:

### What we need

```typescript
const result = await detector("some LinkedIn post text");
// result = [{ label: "AI", score: 0.87 }]
//   or
// result = [{ label: "Human", score: 0.92 }]
```

### What to verify

1. **Is the score a continuous float?** Not just 0.0 or 1.0, but values like 0.73, 0.45, 0.91.
2. **Does the score correlate with how "obviously AI" the text is?** Generic motivational post should score higher than a nuanced hybrid.
3. **Is there a usable middle zone?** If the model always outputs >0.9 or <0.1 with nothing in between, it's effectively binary despite being a float.

Run the full 112-item golden set from `src/rules-engine/golden-set.ts` through TMR and plot the score distribution by category. This takes only a few minutes at the latencies measured in Step 3 and produces substantially better data than a 15-item sample. We want to see a spread across the 0.0-1.0 range, not a bimodal spike at 0 and 1.

---

## Spike Outputs

| Output | What it tells us |
|--------|-----------------|
| "It loads and runs" confirmation | Green light to proceed with integration |
| Best quantized variant | Which ONNX file to use (Q4, int8, etc.) |
| Download size | First-run UX impact |
| Memory footprint | Whether it fits our memory budget |
| Inference latency by text length | Whether it's fast enough for feed scoring |
| Probability score distribution | Whether scores map to our 5-label spectrum |
| Coexistence feasibility | Whether TMR and Gemini Nano can share the offscreen document |
| CSP / Web Store concerns | Any blockers for distribution |

## Decision After Spike

| Result | Next step |
|--------|----------|
| Everything works, scores are useful | Integrate TMR as the primary detector in the combined architecture (TMR + rules + Gemini for explanations) |
| Works but scores are effectively binary | Still useful as a signal, but combined weight should be lower. Rules engine carries more responsibility. |
| Doesn't load in offscreen / CSP blocked | Try Slop Detector as fallback. Or explore Service Worker ONNX runtime. |
| Memory too high to coexist with Gemini | Use Option B (TMR replaces Gemini for detection, Gemini only for explanations) or Option C (Web Worker isolation) |
| Inference too slow (>1s per item) | Try WebGPU. If still slow, try a smaller model or accept async scoring like Gemini. |
