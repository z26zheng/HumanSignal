# Research Spike: AI Slop Detector as Detection Engine

Date: 2026-05-13

**Goal:** Determine whether distil-labs' AI Slop Detector (fine-tuned Gemma 3 270M via Wllama) can serve as the detection backbone for HumanSignal, either replacing or supplementing Gemini Nano.

**Scope:** Hands-on evaluation only. Clone it, run it, test it against LinkedIn-like content, measure what we get. No production integration.

---

## Why This Spike

Our accuracy research is stuck on the ground truth problem: we can't self-label, we can't do a human panel, and using another AI's judgment as ground truth is circular. The AI Slop Detector takes a different approach — it's a purpose-built, fine-tuned classification model, not a prompted general-purpose LLM. If it works well enough on LinkedIn content, we can:

1. **Use it as the detection engine directly** — replacing Gemini Nano's prompted classification.
2. **Use it as the ground truth labeler** — run it on our evaluation set to generate labels, then use those labels to improve Gemini Nano's prompts.
3. **Use it alongside our rules engine** — as a second signal that either confirms or overrides the rules result.

Before committing to any of these, we need to know: does it actually work on LinkedIn content?

---

## What We Already Know

From their docs and source code:

| Fact | Detail |
|------|--------|
| Model | Fine-tuned Gemma 3 270M, quantized to Q4_K_M (~242 MB) |
| Runtime | Wllama (WebAssembly LLM runtime), runs on CPU in browser |
| Architecture | Chrome MV3 extension, offscreen document hosts the model |
| Output | Binary: `ai_generated` or `human_written` |
| Accuracy claimed | ~95% on their test set (quantized), 100% pre-quantization |
| Real-world claims | ~92% Reddit, ~98% ChatGPT, ~94% tweets, ~88% formal emails |
| Training data | Kaggle AI-generated essays dataset, ~50 seed examples expanded to ~10K via distillation from 120B GPT teacher |
| Inference speed | ~0.5-2s per query on consumer CPU |
| Text limit | Truncates at 1500 chars |
| Temperature | 0.0 (fully deterministic) |
| Prompt format | Gemma chat template with "classify as ai_generated or human_written" |
| Model download | ~253 MB from HuggingFace, cached after first use |
| Privacy | Fully local, no data sent anywhere |

### Known concerns going in

- **Binary output** — we need 5 labels. Can we extract a confidence score or probability to map to our spectrum?
- **Trained on essays, not LinkedIn** — their training data is academic essays. LinkedIn is shorter, more informal, has engagement bait patterns, hybrid content.
- **88% on formal emails** — LinkedIn professional writing is similar to formal emails. This is where we need it most.
- **1500 char limit** — our posts can be up to 6000 chars. We may lose signal from truncation.
- **No explanations** — it returns a label, not reasons. We need explanations for the popover.

---

## Step 1: Get It Running

**Goal:** Confirm the extension works, the model loads, and we can classify text.

### Tasks

1. Clone `distil-labs/distil-ai-slop-detector` repo.
2. Load it as an unpacked extension in Chrome.
3. Wait for model download (~253 MB first time).
4. Test with a few obvious examples:
   - A clearly human post with specific metrics.
   - A clearly AI motivational post.
   - "Great insights" (short AI comment).
   - An engagement bait post.
5. Confirm: does it load? How long? Does it return results? How fast per query?

### What to record

- Model download time.
- Model load time (from cache on second launch).
- Memory usage (Chrome task manager → the offscreen document process).
- Inference latency per item (visible in their console logs).
- Whether it works on macOS / the target development machine.

---

## Step 2: Test on LinkedIn-Like Content

**Goal:** Measure accuracy on content that resembles what HumanSignal actually encounters.

### Build a quick test set: 50 items

Not the full 200-item evaluation set — just enough to learn whether the model generalizes to LinkedIn. We already have content we can use:

| Source | Items | How to use |
|--------|-------|-----------|
| Existing golden set (`golden-set.ts`) | ~20 | Copy text from human-specific, AI-generic, engagement-bait, and cant-tell categories |
| Existing LLM eval set (`llm-evaluation-set.ts`) | ~15 | Copy text from the 20-item set (skip duplicates with golden set) |
| Fresh AI-generated LinkedIn posts | ~10 | Generate with ChatGPT/Claude right now: "Write a LinkedIn post about [topic]" |
| Fresh human-written | ~5 | Write 5 short posts from real experience |

For each item, we know the origin (human / AI) because we either wrote it or generated it.

### How to test

Two options:

**Option A: Use their popup manually.** Paste each item, click Analyze, record the result. Tedious for 50 items but works immediately.

**Option B: Modify their `offscreen.js` to batch-classify.** Add a message handler that accepts an array of texts, classifies each, returns results as JSON. This is a small code change to their existing extension. Much faster for 50 items.

Recommendation: **Option B.** The code change is minimal — their `classifyText` function already exists, we just need a loop and a way to pass the test set in.

### What to measure

| Metric | Definition |
|--------|-----------|
| Overall accuracy | % of items where the model's binary label matches the known origin |
| Human-origin accuracy | % of human-written items correctly labeled `human_written` |
| AI-origin accuracy | % of AI-generated items correctly labeled `ai_generated` |
| False positive rate | % of human items mislabeled as `ai_generated` (the most damaging error) |
| False negative rate | % of AI items mislabeled as `human_written` |
| Per-category breakdown | Accuracy by content type (engagement bait, motivational, specific-with-metrics, etc.) |
| Inference latency | Average and max per item |
| Failure rate | Items where the model returns `uncertain` or errors |

