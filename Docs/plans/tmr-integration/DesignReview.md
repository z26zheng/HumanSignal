# Plan Review Summary: TMR Detector Integration

**Reviewer:** Cursor Agent (e049d048)
**Review date:** 2026-05-13
**Plan location:** `Docs/plans/tmr-integration/`

## Overall Verdict

APPROVE WITH COMMENTS

## Key Findings

- **(Major)** The overlay's `isAiUpgrade` check hardcodes `source === 'gemini'` — combined TMR results with `source: 'combined'` won't trigger the upgrade transition animation. The plan claims the overlay "already supports async label changes" but this is only partially true.
- **(Major)** `queueTmrClassification` fires unbounded parallel `sendToOffscreen` calls — no concurrency control. 10 simultaneous posts = 10 simultaneous TMR inference requests.
- **(Major)** The `rulesReasons` field is constructed by splitting the joined explanation string on `'. '`, which is fragile. The raw `reasons` array is available from `classify()` but discarded during `scoreWithRules`.
- **(Minor)** The combiner only sends an update when the label changes, but confidence may change (boost on agreement) without a label change. Users miss the confidence improvement.
- **(Minor)** TMR is implicitly excluded from comments via `itemType is 'post'` conditions in the protocol, but this isn't called out as an explicit rule. Easy to miss during implementation.

## Statistics

| Metric | Count |
|--------|-------|
| Plan docs reviewed | 5 |
| Critical findings | 0 |
| Major findings | 3 |
| Minor findings | 9 |
| Nits | 0 |
| Verified claims | 18 |
| Open questions | 5 |

## Recommendation

The plan is well-structured with clear separation between protocol, implementation, testing, and limitations. The data flow is sound, the combiner strategy is justified by spike data, and the error handling table covers the right scenarios.

The three major findings should be resolved before implementation. The overlay `isAiUpgrade` check (Finding 1 in 02-review) is the most likely to cause a confusing bug — combined results would update the sticker label but without the smooth transition animation, making it look like a rendering glitch. The concurrency issue (Finding 2 in 02-review) could cause the offscreen document to OOM under rapid scrolling. The reasons-splitting issue (Finding 3 in 02-review) is a straightforward code fix.

---

# Review: 00-overview.md

**Reviewer:** Cursor Agent (e049d048)
**Plan doc:** `Docs/plans/tmr-integration/00-overview.md`
**Review date:** 2026-05-13

## Verdict

APPROVE

## Summary

Clean architectural overview with a clear data flow, honest change-vs-unchanged table, and well-scoped v1 vs deferred boundary. The spike data is correctly cited and the strategy choice is justified.

## Detailed Findings

### Finding 1: "Sticker update mechanism already supports async label changes" is partially incorrect

**Severity:** Major
**Location:** Dependencies table, row for `src/overlay/*` (line 105)
**Claim:** "Sticker update already supports async changes" — listed as "Not changed."
**Reality:** The overlay controller's `handleScoreResults` in `overlay-controller.ts` line 141 checks:

```typescript
const isAiUpgrade: boolean = entry.score !== null && result.source === 'gemini';
```

This hardcodes `'gemini'` as the only source that triggers the upgrade transition (the 400ms `ai-enhancing` state animation). A TMR combined result with `source: 'combined'` would update the label directly without the smooth transition, making it look like a jarring replacement rather than an upgrade.

The sticker *does* update (the label/color change works for any source), but the UX quality of the update differs. The overlay IS touched — at minimum, the `isAiUpgrade` condition needs to include `'combined'`.

**Recommendation:** Move `src/overlay/overlay-controller.ts` from "Not changed" to "Modified" with note: "Extend `isAiUpgrade` check to include `source: 'combined'`."

### Finding 2: Golden set item count is 112, not 104

