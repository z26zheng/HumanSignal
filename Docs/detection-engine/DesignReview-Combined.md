# Review: Combined TMR + Rules Engine Scoring Spike

**Reviewer:** Cursor Agent (b2e76800)
**Plan doc:** `Docs/detection-engine/Spike-Combined-TMR-Rules.md`
**Review date:** 2026-05-13

## Verdict

APPROVE

## Summary

This is a well-designed offline experiment that builds directly on verified spike data. The four combiner strategies span a useful complexity range (simple override → weighted score), the measurement framework is thorough, and the decision table at the end is clear. The document correctly identifies sticker flicker rate as a first-class metric. Two findings about data gaps need attention: the existing eval script needs modification to produce per-item output, and the TMR spike only covered 40 of 112 golden set items.

---

## Detailed Findings

### Finding 1: `evaluate-rules.ts` doesn't produce per-item output

**Severity:** Major
**Location:** Step 1, rules engine scores (lines 44-51)
**Claim:** "Already available via `scripts/evaluate-rules.ts`. Run it and capture per-item results."
**Reality:** The current `evaluate-rules.ts` runs against the `LLM_EVALUATION_SET` (20 items), not the `GOLDEN_SET` (112 items). It outputs a summary report with `agreementRate`, `confusion`, and `disagreements` — not per-item `{ id, text, rulesLabel, rulesConfidence, rulesDimensions }`.

The script would need to be modified or a new script written to:
1. Run against `GOLDEN_SET` instead of `LLM_EVALUATION_SET`.
2. Output per-item results with the full `ClassificationResult` fields (label, confidence, dimensions, reasons).
3. Output JSON that can be merged with TMR results.

The document says "already available" but it's not — this is a script modification task.

**Recommendation:** Change to: "Modify `evaluate-rules.ts` (or create a new `spike/combined-scoring/extract-rules-scores.ts`) to run `scoreWithRules` on every `GOLDEN_SET` item and output per-item JSON with label, confidence, and dimensions."

---

### Finding 2: TMR spike only tested 40 of 112 golden set items

**Severity:** Major
**Location:** Step 1, TMR scores (lines 54-57)
**Claim:** The hypothesis table (lines 15-23) and predictions table (lines 186-197) reference specific per-category TMR scores. Step 1 says to "feed all 112 golden set items through TMR."
**Reality:** The TMR spike RESULTS.md states "tested on 40 golden set items" (line 32), and the score distribution table (lines 45-58) shows only a subset of categories with 1-5 items each. Several categories from the golden set are missing from the TMR results (e.g., `comment-cant-tell`, `post-possibly-ai`, the second detailed-human category).

This means 72 items have never been scored by TMR. Step 1 requires running all 112, which is new work, not "already available." The predictions in the "What We Expect to Find" table (line 186) are extrapolations from partial data.

**Recommendation:** Acknowledge this in Step 1: "The TMR spike tested 40 items. This step runs all 112 through TMR for the first time. The predictions table is based on the 40-item subset and may not hold for all categories." This doesn't change the spike plan, but it sets correct expectations.

---

### Finding 3: Strategy A's 100-char threshold diverges from rules engine's 50-char threshold

**Severity:** Minor
**Location:** Step 2, Strategy A (lines 98-105)
**Claim:** `if charCount < 100 → rules only (TMR weight = 0)`
**Reality:** The rules engine's own short-post threshold is `shortPostMaxChars: 50` (`classifier.ts` line 26). Strategy A proposes a 100-char cutoff for TMR exclusion, which is twice the rules engine's internal threshold. This creates a gap: posts between 50-100 chars get a rules label from the normal classification flow (which may not be `cant-tell`, since the rules engine checks for other patterns first), but TMR is excluded.

This is likely intentional — the TMR spike showed poor accuracy on short text — but the document should make this explicit. It's also worth testing whether 75 chars, 100 chars, or 150 chars is the right cutoff, since the optimal boundary depends on where TMR's short-text failure mode actually begins.

**Recommendation:** Add the 100-char threshold to the "configurations to test" for Strategy A. Test at least 50, 100, and 150 to find where TMR becomes reliable.

---

### Finding 4: Strategy D's rulesSignal formula uses raw dimensions that are weakly calibrated

