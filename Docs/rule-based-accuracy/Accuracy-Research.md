# Accuracy Research: Rules Engine Scoring

Date: 2026-05-13

Priority: **Do this second**, after Gemini Nano improvements. Gemini results will reveal which cases the rules engine needs to cover and which it can delegate.

## Summary

The rules engine uses shallow heuristics and misses the strongest AI detection signals identified in recent research. This document diagnoses the root causes and scopes specific improvements. See `Accuracy-Gemini-Nano.md` for the companion Gemini research (do that first).

---

## 1. Current State Audit

### Rules Engine

The classifier (`classifier.ts`) uses a priority-ordered if/else waterfall with ~20 text features. Once the first condition matches, it stops.

Systematic failures:

| Failure type | Why it happens | Example |
|-------------|---------------|---------|
| Genuine human post labeled `cant-tell` | No numbers, no named entities, no engagement bait — falls through every rule to the default | A thoughtful personal reflection without statistics |
| AI post with fake stat labeled `feels-human` | First-person + number triggers "specific personal experience" rule | "I improved retention by 34% using these 5 frameworks" (written by ChatGPT) |
| AI-polished human post misclassified | Polished AI style removes contractions and normalizes sentence length, triggering no negative rules | Human writes draft, GPT refines it |
| Long AI comment labeled `cant-tell` | No generic praise phrases, length > threshold, unique word ratio passes | Multi-paragraph AI comment that avoids cliches |

### Feature Gaps

The strongest signals identified in recent research are completely absent from `features.ts`:

| Signal | Research finding | In our code? |
|--------|-----------------|-------------|
| Sentence length variance (burstiness) | Humans: high variance. AI: uniform. One of the strongest single discriminators. | No |
| Contraction rate | AI avoids contractions ("do not" vs "don't"). Humans contract 60-70% of the time. | No |
| Em dash / semicolon overuse | AI uses em dashes at ~10x the human rate. | No |
| AI-signature vocabulary | Words like "delve," "intricate," "meticulous," "tapestry," "leverage," "utilize" appear at abnormal rates in AI text. | No |
| Transition word density | AI overuses "Furthermore," "Moreover," "Additionally." | No |
| Paragraph length variance | AI produces suspiciously regular paragraph lengths. | No |
| Formulaic hedges | AI uses "it is important to note," "one might argue." Humans use "I think," "maybe," "I'm not sure." | No |
| Character distribution signatures | AI trained on balanced corpora approximates global character patterns; humans show domain-specialized distributions. | No |

### Gemini Prompt

Covered separately in `Accuracy-Gemini-Nano.md`. The Gemini prompt rewrite should be completed first so we can measure which cases Gemini handles well before deciding what the rules engine must cover.

### Golden Set

The golden set has ~100 items across 13 categories. All items are synthetic (hand-written for this project). They clearly represent each category but do not cover:
- Real LinkedIn content patterns (messy, ambiguous).
- AI output from different models (ChatGPT, Claude, Gemini, Llama) with different styles.
- Human posts that look AI-like (formal professionals who naturally write without contractions).
- AI posts with injected specificity (fake stats, fake company names).
- Hybrid posts (human-drafted, AI-polished).

---

## 2. Research Findings (2025-2026)

### What works best for AI text detection

| Approach | Accuracy | Tradeoffs |
|---------|----------|-----------|
| Fine-tuned transformer encoders (DeBERTa, RoBERTa) | ≥0.994 AUROC in-distribution | Requires GPU, large model, does not generalize across LLM sources |
| Stylometric-hybrid XGBoost pipelines | Matches transformers, more interpretable | Needs feature engineering, calibration data |
| Perplexity-based methods | Good baseline | Needs a reference language model — not feasible on-device |
| Character distribution (LD-Score) | Complements perplexity, low correlation (r=0.08-0.13) | Requires domain-calibrated baselines |
| StyleDecipher (combined discrete + continuous stylistic features) | 36% improvement over baselines cross-domain | Research prototype, not productized |
| Few-shot prompted LLM classification | Good for nuanced cases | Depends on model quality and prompt design |

### Key insight

No single method generalizes robustly across all LLM sources and domains. The best practical approach combines:
1. **Stylometric features** (burstiness, contractions, signature vocabulary) for a fast, explainable baseline.
2. **LLM-based classification** (Gemini Nano) for nuanced/ambiguous cases with good prompting.
3. **A diverse evaluation set** to catch regressions and calibrate thresholds.

### What LinkedIn itself does

LinkedIn's algorithm (2026) reportedly reduces reach for pure AI posts by 20-40%, but hybrid posts (AI draft + human edits) perform identically to fully human-written posts. This confirms that the hard problem is the hybrid zone, not the obvious extremes.

---

## 3. Improvement Plan

### Improvement 1: Add missing stylometric features

**Impact: High. Effort: 2-3 days.**