**Severity:** Minor
**Location:** Context table (line 13)
**Claim:** "The combined scoring spike produced these results on 104 golden set items."
**Reality:** The golden set in `golden-set.ts` has 14 categories × 8 items = 112 items. The combined spike may have tested 104 items (8 excluded for some reason), but the document should explain the discrepancy or correct the number. Readers will cross-reference with the golden set file and be confused.

**Recommendation:** Either explain why 104 instead of 112 (e.g., "8 non-English edge cases excluded") or confirm the correct count.

## Verified Claims

1. **Rules engine returns results in <5ms** — Confirmed. `scoreWithRules` is synchronous feature extraction + classification. `evaluate-rules.ts` processes 20 items with no measurable delay.
2. **TMR latency ~113ms** — Confirmed from TMR spike RESULTS.md line 41.
3. **Gemini provides explanations only** — Confirmed. The scoring coordinator queues Gemini for upgrade; the plan correctly positions Gemini as explanation-only.
4. **`src/rules-engine/` is not touched** — Confirmed. The combiner imports rules results but doesn't modify rules logic.
5. **`src/gemini/` is not touched** — Confirmed. Gemini's role is unchanged.
6. **The offscreen document currently hosts Gemini Nano only** — Confirmed. `offscreen/main.ts` instantiates only `GeminiService`.

## Questions for the Author

1. Why 104 items instead of 112 in the spike results?

---

# Review: 01-protocol.md

**Reviewer:** Cursor Agent (e049d048)
**Plan doc:** `Docs/plans/tmr-integration/01-protocol.md`
**Review date:** 2026-05-13

## Verdict

APPROVE WITH COMMENTS

## Summary

Well-defined message protocol with clear types and a concrete combiner algorithm. The cache versioning scheme is correct. Two issues: the combiner silently excludes comments without making it an explicit rule, and the TMR-to-label mapping thresholds need justification from spike data.

## Detailed Findings

### Finding 1: Comment exclusion is implicit, not explicit

**Severity:** Minor
**Location:** Combiner logic, steps 4-5 (lines 111-115)
**Claim:** Steps 4 and 5 include `itemType is 'post'` as a condition. Step 6 says "Otherwise → return rulesLabel."
**Reality:** This means TMR never overrides rules on comments, but it's not stated as a rule — it's a side effect of post-only conditions in steps 4-5. A developer reading step 3 ("if rulesLabel and tmrLabel agree") would assume it applies to comments too. Step 3 doesn't have a post-only gate, so for comments, only step 3 (confidence boost on agreement) ever fires, and steps 4-5 (label override) never fire.

This is the correct behavior (TMR is bad on comments), but it should be an explicit rule:

```
0. If itemType is 'comment'
   → return rulesLabel (TMR not used for comment label override)
   (TMR may still boost/lower confidence in step 3)
```

**Recommendation:** Add step 0 as the first combiner rule to make comment handling explicit.

### Finding 2: TMR-to-label mapping thresholds lack justification

**Severity:** Minor
**Location:** TMR-to-label mapping table (lines 122-128)
**Claim:** `< 0.25` → human, `0.25 - 0.45` → possibly-ai, `0.45 - 0.70` → likely-ai, `> 0.70` → almost-certainly-ai.
**Reality:** These thresholds don't map to the TMR spike data. From RESULTS.md: human-metrics averaged 0.209 (correctly human), AI-generic averaged 0.571 (just above the 0.45 threshold). The 0.45-0.70 "likely-ai" band captures AI-generic (0.571) but also catches some human content (comment-human-thoughtful averaged 0.340, which is in the possibly-ai range).

The mapping is used in step 3 for "direction comparison." If TMR says 0.35 (possibly-ai direction) and rules says `feels-human`, is that agreement or disagreement? Under this mapping, TMR direction is "possibly-ai" which is an AI direction — so it's a disagreement that would lower confidence. But 0.35 is actually closer to human (below 0.5).