**Severity:** Minor
**Location:** Step 2, Strategy D (lines 126-134)
**Claim:** `rulesSignal = (engagementBait + templating) - (authenticity + specificity) normalized`
**Reality:** The rules engine's `calculateDimensions` function in `classifier.ts` (lines 168-178) produces dimensions from simple feature ratios:

```typescript
authenticity: clamp01((firstPersonCount + evidenceCount) / 6)
specificity: clamp01((concreteNumberCount + namedEntityCount + dateReferenceCount) / 5)
engagementBait: engagementBaitScore  // directly from feature extraction
templating: clamp01(motivationalClicheCount / 3 + listicleScore / 2)
```

These dimensions are not calibrated to a common scale. `authenticity` saturates at 6 first-person + evidence mentions, while `engagementBait` is a 0-1 binary pattern score. Subtracting them assumes they're comparable magnitudes, which they're not. A post with 2 first-person markers and 1 evidence marker gets `authenticity = 0.5`, while a non-engagement-bait post gets `engagementBait = 0`. The formula would produce `rulesSignal = (0 + templating) - (0.5 + specificity)`, which may be negative for any human post, regardless of TMR's opinion.

**Recommendation:** Strategy D should normalize each dimension to z-scores across the golden set before combining, or use percentile ranks. Alternatively, acknowledge that Strategy D is the most experimental and may need iterative calibration. The simpler strategies (A, B, C) are more likely to work out of the box.

---

### Finding 5: No discussion of how combined scoring interacts with the current scoring coordinator

**Severity:** Minor
**Location:** Throughout
**Claim:** The document is scoped as an offline experiment with no production changes.
**Reality:** This is correct and well-scoped. But the document doesn't note one important architectural implication: the current scoring coordinator (`scoring-coordinator.ts` lines 79-86) runs rules first and returns results immediately, then queues Gemini as an async upgrade. If TMR is added:

- **Strategies B and C** (TMR as tiebreaker/confidence modifier) could work within this pattern: rules return immediately, TMR adjusts when it arrives.
- **Strategies A and D** (TMR as weighted component) would require waiting for TMR before returning a label, which changes the synchronous-return contract of `handleScoreBatch`.

TMR inference is ~113ms. That's fast enough to block on (barely perceptible), but the current architecture doesn't block on async scoring for the initial response. The spike should note which strategies are compatible with the "rules-first, upgrade later" pattern and which require architectural change.

**Recommendation:** Add a row to the Step 3 metrics table: "Compatible with current rules-first architecture? (yes = label from rules, TMR adjusts later; no = must wait for TMR before returning label)." This helps the decision after the spike — even if Strategy D produces the best accuracy, it may be cheaper to ship Strategy B or C because it fits the existing architecture.

---

### Finding 6: Missing metric — TMR latency impact on combined scoring

**Severity:** Minor
**Location:** Step 3, metrics table (lines 141-154)
**Claim:** The metrics table measures accuracy and sticker flicker rate but not latency.
**Reality:** TMR inference averages 113ms per item. In the combined architecture, this latency is additive if TMR runs sequentially after rules. If a user scrolls past 10 new posts, that's 1.13 seconds of TMR scoring (sequential) before combined labels are available. The current rules-only scoring is synchronous (<5ms total), so the combined system would have a materially different latency profile.

This doesn't affect the offline experiment, but the spike should measure: for the winning strategy, how many items require TMR scoring? If Strategy B only sends uncertain items to TMR, only 20-30% of items need TMR, which keeps total latency low. If Strategy D requires TMR for every item, the latency impact is larger.

**Recommendation:** Add a metric: "% of items requiring TMR scoring" per strategy. This is computable from the dual-score data — count how many items each strategy actually sends to TMR vs. resolves with rules alone.

---

### Finding 7: The 10-point improvement threshold is arbitrary

**Severity:** Minor
**Location:** Decision After Spike (line 216)
**Claim:** "Combined > rules-only by ≥10 points acceptable accuracy → Proceed with combined architecture."
**Reality:** 10 points is a reasonable bar, but the value depends on what the rules-only baseline is. If rules-only is at 85% acceptable accuracy, a 10-point improvement to 95% is very meaningful. If rules-only is at 60%, a 10-point improvement to 70% is still below the product's ≥80% target. The decision should be framed as "combined achieves ≥80% acceptable accuracy AND improves over rules-only by a meaningful margin."