Add to `features.ts`:

```typescript
interface TextFeatures {
  // ... existing fields ...

  // New: sentence-level variance
  sentenceLengthStdDev: number;      // SD of word counts per sentence
  sentenceLengthCoefficientOfVar: number; // CV = stddev/mean

  // New: contraction analysis
  contractionCount: number;           // count of don't, can't, won't, I'm, etc.
  contractionOpportunityCount: number; // count of do not, can not, will not, I am, etc.
  contractionRate: number;            // contractions / (contractions + opportunities)

  // New: AI punctuation signals
  emDashCount: number;                // — and –
  semicolonCount: number;

  // New: AI vocabulary signals
  aiSignatureWordCount: number;       // delve, intricate, meticulous, tapestry, leverage, utilize, etc.
  transitionWordCount: number;        // Furthermore, Moreover, Additionally, Consequently, etc.
  transitionWordDensity: number;      // transition words / total words
  formalHedgeCount: number;           // "it is important to note", "one might argue", etc.
  genuineUncertaintyCount: number;    // "I think", "maybe", "I'm not sure", "probably", etc.

  // New: structural regularity
  paragraphLengthStdDev: number;      // SD of word counts per paragraph
  paragraphLengthCoefficientOfVar: number;
}
```

New pattern lists to add to `patterns.ts`:

```typescript
AI_SIGNATURE_WORDS: [
  'delve', 'intricate', 'meticulous', 'tapestry', 'leverage',
  'utilize', 'aforementioned', 'commendable', 'pivotal',
  'encompass', 'multifaceted', 'nuanced', 'paradigm',
  'holistic', 'synergy', 'streamline', 'robust',
]

TRANSITION_WORDS: [
  'furthermore', 'moreover', 'additionally', 'consequently',
  'nevertheless', 'in conclusion', 'to summarize',
  'it is worth noting', 'in essence', 'in summary',
]

FORMAL_HEDGES: [
  'it is important to note', 'it is worth mentioning',
  'one might argue', 'it should be noted',
  'it goes without saying', 'needless to say',
  'it is essential to', 'it is crucial to',
]

GENUINE_UNCERTAINTY: [
  "i'm not sure", "i think", "maybe", "probably",
  "it felt like", "i'm still figuring", "honestly",
  "not gonna lie", "tbh", "imo", "i might be wrong",
  "i could be wrong", "hard to say",
]

CONTRACTION_MAP: {
  "don't": "do not", "can't": "cannot", "won't": "will not",
  "isn't": "is not", "aren't": "are not", "wasn't": "was not",
  "weren't": "were not", "hasn't": "has not", "haven't": "have not",
  "didn't": "did not", "doesn't": "does not",
  "i'm": "i am", "i've": "i have", "i'd": "i would",
  "i'll": "i will", "it's": "it is", "that's": "that is",
  "we're": "we are", "we've": "we have", "we'd": "we would",
  "they're": "they are", "there's": "there is",
}
```

### Improvement 2: Replace the if/else waterfall with weighted scoring

**Impact: High. Effort: 2-3 days.**

Replace `classifyPost()` and `classifyComment()` with a single `classify()` that computes a continuous score:

```
humanSignals = (
  w_burstiness      * normalize(sentenceLengthCoefficientOfVar) +
  w_contractions     * contractionRate +
  w_firstPerson      * normalize(firstPersonCount) +
  w_concreteDetail   * normalize(concreteNumberCount + namedEntityCount + dateReferenceCount) +
  w_uncertainty      * normalize(genuineUncertaintyCount) +
  w_evidence         * normalize(evidenceCount)
)

aiSignals = (
  w_aiVocab          * normalize(aiSignatureWordCount) +
  w_emDash           * normalize(emDashCount) +
  w_transitions      * normalize(transitionWordDensity) +
  w_formalHedge      * normalize(formalHedgeCount) +
  w_genericPhrase    * genericPhraseRatio +
  w_motivational     * normalize(motivationalClicheCount) +
  w_engagementBait   * engagementBaitScore +
  w_lowBurstiness    * (1 - normalize(sentenceLengthCoefficientOfVar)) +
  w_noContractions   * (1 - contractionRate)
)

score = humanSignals - aiSignals  // range roughly -1 to +1
```

Map to labels:

| Score range | Label |
|-------------|-------|
| > 0.4 | `feels-human` |
| 0.1 to 0.4 | `possibly-ai` |
| -0.2 to 0.1 | `likely-ai` |
| < -0.2 | `almost-certainly-ai` |
| text too short (<50 chars post, <10 chars comment) | `cant-tell` |

Engagement bait patterns still get a hard override to `almost-certainly-ai` when score exceeds a high threshold.

Weights should be calibrated against the golden set and tuned until the set passes at ≥85% accuracy.

### Improvement 3: Expand and diversify the golden set