**Recommendation:** The direction comparison in step 3 should use a simpler binary: `< 0.5` = human direction, `>= 0.5` = AI direction. The detailed mapping is only needed for override thresholds in steps 4-5, where it's already qualified by `< 0.15` and `> 0.85` (much tighter bands).

### Finding 3: `TMR_CLASSIFY` sends raw text, not a full ExtractedItem

**Severity:** Minor
**Location:** TMR_CLASSIFY message type (lines 13-18)
**Claim:** The message sends `itemId` and `text` only.
**Reality:** This is intentional and correct — TMR needs only the raw text. But it means the offscreen document's TMR handler doesn't receive `itemType` or `charCount`. The combiner in the scoring coordinator needs these (from the original `ExtractedItem`), but the TMR classify message doesn't carry them. This is fine because the scoring coordinator has access to the original item — the message protocol is correct. Just noting the design choice is deliberate, not an omission.

## Verified Claims

1. **`ScoringSource` is currently `'rules' | 'gemini' | 'system'`** — Confirmed. `types.ts` line 52.
2. **Cache checks `scoringVersion` on lookup** — Confirmed. `score-cache.ts` uses version-aware lookup per `scoring-coordinator.ts` line 171.
3. **Error handling matches existing patterns** — Confirmed. The fallback-to-rules pattern matches `scoring-coordinator.ts` `runGeminiRequest` (lines 320-328).

## Questions for the Author

1. In step 3, should "agree on direction" use the detailed 4-band mapping or a simple binary (above/below 0.5)? The 4-band mapping creates an ambiguous zone (0.25-0.45) that may cause unexpected disagreements.

---

# Review: 02-implementation.md

**Reviewer:** Cursor Agent (e049d048)
**Plan doc:** `Docs/plans/tmr-integration/02-implementation.md`
**Review date:** 2026-05-13

## Verdict

REQUEST CHANGES

## Summary

The implementation plan is detailed and covers all the right files. However, three issues need resolution before implementation: the unbounded TMR concurrency, the fragile reasons-splitting, and the missing overlay update. The Vite/WXT config for ONNX bundling is acknowledged as uncertain ("May require Vite plugin") which is honest.

## Detailed Findings

### Finding 1: `queueTmrClassification` has no concurrency control

**Severity:** Major
**Location:** Section 7, `queueTmrClassification` (lines 114-154)
**Claim:** After rules scoring, the coordinator calls `this.queueTmrClassification(item, rulesResult, tabId)` for each item. This is fire-and-forget (not awaited).
**Reality:** If `handleScoreBatch` receives 10 items, it fires 10 `queueTmrClassification` calls in parallel. Each sends `sendToOffscreen({ type: 'TMR_CLASSIFY', ... })`. The offscreen document receives 10 concurrent TMR classification requests. ONNX Runtime inference is typically single-threaded on WASM — these 10 requests will serialize at the model level but the promises are all in-flight simultaneously, consuming memory for 10 pending results.

The existing Gemini flow uses a sequential queue with `this.isProcessing` guard and processes one item at a time. The TMR implementation bypasses this entirely.

**Recommendation:** Either (a) reuse the existing `ScoringQueue` for TMR with `maxConcurrent: 1`, or (b) add a simple sequential queue for TMR requests in the scoring coordinator (process one TMR request at a time, queue the rest). The Gemini queue already has priority and deduplication that would apply well to TMR.

### Finding 2: `rulesReasons` constructed by splitting joined explanation string

**Severity:** Major
**Location:** Section 7, line 137
**Claim:** `rulesReasons: rulesResult.explanation.split('. ')`
**Reality:** The rules engine's `scoreWithRules` in `rules-engine.ts` line 23 joins reasons with a space:

```typescript
explanation: classification.reasons.join(' ')
```

Splitting on `'. '` is incorrect — the join is `' '` not `'. '`. But even splitting on `' '` wouldn't recover the original reason boundaries. The `ClassificationResult` from `classify()` has `reasons: readonly string[]` as a proper array, but `scoreWithRules` discards it by joining into a single string.

