# Research Spike: Gemini Nano Scoring Accuracy

**Revised:** 2026-05-13 (second revision)  
**Type:** Research spike (goal-oriented, not time-boxed)  
**Goal:** Achieve ≥80% acceptable accuracy on a diverse, properly labeled evaluation set.  
**Scope:** Research and experimentation only. No production code changes until accuracy is proven.

---

## The One Thing That Matters

We need **good labeled data** and a **fast way to test prompts against it**. Everything else follows from that.

The spike is done when we can demonstrate that a specific prompt configuration achieves ≥80% acceptable accuracy on a diverse evaluation set that includes the hard cases (polished AI, fake stats, hybrid posts, formal human writers). Until then, we keep iterating.

---

## Why Accuracy Is Broken Today

We've never measured it. The current system has:

- A system prompt with high-level guidance but no detection-specific signals.
- Zero few-shot examples.
- No temperature control (defaults to 1.0 — randomizes output).
- A 20-item evaluation set that's too small and too clean to reveal real failure patterns.

We don't know if accuracy is 40% or 75%. We can't improve what we can't measure.

**Architectural context for later:** The scoring coordinator always runs rules first, then queues Gemini as an async upgrade. Users see the rules label immediately, then it may change when Gemini returns. This sticker-flicker concern is real, but it's a production integration problem to solve later — not part of this spike. This spike is purely about whether Gemini Nano can classify accurately when given the right prompt and examples.

---

## Step 1: Build the Evaluation Set

This is the foundation. No accuracy measurement is possible without it. No shortcut.

### What makes it good

1. **Known ground truth.** Every item's origin (human / AI / hybrid) is verified because we wrote it, generated it, or created both steps.
2. **Diverse.** Covers the real distribution — not just easy cases but the messy middle where most LinkedIn content lives.
3. **Multi-source.** AI content from ChatGPT, Claude, Gemini, Llama. Not just one model.
4. **Hard cases included.** Polished AI, fake stats, formal humans, hybrid posts. These are the categories that determine whether the product is useful.
5. **200+ items.** Enough to compute meaningful per-category accuracy.

### Schema

```typescript
interface EvaluationItem {
  id: string;
  text: string;
  itemType: 'post' | 'comment';

  actualOrigin: 'human' | 'ai' | 'hybrid';
  aiModel?: string;
  aiPromptStyle?: string;

  expectedLabel: ScoringLabel;
  expectedConfidence?: ConfidenceLabel;
  acceptableLabels: ScoringLabel[];
  rationale: string;

  difficulty: 'easy' | 'medium' | 'hard';
  category: string;
}
```

Import and extend the existing 20 items from `llm-evaluation-set.ts`.

The canonical evaluation set lives as a **TypeScript file** (`src/gemini/evaluation-set.ts`) for type safety during authoring — typos in `expectedLabel` or `category` are caught at compile time. A small script generates `evaluation-set.json` from the TS source for the browser-based benchmark harness, which can't import TypeScript directly.

The evaluation set should include a changelog comment at the top of the file documenting when items are added, removed, or relabeled. Benchmark results should note how many items were in the set at the time of the run so early and late results are comparable.

### Composition: ~210 items

| Category | Count | Difficulty | Expected label |
|----------|-------|-----------|----------------|
| Human: specific with metrics | 15 | Easy | `feels-human` |
| Human: narrative, no numbers | 15 | Medium | `feels-human` / `possibly-ai` |
| Human: formal writing style | 10 | Hard | `feels-human` |
| Human: substantive questions (comments) | 10 | Easy | `feels-human` |
| Human: thoughtful long comments | 10 | Medium | `feels-human` |
| AI: generic motivational | 15 | Easy | `likely-ai` |
| AI: listicle/framework | 10 | Easy | `likely-ai` |
| AI: polished thought leadership | 15 | Hard | `likely-ai` |
| AI: with fake specificity | 15 | Hard | `likely-ai` |
| AI: multi-model variety | 15 | Medium | `likely-ai` |
| AI: short generic praise (comments) | 10 | Easy | `almost-certainly-ai` |
| Engagement bait (obvious + subtle) | 10 | Easy-Medium | `almost-certainly-ai` |
| Hybrid: human draft → AI polish | 10 | Hard | `possibly-ai` |
| Hybrid: AI draft → human edit | 10 | Hard | `possibly-ai` |
| Edge: very short posts (<50 chars) | 10 | Easy | `cant-tell` |
| Edge: short ambiguous comments | 10 | Easy | `cant-tell` |
| Edge: non-English | 10 | Easy | `cant-tell` |
| Edge: truncated (>6000 chars) | 10 | Medium | varies |