**Recommendation:** Change the decision criterion to: "Combined achieves ≥80% acceptable accuracy AND outperforms rules-only by ≥5 points. If combined reaches ≥80% but rules-only is already at ≥75%, the 5-point margin may not justify the complexity — document the tradeoff."

---

## Verified Claims

Checked against the codebase and confirmed correct:

1. **Golden set has 112 items across 14 categories** — Confirmed. `golden-set.ts`: 14 `GoldenCategory` entries × 8 samples each = 112 items.

2. **Rules engine scores via `scoreWithRules` return label, confidence, dimensions, and explanation** — Confirmed. `rules-engine.ts` lines 11-29 return a full `ScoringResult`.

3. **Classification thresholds are configurable** — Confirmed. `classify()` in `classifier.ts` line 37-44 accepts an optional `thresholds` parameter with `DEFAULT_CLASSIFICATION_THRESHOLDS` as default.

4. **Rules engine detects engagement bait as the first check** — Confirmed. `classifyPost` in `classifier.ts` line 51-53 checks `engagementBaitScore > 0.7` before anything else.

5. **Rules engine handles short posts with `charCount < 50 → cant-tell`** — Confirmed. `classifier.ts` line 56-58.

6. **Rules engine detects question comments** — Confirmed. `classifyComment` in `classifier.ts` lines 115-117 checks `questionCount >= 1 && charCount > 30`.

7. **TMR spike tested Q4 variant at ~113ms average latency** — Confirmed. RESULTS.md line 41.

8. **TMR misclassifies engagement bait as human** — Confirmed. RESULTS.md line 20: "engagement bait → human 0.94."

9. **TMR misclassifies human questions as AI (0.90)** — Confirmed. RESULTS.md line 51: "comment-human-question → 0.901 avg AI score, 0H/3AI."

10. **TMR classifies short/ambiguous text as AI** — Confirmed. RESULTS.md line 57: "cant-tell → 0.822 avg AI, 0H/3AI."

11. **The scoring coordinator runs rules first then queues Gemini** — Confirmed. `scoring-coordinator.ts` lines 79-86: `scoreWithRules` runs synchronously, then Gemini is queued at lines 93-103.

12. **`evaluate-rules.ts` runs against `LLM_EVALUATION_SET`, not `GOLDEN_SET`** — Confirmed. Script imports and iterates over `LLM_EVALUATION_SET` (line 1, 19).

13. **`spike/combined-scoring/` directory does not yet exist** — Confirmed. No files found.

14. **TMR spike data covers 40 items, not 112** — Confirmed. RESULTS.md line 32: "tested on 40 golden set items."

## Questions for the Author

1. **Should the combiner strategies use the rules engine's `dimensions` or the raw `TextFeatures`?** Strategy D references dimensions, but `TextFeatures` (from `features.ts`) has more granular signals (e.g., `motivationalClicheCount`, `firstPersonCount`) that are collapsed by `calculateDimensions`. Would using raw features give the combiner more information?

2. **Will the TMR scores for this spike come from the standalone page or the extension offscreen document?** The TMR spike confirmed the standalone page works but the offscreen document is still blocked on bundling. If this spike uses the standalone page, the latency numbers are valid but the "coexistence with Gemini" aspect isn't tested.

3. **Is there a plan to test with the 200-item evaluation set from the Gemini accuracy spike, or only the 112-item golden set?** The golden set was designed for rules engine testing and lacks hybrid content, AI-with-fake-stats, and multi-model AI content. The combined scoring spike would benefit from the harder items once the evaluation set exists.

---

## Statistics

| Metric | Count |
|--------|-------|
| Plan docs reviewed | 1 (+ RESULTS.md for context) |
| Critical findings | 0 |
| Major findings | 2 |
| Minor findings | 5 |
| Nits | 0 |
| Verified claims | 14 |
| Open questions | 3 |

## Recommendation

The spike is well-designed and should proceed. It builds on verified data, requires no production code changes, and produces clear decision criteria.

The two major findings are both about data availability, not design. Fix them at the start of the spike: (1) write a script to produce per-item rules scores on the full 112-item golden set, and (2) run all 112 items through TMR to fill the 72-item gap from the previous spike. Both are <1 hour of work each.

The most practically useful addition would be the architectural compatibility metric (Finding 5). Strategies B and C fit the existing "rules-first, upgrade later" pattern; Strategies A and D may require blocking on TMR. Knowing this upfront helps the team pick the right strategy even if a more complex one scores marginally higher.