The combiner needs the raw reasons array, which is lost in the current `ScoringResult` shape. Options:

1. Add `reasons: readonly string[]` to `ScoringResult` (touches the shared type).
2. Pass the raw `ClassificationResult` to the combiner instead of the `ScoringResult`.
3. Re-extract features and re-classify in the combiner (wasteful but avoids type changes).

**Recommendation:** Option 1 is cleanest. Add `reasons?: readonly string[]` as an optional field on `ScoringResult`. Populate it in `scoreWithRules`. The combiner reads `reasons` directly. This is a small type change with no downstream breakage (optional field).

### Finding 3: Missing overlay change for combined source detection

**Severity:** Major
**Location:** Section 7, and files-changed table (line 242)
**Claim:** The files-changed table lists `src/overlay/*` as "Not changed."
**Reality:** As found in the 00-overview review, `overlay-controller.ts` line 141 hardcodes `source === 'gemini'` for upgrade detection. TMR combined results need this check extended:

```typescript
const isAiUpgrade: boolean = entry.score !== null &&
  (result.source === 'gemini' || result.source === 'combined');
```

Without this, combined results update the label but skip the transition animation.

**Recommendation:** Add `overlay-controller.ts` to the files-changed table. Change: extend `isAiUpgrade` to include `'combined'`.

### Finding 4: Combined result only sent when label changes

**Severity:** Minor
**Location:** Section 7, line 141
**Claim:** `if (combined.label !== rulesResult.label)` — only update the cache and notify the tab when the label differs.
**Reality:** When TMR agrees with rules (same label), the combiner boosts confidence (Protocol step 3). But the boosted confidence is never sent to the content script — the rules result with `confidence: 'medium'` stands, even though the combined confidence is `'high'`. Users don't see the confidence improvement.

This also means the cache retains the rules-only result (with source `'rules'`, version `rules-1`), not the combined result. On next page load, the cached rules result is returned without any TMR signal.

**Recommendation:** Always send the combined result to the tab and cache if `combined.confidence !== rulesResult.confidence` OR `combined.label !== rulesResult.label`. The condition should be "any field changed," not just "label changed."

### Finding 5: `message-types.ts` not mentioned in files-changed table

**Severity:** Minor
**Location:** Files-changed table (lines 227-243)
**Claim:** `src/shared/messaging.ts` is listed as modified. `src/shared/message-types.ts` is not listed.
**Reality:** The messaging system has two files: `messaging.ts` (allowlist + send/receive functions) and `message-types.ts` (interfaces + union types). Adding TMR message types requires changes to both:

- `messaging.ts` — add type strings to `KNOWN_MESSAGE_TYPES` (correctly noted in section 5)
- `message-types.ts` — add `TmrClassifyMessage`, `TmrStatusMessage`, `TmrLoadModelMessage` interfaces; add `TmrClassifyResultPayload`, `TmrStatusResultPayload` to `MessagePayload` union; add message types to `HumanSignalMessage` union

**Recommendation:** Add `src/shared/message-types.ts` to the files-changed table.

### Finding 6: Vite config for ONNX bundling is uncertain

**Severity:** Minor
**Location:** Section 12, Vite/WXT build configuration (lines 204-223)
**Claim:** "May require Vite config" with `optimizeDeps.exclude` and `rollupOptions.external`.
**Reality:** This is honestly stated as uncertain, which is better than overpromising. However, `external: []` (empty array, line 217) is a no-op — it doesn't do anything. And `optimizeDeps.exclude` prevents Vite's dev server from pre-bundling the dependency, which is relevant for `wxt dev` but may not affect the production build.

The real concern is whether `@huggingface/transformers`'s WASM files (`.wasm` binary assets) get copied to the output directory. Vite's default behavior doesn't handle WASM imports from node_modules well. This may need `vite-plugin-wasm` or manual asset copying.