### How to source content

**Human content:**
- Write from real experience.
- Paraphrase and anonymize real LinkedIn posts.
- Ask colleagues to write genuine posts.
- Deliberately write some in formal style (no contractions, structured paragraphs).

**AI content:** Generate using ChatGPT-4o, Claude 3.5, Gemini 1.5 Flash, Llama 3 with varied prompts:

| Style | Prompt template |
|-------|----------------|
| Generic | "Write a LinkedIn post about [topic]. Write as a senior professional sharing advice." |
| Polished | "Write a LinkedIn post about [topic]. Avoid cliches, listicles, and motivational language. Conversational, measured tone." |
| Adversarial (fake stats) | "Write a LinkedIn post about shipping a feature. Include a company name, a date, a team, and a concrete metric. Make it sound like genuine personal experience." |
| Comment praise | "Write a short LinkedIn comment praising a post about [topic]. Under 30 words." |

**Hybrid content:**
- Write a rough draft by hand → ask ChatGPT to "clean this up for LinkedIn."
- Generate with AI → manually edit in personal details, contractions, and remove one cliche.

**Labeling:** Every item gets `expectedLabel`, `acceptableLabels` (wider tolerance for ambiguous items), and a `rationale` explaining why.

---

## Step 2: Build a Benchmark Harness

A fast way to test any prompt variant against the full evaluation set using real Gemini Nano.

### Why we need a custom harness

- **Can't use Node.js.** `LanguageModel` API only exists inside Chrome.
- **Can't use the full extension.** `test-gemini-live.sh` rebuilds everything, kills Chrome, takes minutes. Unusable for iterating across 200+ items.
- **Need a fast loop.** Change a prompt, run the benchmark, see results. Minutes, not hours.

### The harness

```
scripts/gemini-benchmark/
├── evaluate.html          — minimal page, no extension needed
├── evaluate.js            — loads eval set, calls LanguageModel directly, writes results to DOM
├── run-benchmark.ts       — Playwright opens real Chrome, navigates to page, collects results
└── evaluation-set.json    — the 200+ items as JSON
```

- Playwright uses system Chrome (`channel: 'chrome'`), not bundled Chromium. This is a departure from `read-gemini-test.ts` which uses `channel: 'chromium'` — Gemini Nano is only available in production Chrome builds with the model downloaded, not in Playwright's bundled Chromium.
- No extension build. No manifest. No service worker. Just the Prompt API in isolation.
- The harness accepts a **prompt configuration** as input: a JSON object (or named file) containing the system prompt text, optional few-shot examples, and optional temperature/topK. Each benchmark run saves the full prompt config alongside the results, so every run is attributable to a specific prompt variant.
- Change a prompt config file → re-run. Fast iteration.
- Pre-computes rules engine labels (separate Node pass) for rules-Gemini agreement comparison.

### What each benchmark run measures

| Metric | Definition |
|--------|-----------|
| Exact accuracy | % matching `expectedLabel` |
| Acceptable accuracy | % matching any `acceptableLabels` |
| Per-category accuracy | Breakdown by category |
| Confusion matrix | Which labels get confused |
| Invalid JSON rate | % of failed parse / schema violations |
| Label consistency | Same item 3 times → same label? |
| Average latency | Per-item inference time |
| Rules-Gemini agreement | % where Gemini and rules produce the same label |

---

## Step 3: Iterate on Prompts Until Accuracy Is Good

This is the core research loop. No fixed number of iterations — we keep going until we hit the accuracy goal or conclude it's not achievable with Gemini Nano.

### What to try (in roughly this order)

**A. Add detection-specific criteria to the system prompt.**

The current prompt says "focus on personal specificity, concrete details, original thinking." It doesn't mention the signals that research shows matter most:

- Sentence length variation (humans vary, AI is uniform)
- Contraction usage (humans contract, AI expands)
- AI vocabulary markers (delve, intricate, meticulous, leverage, tapestry, pivotal)
- Genuine uncertainty ("I think," "maybe") vs formulaic hedges ("it is important to note")
- Structural regularity (AI: uniform paragraphs, excessive transition words)

Test: add these as a checklist in the system prompt. Measure per-category change.

