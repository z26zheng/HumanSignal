# Review: Accuracy Research — Gemini Nano Scoring (Revised)

**Reviewer:** Cursor Agent (5983f3b5)
**Plan doc:** `Docs/gemini-accuracy/Accuracy-Gemini-Nano.md`
**Review date:** 2026-05-13 (second pass — revised document)

## Verdict

APPROVE

## Summary

The revised document addresses every major and most minor findings from the first review. The dual-scoring behavior is acknowledged and deferred. Temperature is framed as investigation, not assumption. Truncated-post testing is included. The schema-tightening task was correctly removed. The `expectedConfidence` field was added. The `GEMINI_SCORING_VERSION` bump is documented in the post-spike section.

The biggest improvement is the benchmark harness design: a lightweight HTML + Playwright setup that calls `LanguageModel` directly without building or loading the extension. This is the right approach for iterative prompt research.

The remaining findings are minor — mostly around the harness's implementation details and research process discipline.

---

## Findings Addressed From First Review

All 11 previous findings were addressed. For the record:

| # | Previous finding | Resolution |
|---|-----------------|------------|
| 1 | Scoring coordinator runs rules first in Gemini mode | Acknowledged at line 29; rules-Gemini agreement added as benchmark metric |
| 2 | System prompt mischaracterized | Reworded: "high-level guidance but no detection-specific signals" |
| 3 | Text truncation already implemented | "Truncated (>6000 chars)" category added to eval set |
| 4 | Temperature API not simple | Framed as "investigate at runtime"; fallback to `topK` or accepting lower consistency |
| 5 | RESULT_SCHEMA already tight | Task removed entirely |
| 6 | Eval set file path convention | Imports existing 20 items from `llm-evaluation-set.ts` |
| 7 | Missing expectedConfidence | Added as optional field on schema |
| 8 | Mode manager bidirectional | Deferred to production concerns |
| 9 | GEMINI_SCORING_VERSION bump | Explicitly listed in "What Comes After" section |
| 10 | Few-shot token cost | Uses `initialPrompts` at session creation, paid once per session |
| 11 | Repair prompt duplication | Repair prompt removed from spike scope |

---

## New Findings

### Finding 1: Evaluation set stored as JSON loses type safety at authoring time

**Severity:** Minor
**Location:** Step 2, harness file structure (line 134)
**Claim:** The harness stores the evaluation set as `evaluation-set.json`.
**Reality:** The schema uses TypeScript types (`ScoringLabel`, `ConfidenceLabel`) that won't be enforced in a plain JSON file. The harness's `evaluate.js` runs in the browser without TypeScript, so it can't import from the source tree. But the *authoring* of 200+ items in a raw JSON file with no type checking is error-prone — a typo in `expectedLabel` (e.g., `"feels-humans"`) would be a silent bug caught only at benchmark runtime.

Meanwhile, the document says to "import and extend the existing 20 items from `llm-evaluation-set.ts`" (line 67). You can't import a `.ts` file from a `.json` file.

**Recommendation:** Keep the canonical evaluation set as a `.ts` file in the source tree (e.g., `src/shared/evaluation-set.ts`) for type safety and to import from `llm-evaluation-set.ts`. Add a small build step or script that serializes it to `evaluation-set.json` for the harness. This way authoring gets type checking and the harness gets its JSON.

---

### Finding 2: Existing Playwright test uses `channel: 'chromium'`, not `'chrome'`

**Severity:** Minor
**Location:** Step 2, harness design (line 137)
**Claim:** "Playwright uses system Chrome (`channel: 'chrome'`), not bundled Chromium."
**Reality:** This is correct for Gemini Nano access — bundled Chromium won't have it. But the existing `read-gemini-test.ts` at line 19 uses `channel: 'chromium'`:

```typescript
const context = await chromium.launchPersistentContext(userDataDir, {
  channel: 'chromium',
  headless: false,
  // ...
});
```

This means the existing test script can't actually reach Gemini Nano. The new harness correctly specifies `'chrome'`, but the document should note this is a departure from the existing convention and explain why (Gemini Nano only available in production Chrome, not Playwright's bundled Chromium).