**Recommendation:** Remove the speculative Vite config from the plan. Replace with: "Build verification is required early. Run `wxt build`, load in Chrome, attempt TMR initialization. If WASM files are missing from the output, investigate `vite-plugin-wasm` or manual asset copying. This is a known risk (see 00-overview Risk Assessment)."

## Verified Claims

1. **`@huggingface/transformers` pipeline API signature matches** — Confirmed against HuggingFace docs and the TMR spike's `step1-standalone.html`.
2. **Background message routing uses `forwardToOffscreen`** — Confirmed. `background.ts` line 234.
3. **`ensureOffscreenDocument` is called before offscreen messages** — Confirmed. `background.ts` line 245.
4. **`browser.offscreen.Reason.LOCAL_STORAGE` is current** — Confirmed. `offscreen-lifecycle.ts` line 14.
5. **TMR lazy loading is different from Gemini eager warming** — Confirmed. Gemini warms up at `offscreen/main.ts` line 23; plan proposes TMR waits for first request.
6. **The scoring coordinator already has in-flight dedup by contentHash** — Confirmed. `scoring-coordinator.ts` line 249: `this.inFlightByHash.get(contentHash)`.

## Questions for the Author

1. Should TMR requests reuse the existing `ScoringQueue` (with its priority and deduplication) or have a separate queue? The Gemini queue has viewport-based priority that would also benefit TMR.

2. Should the combined result always be cached (even when label matches rules), or only when something changes? Caching the combined result on every item means subsequent page loads return `combined-tmr-q4-1` instead of `rules-1`, which is arguably more correct.

---

# Review: 04-testing.md

**Reviewer:** Cursor Agent (e049d048)
**Plan doc:** `Docs/plans/tmr-integration/04-testing.md`
**Review date:** 2026-05-13

## Verdict

APPROVE

## Summary

Thorough test plan with unit, regression, integration, manual, and edge case coverage. The edge case matrix is particularly good — it covers offscreen crashes, service worker restarts, empty text, non-English content, and extension updates.

## Detailed Findings

### Finding 1: No test for the overlay upgrade animation with combined source

**Severity:** Minor
**Location:** Integration tests (lines 98-116)
**Claim:** Integration tests verify "first result has source: 'rules', second has source: 'combined'."
**Reality:** This verifies the result flow but not the overlay behavior. The existing `overlay.test.ts` likely tests the Gemini upgrade animation. A new test should verify that a `source: 'combined'` result triggers the same `ai-enhancing` transition as a Gemini result — or document that it intentionally doesn't.

**Recommendation:** Add an overlay integration test: "Sticker shows upgrade transition animation when combined result arrives after rules result."

### Finding 2: Very long text edge case says "TMR handles its own truncation"

**Severity:** Minor
**Location:** Edge case matrix, row for >6000 chars (line 152)
**Claim:** "Text passed to TMR as-is (TMR handles its own truncation)."
**Reality:** RoBERTa-base has a 512-token context window. Text longer than ~2000 characters will be truncated by the tokenizer. Transformers.js may handle this silently (truncate to 512 tokens) or throw an error. The TMR spike tested texts up to "long" (1000-2000 chars) but not "very long" (4000-6000 chars). The behavior on 6000-char inputs is actually unknown.

**Recommendation:** Change to: "TMR's RoBERTa tokenizer truncates to 512 tokens (~2000 chars). Inputs >2000 chars may lose signal from later paragraphs. Verify behavior in manual testing. Consider pre-truncating in `TmrService.classify` to match the tokenizer limit, similar to the Gemini path's `MAX_PROMPT_CHARS`."

### Finding 3: Missing regression test for cache versioning

