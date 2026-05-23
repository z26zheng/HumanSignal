# Review: TMR AI Text Detector in Chrome Extension

**Reviewer:** Cursor Agent (8a116baa)
**Plan doc:** `Docs/detection-engine/Spike-TMR-Detector.md`
**Review date:** 2026-05-13

## Verdict

APPROVE WITH COMMENTS

## Summary

The spike is well-scoped and correctly structured as a progressive validation (standalone page → extension offscreen → performance → coexistence → probability output). The decision table at the end is clear and actionable. However, the integration feasibility section (Step 4) underestimates the messaging and type system changes required. The offscreen document's current lifecycle, CSP configuration, and reason declaration all need investigation during the spike, not after. The document also doesn't mention that the extension uses WXT (not raw manifest.json), which affects how CSP and permissions are configured.

---

## Detailed Findings

### Finding 1: Extension uses WXT, not raw manifest.json

**Severity:** Major
**Location:** Step 2, manifest.json (lines 109-121)
**Claim:** The test extension in Step 2 uses a raw `manifest.json` with inline CSP. Step 4's integration table says to modify `manifest.json` to add `wasm-unsafe-eval`.
**Reality:** The production extension uses WXT (`wxt.config.ts`), not a raw manifest. The manifest is generated from the WXT config:

```typescript
// wxt.config.ts
export default defineConfig({
  srcDir: 'src',
  manifest: {
    name: 'HumanSignal',
    permissions: ['storage', 'offscreen', 'activeTab'],
    host_permissions: ['https://www.linkedin.com/*'],
    action: { default_title: 'HumanSignal' },
  },
  // ...
});
```

There is **no** `content_security_policy` field in the current config. Adding `'wasm-unsafe-eval'` requires adding it to the WXT manifest config, not editing a manifest.json file directly. WXT may also have its own CSP handling that could interfere.

This doesn't affect the standalone spike (Step 1-2 can use a raw test extension). But Step 4's integration table should reference `wxt.config.ts`, not `manifest.json`.

**Recommendation:** (1) Step 2's standalone test extension with raw manifest.json is fine — keep it separate from the production extension. (2) In Step 4's integration table, change `manifest.json` to `wxt.config.ts` and note that the CSP must be added to the WXT manifest config. (3) During the spike, verify that WXT correctly passes `content_security_policy` through to the generated manifest.

---

### Finding 2: Offscreen document uses `LOCAL_STORAGE` reason — may need a different reason for ONNX

**Severity:** Major
**Location:** Step 4, coexistence (lines 190-200)
**Claim:** "Chrome only allows one offscreen document per extension. Our architecture already uses the offscreen document for Gemini Nano."
**Reality:** Correct — the production code confirms this at `offscreen-lifecycle.ts` line 11-15:

```typescript
await browser.offscreen.createDocument({
  url: browser.runtime.getURL(OFFSCREEN_DOCUMENT_PATH),
  reasons: [browser.offscreen.Reason.LOCAL_STORAGE],
  justification: 'Host on-device AI model sessions for HumanSignal.',
});
```

The `reasons` array currently only includes `LOCAL_STORAGE`. ONNX Runtime Web uses WebAssembly (and optionally WebGPU). Chrome's offscreen document API requires declaring the correct `Reason` for the capabilities used. `LOCAL_STORAGE` may not authorize WASM execution or WebGPU access in the offscreen document. If ONNX fails to initialize, it may be because the wrong reason is declared.

The relevant Chrome offscreen reasons for ONNX would likely be `WORKERS` (if using Web Workers inside the offscreen document) or potentially `LOCAL_STORAGE` covers WASM — but this is not documented clearly.

**Recommendation:** Add to Step 2: "When testing in the offscreen document, if ONNX Runtime fails to initialize, try different `chrome.offscreen.Reason` values. Record which reason(s) are required for WASM and/or WebGPU execution in the offscreen context." Also add to the Step 2 recording table: "Which offscreen Reason is required for ONNX Runtime?"

---

### Finding 3: Messaging system requires explicit registration of new message types

**Severity:** Major
**Location:** Step 4, integration points table (lines 202-211)
**Claim:** The integration table lists `offscreen/main.ts` and `scoring-coordinator.ts` as needing changes but doesn't mention the messaging layer.
**Reality:** The extension's messaging system has a strict allowlist. A new `CLASSIFY_TEXT` message type requires changes in three files:

1. **`shared/message-types.ts`** — Add a `ClassifyTextMessage` interface and a `ClassifyTextResultPayload` interface. Add both to the `HumanSignalMessage` and `MessagePayload` union types.

2. **`shared/messaging.ts`** — Add `'CLASSIFY_TEXT'` to the `KNOWN_MESSAGE_TYPES` array (line 28). Without this, the messaging layer silently drops the message because `isHumanSignalMessage` returns false.

3. **`offscreen/main.ts`** — Add a case in `handleOffscreenMessage` for the new message type.