**Recommendation:** Add a one-line note: "Must use `channel: 'chrome'` (system Chrome), not `'chromium'` (Playwright-bundled). Gemini Nano is only available in production Chrome builds with the model downloaded."

---

### Finding 3: No prompt variant tracking across experiments

**Severity:** Minor
**Location:** Step 3 ("Iterate on Prompts")
**Claim:** "Change a prompt constant → refresh → re-run. Fast iteration."
**Reality:** With 5+ experiment types (A through F) and potentially many iterations within each, there's no mechanism to track which prompt configuration produced which benchmark results. If you run the benchmark 15 times over a week, the results need to be attributable to specific prompt versions.

**Recommendation:** The harness should accept a prompt configuration as input (a JSON object or named file containing the system prompt text, optional few-shot examples, and optional temperature/topK). Each benchmark run saves the full prompt config alongside the results. This costs very little to implement and prevents "which run was the good one?" confusion.

---

### Finding 4: `initialPrompts` for few-shot is untested with Gemini Nano

**Severity:** Minor
**Location:** Step 3B (line 177)
**Claim:** "Use `initialPrompts` (user/assistant turns) at session creation so examples are paid once per session, not per item."
**Reality:** The `PromptApiCreateOptions` interface supports `initialPrompts` with `role: 'system' | 'user' | 'assistant'` (`prompt-api.ts` lines 24, 28-31). The interface exists and the production code's session creation already accepts this option. However, whether Gemini Nano actually uses multi-turn `initialPrompts` as effective few-shot context is unverified. It's possible the model ignores them, treats them differently from in-prompt examples, or has a limit on their number.

This is fine as a research hypothesis — the spike is the right place to test it. But the document should mark it as an assumption to validate early (Step 3B), not a known-working approach.

**Recommendation:** Add to Step 3B: "First experiment should verify that `initialPrompts` with user/assistant turns actually affect model output. Compare: (a) few-shot via `initialPrompts` vs (b) few-shot inline in the user prompt vs (c) no few-shot. If `initialPrompts` has no effect, fall back to inline examples and accept the per-item token cost."

---

### Finding 5: No context window overflow strategy

**Severity:** Minor
**Location:** Step 3B (line 179)
**Claim:** "Check if context window fits system prompt + examples + 6000-char input."
**Reality:** The check is noted, but the document doesn't specify what to do if it doesn't fit. With 5 few-shot examples (each containing a ~50-word input + a full JSON response), the system prompt with criteria, and a 6000-character input, the total could be 8000-10000 tokens. Gemini Nano's context window is not publicly documented at a precise number.

**Recommendation:** Add a fallback chain: (1) if 5 examples + 6000 chars doesn't fit, try 3 examples; (2) if still too large, reduce `MAX_PROMPT_CHARS` from 6000 to 4000 for the Gemini path (rules engine handles truncated posts anyway); (3) if even that's too tight, use inline examples in the system prompt text instead of `initialPrompts`. This is the kind of thing the spike will discover — just document that it's an expected outcome.

---

### Finding 6: No evaluation set versioning

**Severity:** Minor
**Location:** Step 1, Artifacts Produced
**Claim:** "200+ item labeled evaluation set — used by all future scoring work."
**Reality:** If the evaluation set evolves during the spike (items added, labels revised based on learnings), benchmark results from early runs become incomparable to later runs. The document says the eval set is reusable forever, but doesn't specify how to track changes to it.

**Recommendation:** Add a `version: number` field at the evaluation set level (not per item). Increment when items are added, removed, or relabeled. Each benchmark result records the eval set version it was run against. This lets you distinguish "accuracy improved because the prompt changed" from "accuracy changed because the eval set changed."

---

### Finding 7: No checkpoint cadence for open-ended research

**Severity:** Minor
**Location:** Step 3, "When to stop" (lines 204-212)
**Claim:** "There is no time box. The goal is the goal."
**Reality:** The stopping criteria are well-defined (>=80% acceptable accuracy, or plateau below 70%, or specific categories fundamentally blocked). But between "start" and "stop" there's no self-assessment rhythm. Research spikes without checkpoints can lose focus — spending 3 days on a failure category that's fundamentally hard while ignoring a category where a small prompt tweak would gain 10 points.

