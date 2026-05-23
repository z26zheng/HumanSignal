# Research Spike: Combined TMR + Rules Engine Scoring

**Revised:** 2026-05-13

**Goal:** Test whether combining TMR probability scores with rules engine classification fixes each engine's known failure modes and produces better labels than either alone.

**Why now:** Both engines already work. TMR runs in a standalone page (~113ms). Rules runs in Node (<5ms). We can test combinations immediately without any production integration.

---

## The Hypothesis

From the TMR spike results:

| Failure | TMR | Rules | Combined? |
|---------|-----|-------|-----------|
| Engagement bait classified as human | TMR: 0.36 (human) | Rules: `almost-certainly-ai` (correct) | Rules overrides → correct |
| Human questions classified as AI | TMR: 0.90 (AI — wrong) | Rules: `feels-human` (correct, detects question pattern) | Rules overrides on short text → correct |
| Short text defaults to AI | TMR: 0.82 (AI — wrong) | Rules: `cant-tell` (correct) | Rules overrides on short text → correct |
| AI detection confidence low | TMR: 0.57 (weak AI signal) | Rules: `likely-ai` (correct, detects cliches) | Both agree on direction → boosted confidence |
| Polished AI without cliches | TMR: good (RAID trained) | Rules: misses (no cliche to match) | TMR covers → correct |
| Human posts with metrics | TMR: 0.12-0.21 (strong human) | Rules: `feels-human` (correct) | Both agree → high confidence |

The hypothesis: the combined system is better than either alone because **rules catches what TMR misses (engagement bait, short text, comments) and TMR catches what rules misses (polished AI, subtle stylistic signals).**

---

## What We Already Have

| Engine | Status | Where |
|--------|--------|-------|
| TMR (standalone page) | Working, Q4 variant, tested on 40 golden set items | `spike/tmr-detector/` |
| Rules engine | Working, tested on 112 golden set items | `src/rules-engine/` |
| Golden set | 112 items across 14 categories | `src/rules-engine/golden-set.ts` |
| LLM evaluation set | 20 items | `src/rules-engine/llm-evaluation-set.ts` |

Both engines work individually. We need to **run both on the same items, merge the scores, and test combiner logic.** Two small data gaps must be filled first.

---

## Step 0: Fill Data Gaps

### Gap 1: Rules engine per-item scores on the full golden set

The existing `evaluate-rules.ts` runs against `LLM_EVALUATION_SET` (20 items), not `GOLDEN_SET` (112 items), and outputs a summary report — not per-item results with label, confidence, and dimensions.

**Action:** Create `spike/combined-scoring/extract-rules-scores.ts` that runs `scoreWithRules` on every `GOLDEN_SET` item and outputs per-item JSON: `{ id, text, itemType, charCount, rulesLabel, rulesConfidence, rulesDimensions }`.

### Gap 2: TMR scores on the full golden set

The TMR spike tested 40 of 112 golden set items. The remaining 72 have never been scored by TMR.

**Action:** Run all 112 golden set items through the TMR standalone page. The predictions in "What We Expect to Find" are based on the 40-item subset and may not hold for all categories.

Both gaps are <1 hour of work each.

---

## Step 1: Merge Both Engines' Raw Scores

### Rules engine scores

From the new `extract-rules-scores.ts` script (Step 0).

### TMR scores

From the full 112-item TMR run (Step 0). Reuse the TMR standalone page, feed all items, batch-classify, dump results.

### Output

A single merged file with both engines' scores for each item:

```typescript
interface DualScoreItem {
  id: string;
  text: string;
  itemType: 'post' | 'comment';
  charCount: number;
  expectedLabel: ScoringLabel;
  acceptableLabels: ScoringLabel[];

  // Rules engine
  rulesLabel: ScoringLabel;
  rulesConfidence: ConfidenceLabel;
  rulesDimensions: ScoreDimensions;

  // TMR
  tmrAiProbability: number;
}
```

---

## Step 2: Implement the Combiner as a Standalone Script

Write a simple Node script that takes the dual-score data and tests different combiner strategies.

```
spike/combined-scoring/
├── dual-scores.json           — merged output from Step 1
├── combine.ts                 — combiner logic (pure functions, no extension dependencies)
├── run-experiment.ts          — tests different weight/threshold configs against dual-scores
└── results/                   — output per experiment
```

### Combiner strategies to test

**Strategy A: Rules override + TMR weighted**

```
if engagementBait → rules wins (almost-certainly-ai)
if charCount < shortTextCutoff → rules only (TMR weight = 0)
else → weighted combination of TMR + rules dimensions
```

Test `shortTextCutoff` at 50, 75, 100, and 150 chars. The rules engine's own short-post threshold is 50 chars (`shortPostMaxChars` in classifier.ts), but TMR's short-text failure mode may extend higher. The optimal cutoff is where TMR starts being reliable.

**Strategy B: TMR as tiebreaker**

```
Rules runs first, produces a label.
If rules says cant-tell or possibly-ai (low confidence):
  → TMR breaks the tie (if TMR > 0.7, upgrade to likely-ai; if TMR < 0.3, upgrade to feels-human)
Otherwise → rules label stands.
```

**Strategy C: TMR as confidence modifier**

```
Rules label is always the primary label.
TMR adjusts confidence:
  → if TMR agrees with rules direction → boost confidence
  → if TMR disagrees → lower confidence
  → if TMR strongly disagrees (TMR < 0.2 but rules says likely-ai) → downgrade label one step
```

**Strategy D: Weighted score (from Combined Architecture doc)**