The `KNOWN_MESSAGE_TYPES` list is a non-obvious gate. If the spike's Step 4 feasibility check doesn't account for it, someone could conclude "messaging works" from the standalone test extension (which has its own simple messaging) but hit silent failures in the production extension.

**Recommendation:** Add `shared/message-types.ts` and `shared/messaging.ts` to the Step 4 integration table. Note: "The messaging layer has a `KNOWN_MESSAGE_TYPES` allowlist that must include any new message type, or messages will be silently dropped."

---

### Finding 4: `ScoringResult.source` type needs extending

**Severity:** Minor
**Location:** Step 4, integration points (line 207)
**Claim:** "scoring-coordinator.ts: Send text to TMR, receive probability, combine with rules score."
**Reality:** `ScoringResult` has a `source` field typed as `ScoringSource = 'rules' | 'gemini' | 'system'` (`types.ts` line 52). If TMR produces results, they need a source identifier. Adding `'tmr'` or `'detector'` to `ScoringSource` ripples through:

- `types.ts` — the type union
- `scoring-coordinator.ts` — mode management and telemetry
- `score-cache.ts` — cache versioning (TMR results need their own `scoringVersion`)
- UI components — the explanation popover shows "Rule-based" or "AI-enhanced" based on source; a TMR source needs a display label
- Telemetry — `ScoringTelemetry` tracks events by source

This isn't a blocker for the spike, but the integration table understates the scope. "Send text to TMR, receive probability, combine with rules score" makes it sound like a simple message roundtrip, when it's actually a new scoring source threading through the entire type system.

**Recommendation:** In Step 4, change the `scoring-coordinator.ts` row to: "Add `'tmr'` to `ScoringSource` type. Route TMR classification to/from offscreen. Combine TMR probability with rules score into a `ScoringResult`. Requires `scoringVersion` for TMR cache entries." Flag that the full type system impact is a production concern, not a spike concern.

---

### Finding 5: Offscreen document warm-up creates Gemini session eagerly

**Severity:** Minor
**Location:** Step 4, Option A (line 194)
**Claim:** "Both models in the same offscreen document. Transformers.js loads alongside the Gemini Nano session. Test whether they conflict."
**Reality:** The offscreen document eagerly warms up the Gemini session on load (`offscreen/main.ts` lines 23-27):

```typescript
const geminiService: GeminiService = new GeminiService();
const warmUpPromise: Promise<void> = geminiService.warmUp().then(/* ... */);
```

If TMR model loading is also added to the offscreen document's startup, both models will try to initialize simultaneously. This is the right test for Option A, but the document should specify: measure memory usage with both models loaded (not just TMR alone). A combined memory footprint of Gemini Nano session + TMR ONNX model could exceed practical limits on 8GB RAM machines.

**Recommendation:** Add to Step 4, Option A: "Measure combined memory of Gemini session + TMR model loaded simultaneously, not just TMR alone. The Gemini session already uses several hundred MB. If combined memory exceeds 500 MB, Option A is not viable."

---

### Finding 6: Model download vs bundling — host_permissions impact

**Severity:** Minor
**Location:** Step 2, key risk section (lines 143-151)
**Claim:** "Option A: Download from HuggingFace at runtime... Requires `host_permissions` for `huggingface.co`."
**Reality:** The current extension has `host_permissions: ['https://www.linkedin.com/*']` only. Adding `https://huggingface.co/*` triggers a Chrome Web Store re-review and shows a new permission prompt to existing users on update. This is a significant distribution concern.

Additionally, offscreen documents may be restricted in their ability to fetch from external origins depending on the extension's CSP and permissions. The standalone test page (Step 1) can fetch from HuggingFace freely, but the offscreen document may not — this is a potential false positive where Step 1 works but Step 2 fails on the fetch, not the model.

**Recommendation:** Add to Step 2's recording table: "Can the offscreen document fetch from HuggingFace without additional permissions?" In the bundling vs download tradeoff, add the note: "Runtime download requires adding `huggingface.co` to `host_permissions`, which triggers a user-facing permission prompt on extension update and a Chrome Web Store re-review."

---

### Finding 7: No mention of Transformers.js bundling complexity

**Severity:** Minor
**Location:** Step 2 (line 124)
**Claim:** "Import Transformers.js (bundled with the extension, not from CDN)."
**Reality:** Transformers.js (`@huggingface/transformers`) is a substantial dependency that includes ONNX Runtime Web internally. Bundling it with Vite (via WXT) requires:

- Ensuring WASM files (`.wasm`) are correctly handled by the bundler — Vite doesn't always handle WASM imports from node_modules correctly.
- The ONNX Runtime Web WASM files may need to be copied to the extension's output directory as static assets, not inlined.
- Transformers.js has worker-based inference paths that may need special Vite configuration.

The standalone test page (Step 1) uses a CDN import and avoids all of this. Step 2's test extension uses raw JS files. Neither tests the WXT bundling path. If bundling fails, it's a blocker that won't be discovered until production integration.