### Key questions to answer

1. **Does it catch LinkedIn AI content that our rules engine misses?** (polished AI, listicles without obvious cliches)
2. **Does it false-positive on formal human LinkedIn writing?** (their blog admits 88% on formal emails)
3. **Does it handle short comments?** ("Great insights" — 15 chars, well under their 1500 limit)
4. **Does it handle engagement bait?** (this is a different pattern than essays)
5. **Is the binary output consistent?** (temperature 0.0, so should be deterministic — verify)

---

## Step 3: Explore Probability Extraction

**Goal:** Can we get a confidence score, not just a binary label?

The model outputs raw text ("ai_generated" or "human_written"), but the underlying Wllama runtime may expose token probabilities. If we can access the probability of the first generated token, we can map it to our 5-label spectrum:

| Probability of `ai_generated` | Our label |
|-------------------------------|-----------|
| >0.9 | `almost-certainly-ai` |
| 0.7-0.9 | `likely-ai` |
| 0.4-0.7 | `possibly-ai` |
| 0.1-0.4 | `feels-human` |
| <0.1 | `feels-human` (high confidence) |
| No clear signal | `cant-tell` |

### What to investigate

- Does Wllama's `createCompletion` return token-level logprobs or probabilities?
- If not in the completion API, does the Wllama library have a separate `getLogits` or `tokenize + evaluate` path?
- If probabilities aren't accessible, can we prompt the model differently to get a numeric confidence? (e.g., "Rate 0-100 how likely this is AI-generated")

This is the biggest open question. If we can extract probabilities, the binary model becomes a 5-label model. If we can't, we're stuck with binary and need a different approach for the spectrum.

---

## Step 4: Assess Integration Feasibility

**Goal:** If accuracy is good enough, how hard is it to integrate into HumanSignal?

### Architecture compatibility

| Aspect | AI Slop Detector | HumanSignal | Compatible? |
|--------|-----------------|-------------|-------------|
| Extension platform | Chrome MV3 | Chrome MV3 | Yes |
| Model hosting | Offscreen document | Offscreen document | Yes — same pattern |
| Model runtime | Wllama (WASM) | Gemini Nano (Chrome API) | Different runtimes, but both work in offscreen |
| Model size | ~242 MB (extension downloads from HuggingFace) | Chrome-managed (user downloads via Chrome) | Different distribution model |
| Permissions | `storage`, `offscreen` | `storage`, `offscreen`, `activeTab` | Compatible |
| CSP | Needs `wasm-unsafe-eval` | Doesn't currently need it | Needs manifest change |

### Key integration questions

1. **Can both Wllama and Gemini Nano run in the same offscreen document?** Or do we need two offscreen documents (Chrome only allows one)?
2. **Does `wasm-unsafe-eval` CSP cause Chrome Web Store review issues?**
3. **How do we handle the 242 MB model download in our UX?** Currently our "Enhanced analysis" section talks about Gemini Nano. Would need a separate flow for the Slop Detector model.
4. **Can we bundle the GGUF model with the extension instead of downloading from HuggingFace?** Chrome Web Store has a size limit (~100 MB for the extension itself, but can download resources after install).
5. **Memory impact?** Two models in memory (Gemini Nano + Slop Detector) may exceed our 50 MB extension memory target significantly.

---

## Decision Points

After the spike, we'll know enough to decide:

| Question | If yes | If no |
|----------|--------|-------|
| Does it achieve >85% accuracy on LinkedIn-like content? | Strong candidate for detection engine or ground-truth labeler | Accuracy insufficient; return to Gemini Nano prompt engineering |
| Can we extract probability scores? | Can map to our 5-label spectrum | Stuck with binary; need to combine with rules engine for spectrum |
| Is the false-positive rate on human content <10%? | Safe to show to users | Too risky — users will see false accusations |
| Is integration feasible (WASM CSP, memory, single offscreen)? | Proceed to integration planning | Architecture blockers need resolution first |

### Possible outcomes

**Outcome A: Great accuracy + probabilities available.**
Use the Slop Detector as the primary detection engine. Rules engine handles engagement bait and short-text edge cases. Gemini Nano becomes optional enhancement for explanations only.

**Outcome B: Great accuracy, no probabilities.**
Use the Slop Detector as a binary signal alongside the rules engine. Rules engine determines the spectrum position; Slop Detector confirms or overrides the direction (human vs AI). Combined signal maps to our 5 labels.

**Outcome C: Good accuracy, but use as ground-truth labeler.**
Don't integrate the model into the extension. Instead, use it to label our evaluation set — run all 200 items through the Slop Detector, use its labels (+ origin metadata) as ground truth, then optimize Gemini Nano prompts to match. The Slop Detector becomes a development tool, not a production dependency.

**Outcome D: Poor accuracy on LinkedIn content.**
The model doesn't generalize from essays to LinkedIn. Return to the Gemini Nano prompt engineering spike. Consider fine-tuning our own model using distil-labs' pipeline with LinkedIn-specific training data (a bigger project).

---

## What This Spike Does NOT Cover

- Production integration into HumanSignal (that's after the decision).
- Fine-tuning a custom model on LinkedIn data (that's a separate larger effort).
- Combining Slop Detector with Gemini Nano (that's an architecture decision after we know both models' accuracy).
- UX changes for a different model download flow.
- Chrome Web Store compliance for `wasm-unsafe-eval`.
