# 05 -- TMR Detector Integration: Limitations

**Revised:** 2026-05-14
**Status:** Draft
**Depends on:** 02-implementation
**Blocks:** None

## v1 Limitations

### TMR is weak on short text and comments

**Problem:** TMR misclassifies human questions as AI (0.90 AI score) and defaults short/ambiguous text to AI (0.82 for "Big week."). On the golden set, TMR alone achieved only 36.5% acceptable accuracy.

**v1 workaround:** The score combiner excludes TMR for text under 100 characters and gives TMR low weight on comments. Rules engine handles these cases.

**Impact:** Medium. The product works correctly for short text because rules takes over. But TMR adds no value for comments or short posts — it's effectively posts-only.

**Risk:** If a developer changes the charCount threshold without understanding why it exists, short-text accuracy will degrade. The threshold is documented in the combiner and tested.

### TMR cannot detect engagement bait

**Problem:** TMR classifies engagement bait as human (0.36 AI score for "Comment AI and I'll send you the template"). TMR was trained on writing style, not manipulation patterns.

**v1 workaround:** Rules engine has hard override for engagement bait. The combiner never lets TMR override an `almost-certainly-ai` rules label.

**Impact:** Low. Engagement bait detection works exactly as well as before. TMR is simply not consulted.

**Risk:** None if the override is maintained. If someone removes the engagement bait override, these posts will be mislabeled as human.

### 202 MB extension package size

**Problem:** The TMR ONNX Q4 model is ~202 MB, bundled with the extension. Combined with the ONNX Runtime WASM (~24 MB), the total extension package is ~240 MB.

**v1 workaround:** Chrome Web Store allows extensions up to ~500 MB. The model is bundled to eliminate runtime downloads and the `huggingface.co` host permission. TMR initializes eagerly on startup — no user action required.

**Impact:** Low. Package size is well within Chrome Web Store limits. Initial install is larger, but the model is immediately available without a separate download step.

**Risk:** Very large extension packages may have slower install times on low-bandwidth connections. No mitigation needed for v1.

### `wasm-unsafe-eval` CSP may affect Chrome Web Store review

**Problem:** The extension needs `wasm-unsafe-eval` in its Content Security Policy for ONNX Runtime's WebAssembly execution. This is a non-standard CSP directive that Chrome Web Store reviewers may flag.

**v1 workaround:** The AI Slop Detector extension (distil-labs) uses the same CSP and is published on the Chrome Web Store. This establishes precedent. Include a justification in the Web Store submission.

**Impact:** Low-Medium. If rejected, the entire TMR integration is blocked for distribution.

**Risk:** Submit for review early in the development cycle to avoid discovering this blocker late.

### No WebGPU acceleration in v1

**Problem:** TMR runs on CPU via WASM. WebGPU would be faster but adds complexity and device compatibility concerns.

**v1 workaround:** WASM inference at ~113ms per item is fast enough for feed scoring. No workaround needed.

**Impact:** Low. Latency is acceptable.

**Risk:** None. WebGPU can be added in v2 if needed.

### Combined memory with Gemini may be high

**Problem:** TMR ONNX model + Gemini Nano session both reside in the offscreen document. Combined memory could exceed practical limits on 8 GB machines.

**v1 workaround:** TMR loads lazily (not at startup). Gemini warms up eagerly. On low-memory devices, users may choose one or the other. No automatic memory management in v1.

**Impact:** Medium. Users on low-RAM machines may experience Chrome killing the offscreen document.

**Risk:** Monitor memory usage in the spike and during testing. If combined memory exceeds 500 MB, consider loading TMR only when Gemini is not active.

### RoBERTa 512-token context window

**Problem:** TMR uses RoBERTa-base, which has a 512-token context window (~2000 characters). LinkedIn posts can be significantly longer (up to 3000 characters, or longer with articles). On truncated inputs, TMR classifies based on the first ~2000 characters only. If the most human-specific content (concrete metrics, personal details) appears later in the post, TMR may miss it.

**v1 workaround:** The rules engine's feature extraction runs on the full text and catches signals TMR misses from later paragraphs. The combiner gives rules override authority, so a post where TMR sees only generic intro text but rules detects specific details later will still be correctly classified.

**Impact:** Low-Medium. Most LinkedIn posts are under 2000 characters. Longer posts may get lower-quality TMR signals, but rules compensates.

**Risk:** If a developer relies on TMR alone (bypassing rules), long posts will be misclassified. The combiner architecture prevents this.

### Combiner weights are not user-tunable

**Problem:** The Strategy A combiner uses fixed thresholds (100-char cutoff, 0.15/0.85 TMR override thresholds). These may not be optimal for all content types.

**v1 workaround:** Weights are in a configuration object, not hardcoded in logic. Can be tuned by developers but not by users.

**Impact:** Low. The current weights are based on spike data. Can be adjusted in future versions.

**Risk:** If weights are wrong, the worst case is that TMR never overrides rules (too conservative) or overrides too often (too aggressive). Both are fixable without architectural changes.

## Future Work

### v2: WebGPU acceleration

Add WebGPU as a preferred runtime with WASM fallback. Transformers.js supports this via the `device` option. Would reduce inference latency on devices with capable GPUs.

### v2: Per-category combiner weights

Use different TMR weights for different content categories. For example, TMR may deserve higher weight on long-form thought leadership posts and zero weight on comments. Requires a larger evaluation set to calibrate per-category thresholds.

### v3: Fine-tune TMR on LinkedIn content

Use the distil-labs training pipeline to fine-tune the TMR model specifically on LinkedIn content (engagement bait, professional writing, comment threads). This would address TMR's weaknesses on short text and comments at the model level rather than working around them in the combiner.

### v3: Replace Gemini Nano with template explanations (trade-off)

If TMR accuracy is high enough, Gemini Nano's role (explanation generation) could be handled by a template system that maps TMR probability + rules dimensions to explanation text. This would remove the Gemini Nano dependency entirely.

**Trade-off:** Templates would be faster and remove the Gemini dependency, but explanation quality would decrease. Templates can describe what was detected ("No personal examples, generic structure") but can't reason about the specific text ("The post claims 34% improvement but provides no context for how this was measured"). The PRD (Section 9.2: "Explainability Builds Trust") identifies explanation quality as a product differentiator. Only consider this path if user research shows explanations aren't valued.