**Recommendation:** Add a note to Step 4: "Verify that `@huggingface/transformers` bundles correctly with WXT/Vite. Specifically: WASM files must be emitted as separate assets, not inlined. Test with `wxt build` and confirm the offscreen document can load the bundled library." This is a 30-minute check that could save days of debugging later.

---

### Finding 8: Step 5 probability verification uses too few items

**Severity:** Minor
**Location:** Step 5 (line 234)
**Claim:** "Run the 5 functional test items from Step 1, plus 10 more items from our golden set, and plot the score distribution."
**Reality:** 15 items is enough to confirm the output is a continuous float, but not enough to evaluate whether the score distribution has a usable middle zone. The golden set has 112 items across 14 categories. Running the full golden set (112 items) takes only a few minutes at the latencies described in Step 3, and gives a much better picture of the score distribution.

**Recommendation:** Run the full 112-item golden set from `src/rules-engine/golden-set.ts` through TMR, not just 15 items. Plot the score distribution by category. This costs almost nothing in spike time and produces substantially better data for the "is the probability useful?" question.

---

## Verified Claims

Checked against the codebase and confirmed correct:

1. **Chrome allows only one offscreen document per extension** — Confirmed. `ensureOffscreenDocument()` in `offscreen-lifecycle.ts` checks `hasDocument()` before creating. The Chrome MV3 API enforces this.

2. **The offscreen document currently hosts Gemini Nano** — Confirmed. `offscreen/main.ts` instantiates `GeminiService` and handles `GEMINI_PROMPT`, `CHECK_GEMINI_STATUS`, `TRIGGER_DOWNLOAD`, `DESTROY_GEMINI_SESSION`.

3. **`@huggingface/transformers` is not currently a dependency** — Confirmed. `package.json` has only `preact` in dependencies and build tools in devDependencies.

4. **The scoring coordinator routes Gemini requests through the offscreen document** — Confirmed. `scoring-coordinator.ts` calls `sendToOffscreen({ type: 'GEMINI_PROMPT', ... })` via `runGeminiRequest`. Background.ts forwards to offscreen via `forwardToOffscreen`.

5. **The extension currently has no `content_security_policy` override** — Confirmed. `wxt.config.ts` manifest config has `permissions`, `host_permissions`, and `action` only. No CSP.

6. **The offscreen document is created with `Reason.LOCAL_STORAGE`** — Confirmed. `offscreen-lifecycle.ts` line 14.

7. **The messaging system has a strict allowlist of known message types** — Confirmed. `messaging.ts` lines 27-35, `KNOWN_MESSAGE_TYPES` array. `isHumanSignalMessage` checks this at line 76.

8. **`ScoringSource` is limited to `'rules' | 'gemini' | 'system'`** — Confirmed. `types.ts` line 52.

9. **The offscreen document eagerly warms up Gemini on load** — Confirmed. `offscreen/main.ts` lines 21-27.

10. **`host_permissions` currently only includes `linkedin.com`** — Confirmed. `wxt.config.ts` line 10.

## Questions for the Author

1. **Has the `wasm-unsafe-eval` CSP directive been tested with WXT's manifest generation?** WXT generates the manifest from config. If WXT has its own CSP handling or escaping, the directive might not pass through correctly. Worth a quick test before the spike starts.

2. **Is the TMR model output a single probability (P(AI)) or a two-class output with separate human/AI scores?** The document shows `{ label: "AI", score: 0.87 }` — is `score` the probability of the label, or does the model return both `P(Human)` and `P(AI)` as separate values? This matters for how the score maps to the 5-label spectrum.

3. **What's the target combined memory budget for TMR + Gemini?** The extension's performance strategy targets "content script heap < 30MB." But the offscreen document is a separate process. Is there a memory target for the offscreen process?

4. **If Option B (TMR replaces Gemini for detection) is chosen, what happens to the Gemini accuracy research spike?** The Gemini accuracy spike is running in parallel. If TMR handles detection and Gemini is demoted to explanation-only, the accuracy spike's evaluation set and prompt work would need to be reframed for explanation quality rather than classification accuracy.

---

## Statistics

| Metric | Count |
|--------|-------|
| Plan docs reviewed | 1 |
| Critical findings | 0 |
| Major findings | 3 |
| Minor findings | 5 |
| Nits | 0 |
| Verified claims | 10 |
| Open questions | 4 |

## Recommendation

The spike is well-designed and should proceed. The standalone page test (Step 1) and minimal test extension (Step 2) are the right approach for validating feasibility without touching production code.

The three major findings (WXT build system, offscreen document reasons, messaging allowlist) won't block the spike itself — Steps 1-3 use standalone test artifacts. But they will block the production integration that follows. Address them during Step 4's feasibility assessment so the spike's "green light" recommendation includes these known integration costs.

The most valuable addition would be running the full 112-item golden set through TMR (Finding 8) instead of just 15 items. It costs almost no extra time and produces the data needed to assess whether TMR's probability scores map to the product's 5-label spectrum.