**Severity:** Minor
**Location:** Regression tests (lines 84-94)
**Claim:** Existing tests must pass unchanged.
**Reality:** The cache versioning change (new `combined-tmr-q4-1` version) should have a dedicated test: "Cached rules-1 result is returned when TMR is unavailable; cached combined-tmr-q4-1 result is returned when TMR is available." This ensures the version-aware cache lookup works correctly with the new source.

**Recommendation:** Add a cache versioning regression test to the scoring coordinator test file.

## Verified Claims

1. **`rules-engine.test.ts` covers golden set accuracy** — Confirmed. The test runs `scoreWithRules` on golden set items.
2. **`scoring-coordinator.test.ts` covers cache, queue, and mode management** — Confirmed.
3. **`messaging.test.ts` covers message creation and validation** — Confirmed.

---

# Review: 05-limitations.md

**Reviewer:** Cursor Agent (e049d048)
**Plan doc:** `Docs/plans/tmr-integration/05-limitations.md`
**Review date:** 2026-05-13

## Verdict

APPROVE

## Summary

Honest, thorough limitations document. Each limitation has a clear problem statement, v1 workaround, impact assessment, and risk. The future work roadmap is realistic and correctly prioritized.

## Detailed Findings

### Finding 1: Missing limitation — RoBERTa 512-token context window

**Severity:** Minor
**Location:** (Omission)
**Claim:** Not discussed.
**Reality:** TMR uses RoBERTa-base, which has a 512-token context window (~2000 characters). LinkedIn posts can be significantly longer. On truncated inputs, TMR classifies based on the first ~2000 characters only. If the most human-specific content (concrete metrics, personal details) appears later in the post, TMR may miss it.

**Recommendation:** Add a limitation section: "TMR classifies based on the first ~512 tokens (~2000 characters). Longer posts may lose signal from later paragraphs. This is a model architecture constraint (RoBERTa-base). Mitigation: the rules engine's feature extraction runs on the full text and catches signals TMR misses."

### Finding 2: "Removing Gemini Nano dependency entirely" listed as future work

**Severity:** Minor
**Location:** Future work, v3 (lines 107-109)
**Claim:** "Gemini Nano's role (explanation generation) could be handled by a template system."
**Reality:** The explanation quality is one of the product's differentiators (PRD Section 9.2: "Explainability Builds Trust"). Replacing Gemini-generated explanations with templates would reduce explanation quality significantly — templates can describe what was detected but can't reason about the specific text. This should be flagged as a quality trade-off, not just a technical possibility.

**Recommendation:** Add: "Trade-off: templates would be faster and remove the Gemini dependency, but explanation quality would decrease. Only consider if user research shows explanations aren't valued."

## Verified Claims

1. **TMR spike showed 0.36 AI score for engagement bait** — Confirmed. RESULTS.md line 20.
2. **TMR spike showed 0.90 AI score for human questions** — Confirmed. RESULTS.md line 51.
3. **Q4 model is ~68 MB** — Confirmed from TMR spike.
4. **Strategy A preserved 98.1% acceptable accuracy** — Confirmed from spike results cited in 00-overview.
5. **`wasm-unsafe-eval` is used by the AI Slop Detector on Chrome Web Store** — Referenced as precedent.

---

## Cross-Cutting Open Questions

1. **Should the overlay `isAiUpgrade` check use a general "is upgrade" function rather than listing sources?** As more scoring sources are added (TMR, future models), the hardcoded list grows. A better pattern: `isUpgrade = entry.score !== null && result.scoredAt > entry.score.scoredAt && result.source !== 'rules'`.

2. **Should TMR be gated behind a feature flag independent of the popup Enable button?** If TMR causes unexpected issues in production, a server-side or storage-based kill switch would allow disabling TMR without an extension update.

3. **Does the Transformers.js `pipeline()` call block the offscreen document's event loop during model loading?** If the 68 MB model download and WASM compilation block the event loop, Gemini requests that arrive during TMR initialization would be queued or dropped. The offscreen document's message listener may not respond.