**Recommendation:** Add a lightweight checkpoint: "After every 3 experiments (or weekly, whichever is sooner), write a short status note: current accuracy by category, which experiments moved the needle, what to try next. This keeps the research directional without adding process overhead."

---

## Verified Claims

Checked against the codebase and confirmed correct:

1. **`PromptApiCreateOptions` supports `initialPrompts`** — Confirmed. `prompt-api.ts` line 24. Roles include `'user' | 'assistant'` for few-shot turns.
2. **`PromptApiCreateOptions` does not have a `temperature` field** — Confirmed. `prompt-api.ts` lines 22-26 only have `systemPrompt`, `initialPrompts`, and `monitor`.
3. **`PromptApiPromptOptions` only has `responseConstraint`** — Confirmed. `prompt-api.ts` lines 33-35.
4. **Current system prompt has "no detection-specific signals"** — Confirmed. `gemini-validation.ts` lines 12-18 mention "personal specificity, concrete details, original thinking, and human voice" but not sentence variation, contraction usage, AI vocabulary markers, or structural regularity.
5. **`MAX_PROMPT_CHARS = 6_000`** — Confirmed. `gemini-validation.ts` line 5.
6. **`GEMINI_SCORING_VERSION` is `'gemini-1'`** — Confirmed. `gemini-validation.ts` line 4.
7. **`llm-evaluation-set.ts` has 20 items with `llmLabel`, `llmConfidence`, and `acceptableLabels`** — Confirmed. Lines 1-11 define the interface; 20 items follow.
8. **`getOrCreateSession` does not pass `initialPrompts`** — Confirmed. `gemini-service.ts` line 204 passes only `{ systemPrompt: SYSTEM_PROMPT }`. No few-shot examples are currently used.
9. **Existing `read-gemini-test.ts` uses `channel: 'chromium'`** — Confirmed. Line 19.
10. **`buildScoringPrompt` does not include few-shot examples** — Confirmed. `gemini-validation.ts` lines 90-109 build only the classify instruction + text, no examples.
11. **Scoring coordinator includes rules-Gemini agreement logging** — Confirmed. `scoring-coordinator.ts` lines 234-238 log `geminiSuccess` and `rulesFallback` counts after queue processing.

## Questions for the Author

1. **Where does the harness serve `evaluate.html` from?** The document says Playwright navigates to the page, but doesn't specify a local dev server. Does it use `file://` protocol (some Chrome APIs may not work), or does the harness spin up a local HTTP server?

2. **How does the harness inject prompt variants into `evaluate.js`?** The document says "change a prompt constant → refresh → re-run" — does this mean editing a JS file and refreshing the browser page? Or is there a URL parameter or config injection mechanism?

3. **Should the harness also test the `responseConstraint` schema, or just free-form output?** The production code uses `responseConstraint`. If the harness tests with it, the invalid JSON rate will be lower than without it. Should the benchmark run both modes to measure the schema's effect?

---

## Statistics

| Metric | Count |
|--------|-------|
| Plan docs reviewed | 1 |
| Previous findings addressed | 11/11 |
| New critical findings | 0 |
| New major findings | 0 |
| New minor findings | 7 |
| Nits | 0 |
| Verified claims | 11 |
| Open questions | 3 |

## Recommendation

The revised document is ready for implementation. All previous major findings have been addressed — the dual-scoring acknowledgment, temperature investigation framing, truncation coverage, and few-shot token placement were all handled correctly.

The remaining 7 minor findings are all implementable during the spike without requiring a document revision. The most practically useful ones: (1) keep the eval set as TypeScript for type safety and generate JSON for the harness, (3) track prompt configurations alongside benchmark results, and (7) add a lightweight weekly checkpoint to keep the open-ended research directional.

This is a well-scoped research spike with clear success criteria, a sound measurement strategy, and an appropriate separation between research and production integration. Proceed.
