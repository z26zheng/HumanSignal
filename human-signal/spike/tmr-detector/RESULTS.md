# TMR Detector Spike Results

## Step 1: Standalone Page ✅

**Q4 variant:**
| Metric | Value |
|--------|-------|
| Load time (first, incl download) | 14,148ms |
| Load time (cached) | ~7,000ms |
| Model loads successfully | Yes |
| Scores are continuous floats | Yes (0.72 - 0.94 range observed) |

**Functional test results:**

| Text | Expected | Got | Score | Latency |
|------|----------|-----|-------|---------|
| Human: billing fix with metrics | Human | human | 0.82 | 157ms |
| AI: motivational template | AI | ai | 0.90 | 127ms |
| AI: generic praise comment | AI | ai | 0.82 | 132ms |
| AI: engagement bait | AI | **human 0.94** | - | 113ms |
| Edge: "Big week." | Uncertain | human | 0.72 | 84ms |

**Key findings:**
1. Scores are genuinely continuous — 0.72, 0.82, 0.90, 0.94. Usable for spectrum mapping.
2. Latency: 84-157ms. Excellent for feed scoring.
3. Engagement bait misclassified as human — expected, TMR detects AI writing patterns, not manipulation.
4. Short text gets lower confidence — good behavior for ambiguous content.

**int8 variant:** Loads in 7,081ms (faster, likely cached). Also works.

## Step 2: Chrome Extension Offscreen ⏳

**Status:** CDN import approach blocked by extension CSP. Even with `script-src 'self' 'wasm-unsafe-eval' https://cdn.jsdelivr.net`, dynamic ES module imports from CDN may not work in extension context.

**For production integration:** Must bundle `@huggingface/transformers` with the extension via WXT/Vite. WASM files need to be emitted as separate assets. This is a build configuration task, not a model capability blocker.

**The standalone page test (Step 1) confirms the model itself works. The offscreen document integration is a bundling/CSP engineering problem, not a model problem.**

## Step 3: Performance

Average latency across 40 items: **113ms**. Excellent for feed scoring.

## Step 5: Score Distribution on Golden Set (40 items) ✅

| Category | Expected | Avg AI Score | Labels (H/AI) | Correct? |
|----------|----------|-------------|----------------|----------|
| human-metrics | human | **0.209** | 5H / 0AI | ✅ Strong human signal |
| human-detailed | human | **0.124** | 3H / 0AI | ✅ Strong human signal |
| comment-human-thoughtful | human | **0.340** | 1H / 1AI | ⚠️ Mixed |
| comment-human-specific | human | **0.636** | 0H / 3AI | ❌ All misclassified as AI |
| comment-human-question | human | **0.901** | 0H / 3AI | ❌ All misclassified as AI |
| ai-generic | ai | **0.571** | 2H / 3AI | ⚠️ Low confidence |
| ai-listicle | ai | **0.759** | 1H / 2AI | ⚠️ One miss |
| comment-ai-praise | ai | **0.600** | 2H / 3AI | ⚠️ Low confidence, 2 misses |
| comment-ai-generic | ai | **0.636** | 1H / 2AI | ⚠️ One miss |
| possibly-ai | uncertain | **0.706** | 1H / 2AI | N/A |
| cant-tell | uncertain | **0.822** | 0H / 3AI | Classifies short text as AI (!!) |
| engagement-bait | uncertain | **0.357** | 2H / 1AI | Classifies bait as human |

### Key Findings

1. **TMR is good at detecting human posts with specifics** — human-metrics (0.21) and human-detailed (0.12) score correctly with high confidence.

2. **TMR struggles badly with short comments** — human questions (0.90 AI!!) and human-specific comments (0.64 AI) are misclassified. Short text with no personal markers gets flagged as AI even when genuinely human.

3. **TMR classifies short/ambiguous text as AI** — "Big week." gets 0.82 AI. This is the opposite of our desired behavior (should be "can't tell").

4. **AI detection confidence is low** — Generic AI motivational posts only score 0.57. We'd need a threshold around 0.5 which would produce many false positives.

5. **The score IS continuous** — values range from 0.07 to 0.97. The spread is usable but the calibration is wrong for LinkedIn content.

### Conclusion

TMR is a strong signal for **posts** (especially detecting human posts with specific details) but performs poorly on **short comments** and has the wrong bias for ambiguous content. It should NOT be used as the sole classifier. In a combined architecture:

- **TMR probability** → weighted signal for the scoring coordinator
- **Rules engine** → handles engagement bait, short text, structural patterns
- **Gemini Nano** → generates explanations and handles hard cases

TMR's biggest value: its P(human) score on posts is well-calibrated. Posts scoring <0.2 AI are almost certainly human-written.