**B. Add few-shot examples.**

Google's own Gemini Nano docs say this is the single most effective lever. The plan is to use `initialPrompts` (user/assistant turns) at session creation so examples are paid once per session, not per item.

**This is a hypothesis, not proven.** Whether Gemini Nano actually uses multi-turn `initialPrompts` as effective few-shot context is unverified — it may ignore them or treat them differently from in-prompt examples. The first experiment should validate this:

- Compare: (a) few-shot via `initialPrompts`, (b) few-shot inline in the user prompt, (c) no few-shot.
- If `initialPrompts` has no measurable effect, fall back to inline examples and accept the per-item token cost.

Test: add 3-5 examples spanning all labels. Measure accuracy change and latency change.

**Context window overflow strategy:** Check if system prompt + examples + 6000-char input fits. If not: (1) reduce to 3 examples; (2) if still too large, reduce `MAX_PROMPT_CHARS` to 4000 for the Gemini path; (3) if even that's too tight, use inline examples in the system prompt text instead of `initialPrompts`.

**C. Investigate temperature.**

Current `PromptApiCreateOptions` doesn't declare a `temperature` field. Check at runtime whether Chrome accepts it anyway. If yes, test 0.2. If no, test `topK` or accept lower consistency.

**D. Vary the number and selection of few-shot examples.**

Which examples matter most? Does 3 work as well as 5? Does including a hard example (hybrid post) help? Does removing the easy examples (engagement bait) make room for better ones?

**E. Test prompt structure.**

- Criteria as bullet list vs prose paragraph.
- Examples before vs after the criteria.
- Shorter vs longer system prompt.
- With and without the "Rules" section.

**F. Focus on failure categories.**

After each benchmark run, look at which categories are still failing. Design targeted experiments:

- If "AI with fake stats" fails: add a specific criterion about verifiable vs fabricated details. Add a few-shot example of fake-stat AI content.
- If "formal human" fails: add a criterion about contraction absence being insufficient evidence of AI. Add a few-shot example of a formal human post labeled correctly.
- If "hybrid" fails: this may be fundamentally hard. Test whether `possibly-ai` is achievable or whether the model can't distinguish hybrid from pure AI.

### When to stop

The research loop ends when one of these is true:

1. **Acceptable accuracy ≥80% across all categories.** We have a prompt configuration that works. Proceed to production integration.
2. **Accuracy plateaus below 70% and no experiment moves it.** Gemini Nano may be insufficient for this task. Document the ceiling and shift focus to the rules engine.
3. **Specific categories are fundamentally blocked.** Document which ones and at what accuracy. The rules engine scope inherits these as its priority targets.

There is no time box. The goal is the goal.

**Checkpoint cadence:** After every 3 experiments (or weekly, whichever is sooner), write a short status note: current accuracy by category, which experiments moved the needle, what to try next. This keeps the research directional without adding process overhead.

---

## What Comes After (Not Part of This Spike)

Once accuracy is proven:

- Integrate the winning prompt into production (`gemini-validation.ts`, `gemini-service.ts`).
- Bump `GEMINI_SCORING_VERSION` to `'gemini-2'`.
- Measure rules-Gemini agreement in production to assess sticker flicker.
- Decide whether to address flicker via UX (delay rules label) or accept it.
- Use the spike findings to scope the rules engine accuracy research.

None of this happens during the spike. The spike produces data and a recommendation.

---

## Artifacts Produced

| Artifact | Reusable? |
|----------|-----------|
| 200+ item labeled evaluation set | Yes — used by all future scoring work |
| Benchmark harness (HTML + Playwright) | Yes — re-run after any prompt or model change |
| Baseline metrics for current prompt | Yes — comparison point forever |
| Per-experiment metrics and failure analysis | Yes — documents what works and what doesn't |
| Recommended prompt configuration | Input to production integration work |
| List of categories Gemini can't handle | Input to rules engine research scope |

---

## References

- Google Prompt API: Prompt design for Gemini Nano (2026)
- Google Structured Output support for the Prompt API (Chrome 137, 2025)
- Calling Gemini Nano from the Browser: A Practical Prompt API Guide (Gemini Lab, April 2026)
- GPTZero: Robust Detection of LLM-Generated Texts (arXiv 2602.13042, 2026)
- StyleDecipher: Robust and Explainable Detection with Stylistic Analysis (arXiv 2510.12608, 2025)