```
tmrSignal = (tmrAiProbability - 0.5) * 2
rulesSignal = (engagementBait + templating) - (authenticity + specificity) normalized
combinedScore = tmrWeight * tmrSignal + rulesWeight * rulesSignal
→ map score to label via thresholds
```

**Calibration warning:** The rules engine's dimensions (`calculateDimensions` in classifier.ts) are not on a common scale. `authenticity` saturates at 6 mentions, `engagementBait` is a 0-1 binary score. Subtracting raw dimensions assumes they're comparable magnitudes, which they're not. Strategy D may need z-score normalization across the golden set, or percentile ranks, before the formula works correctly. This is the most experimental strategy — expect iterative calibration. The simpler strategies (A, B, C) are more likely to work out of the box.

Test each strategy with multiple weight configurations.

---

## Step 3: Measure Each Strategy

For each combiner configuration, compute:

| Metric | How |
|--------|-----|
| Exact accuracy | % matching `expectedLabel` |
| Acceptable accuracy | % matching any `acceptableLabels` |
| Per-category accuracy | Breakdown by the 14 golden set categories |
| Improvement over rules-only | +/- points per category vs rules alone |
| Improvement over TMR-only | +/- points per category vs TMR alone |
| False positive rate on human content | % of human items labeled `likely-ai` or `almost-certainly-ai` |
| Engagement bait accuracy | Does rules override work? |
| Short text accuracy | Does rules override work? |
| Comment accuracy | Does TMR weight reduction on comments help? |
| Sticker flicker rate | How often does combined label differ from rules-only label? (predicts UX impact) |
| % of items requiring TMR | How many items does each strategy actually send to TMR vs resolve with rules alone? Strategy B may only need TMR for 20-30% of items; Strategy D needs it for all. Affects total latency in production. |
| Architecture compatibility | Can this strategy work within the existing "rules-first, TMR upgrades later" pattern? Or does it require blocking on TMR before returning a label? |

### Architecture compatibility note

The current scoring coordinator returns rules results synchronously, then queues async upgrades. This matters:

- **Strategies B and C** are compatible: rules returns immediately, TMR adjusts later when it arrives (~113ms).
- **Strategies A and D** may require waiting for TMR before producing a meaningful combined label, which changes the synchronous-return contract. TMR at 113ms is barely perceptible, but it's a different pattern than the current instant-return behavior.

Even if Strategy D produces the best accuracy, Strategy B or C may be the right choice if they're close in accuracy and fit the existing architecture without changes.

### Key comparisons

| Configuration | What it tests |
|--------------|---------------|
| Rules only | Baseline — current production behavior |
| TMR only (threshold at 0.5) | What happens with TMR alone |
| Strategy A (override + weighted) | The full combined architecture proposal |
| Strategy B (TMR as tiebreaker) | Simplest integration — does it help? |
| Strategy C (TMR as confidence only) | Minimal change — TMR doesn't change labels, only confidence |
| Strategy D (weighted score) | Most complex — does the math improve over simpler strategies? |

---

## Step 4: Analyze Failure Modes

After finding the best strategy, drill into the remaining failures:

- Which items does the combined system still get wrong?
- Are they genuinely ambiguous (acceptable), or systematic errors?
- Which category has the worst accuracy?
- Are there items where combining made things **worse** (rules was right, TMR pulled it wrong)?

This tells us whether Gemini Nano is needed as a third signal, and if so, for which specific categories.

---

## What We Expect to Find

Based on the TMR spike data:

| Category | Rules alone | TMR alone | Combined (predicted) |
|----------|-----------|----------|---------------------|
| human-metrics | Good | Excellent | Excellent (both agree, high confidence) |
| human-detailed | Good | Excellent | Excellent |
| human-questions | Good | **Bad** | Good (rules overrides on comments) |
| human-specific-comments | Good | **Bad** | Good (rules overrides on short text) |
| ai-generic | Good | Moderate | Better (TMR adds signal) |
| ai-listicle | Good | Moderate | Better |
| engagement-bait | Excellent | **Bad** | Excellent (rules overrides) |
| cant-tell | Good | **Bad** | Good (rules overrides) |
| comment-ai-praise | Good | Moderate | Better (both contribute) |

If this prediction holds, the combined system should outperform both individual engines on every category.

---

## Spike Outputs

| Output | What it tells us |
|--------|-----------------|
| Best combiner strategy | Which approach (A/B/C/D) to implement in production |
| Best weight configuration | Specific numbers for tmrWeight, thresholds, override conditions |
| Per-category accuracy comparison (rules vs TMR vs combined) | Proof that combining helps |
| Remaining failure categories | Input for whether Gemini Nano is needed as a third signal |
| Sticker flicker rate | Whether the rules→combined label change is too frequent for good UX |

## Decision After Spike

| Result | Next step |
|--------|----------|
| Combined achieves ≥80% acceptable accuracy AND outperforms rules-only by ≥5 points | Proceed with combined architecture. The combiner strategy and weights feed directly into `score-combiner.ts`. |
| Combined achieves ≥80% but rules-only is already ≥75% | The improvement is real but small. Document the tradeoff: is ~5 points worth the added complexity of TMR integration, model download, memory cost? |
| Combined < 80% acceptable accuracy | Neither engine alone or combined meets the bar. Gemini Nano or rules engine improvements are needed before shipping. |
| Combined is worse on some categories | Analyze why. Adjust weights or override conditions. May need per-category weight profiles. |
| Sticker flicker rate > 30% | The label changes too often between rules and combined. Consider: (a) delay sticker until TMR returns (~113ms, barely noticeable), or (b) only show combined label, never rules-only. |