**Impact: Medium (enables calibration). Effort: 3-5 days (ongoing).**

Target: 300-500 items.

New categories to add:

| Category | Count | Purpose |
|----------|-------|---------|
| Real LinkedIn posts (anonymized) | 50 | Calibrate against real-world distribution |
| ChatGPT-generated posts | 30 | Test against the most common AI source |
| Claude-generated posts | 20 | Test cross-model generalization |
| Gemini-generated posts | 20 | Test against the model we're using for detection |
| Human posts that look AI-like | 30 | Catch false positives on formal writers |
| AI posts with injected specificity | 20 | Catch fake stats / fake names |
| Hybrid posts (human + AI polish) | 30 | The hardest and most common real-world case |
| Non-English posts | 20 | Ensure graceful `cant-tell` |
| Edge cases (emoji-heavy, very long, code snippets) | 30 | Robustness |

Method for gathering real posts:
- Browse LinkedIn, paraphrase/anonymize posts manually.
- Generate AI posts using ChatGPT/Claude/Gemini with typical LinkedIn prompts.
- Ask volunteers to write hybrid posts.

### Improvement 4: Add a confidence calibration mechanism

**Impact: Medium. Effort: 1-2 days.**

Currently, confidence is assigned ad hoc (`high`, `medium`, `low`). Instead:

- Track the margin between humanSignals and aiSignals.
- Large margin → `high` confidence.
- Small margin → `low` confidence.
- When confidence is `low`, prefer `cant-tell` over a wrong label.

For Gemini: if the rules engine and Gemini disagree, lower the confidence of the final result and include both perspectives in the explanation.

---

## 4. Delivery Plan

**Prerequisite:** Complete `Accuracy-Gemini-Nano.md` first. Gemini accuracy improvements will reveal which failure patterns the rules engine must handle and which it can delegate.

| Improvement | Effort | Depends on | Expected accuracy gain |
|-------------|--------|-----------|----------------------|
| 1. New stylometric features | 2-3 days | Gemini research completed | Catches AI posts that currently slip through as `cant-tell` |
| 2. Weighted scoring classifier | 2-3 days | Improvement 1 | Eliminates waterfall blindspots, enables combined-signal classification |
| 3. Expanded golden set | 3-5 days (ongoing) | Can start during Gemini work | Enables calibration and regression detection |
| 4. Confidence calibration | 1-2 days | Improvement 2 | Fewer wrong high-confidence labels |

**Total: 8-13 days after Gemini research is complete.**

### Suggested order

1. **Improvement 3 starts early** — expand golden set while Gemini work is in progress.
2. **Improvement 1 + 2 together** — add features and rebuild classifier after Gemini results inform what the rules engine must cover.
3. **Improvement 4** — tune confidence after the scoring changes stabilize.

---

## 5. Success Metrics

| Metric | Current (estimated) | Target |
|--------|-------------------|--------|
| Golden set accuracy (rules engine) | ~70-75% | ≥85% |
| Golden set accuracy (Gemini) | See Accuracy-Gemini-Nano.md | See Accuracy-Gemini-Nano.md |
| False positive rate on human posts | High (formal human writers misclassified) | <10% |
| False negative rate on AI posts (with fake stats) | High (fake specificity fools rules) | <15% |
| `cant-tell` rate on classifiable content | High (too many fallbacks) | <20% of posts >50 chars |
| Rules/Gemini agreement rate | Unknown | >70% on clear cases |
| User "Disagree" feedback rate | Not yet measurable | <15% |

---

## 6. What We Cannot Solve

Some limitations are fundamental:

1. **Hybrid posts** (human-drafted, AI-polished) will always be the hardest category. Even research models struggle here. Our goal should be `possibly-ai`, not `almost-certainly-ai`, for these.

2. **Formal human writers** who naturally write without contractions and with regular structure will sometimes get `possibly-ai`. The confidence system should flag these as low-confidence.

3. **Adversarial evasion** — if someone specifically rewrites AI text to bypass detection, no local-only system will catch it reliably. This is an arms race we don't need to win; we just need to catch the common cases.

4. **Short text** (<50 characters) simply doesn't contain enough signal. `cant-tell` is the honest answer.

---

## 7. References

- GPTZero: Robust Detection of LLM-Generated Texts (arXiv 2602.13042, 2026)
- Beyond Perplexity: Character Distribution Signatures and the MDTA Benchmark (arXiv 2605.01647, 2026)
- AI-Generated Text Detection Using DeBERTa with Auxiliary Stylometric Features (RANLP 2025)
- StyleDecipher: Robust and Explainable Detection with Stylistic Analysis (arXiv 2510.12608, 2025)
- Mixture of Stylistic Experts (EMNLP 2025)
- Google Prompt API documentation: Prompt design for Gemini Nano (2026)
- Google Structured Output support for the Prompt API (Chrome 137, 2025)
