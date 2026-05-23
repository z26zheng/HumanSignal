# Gemini Nano Accuracy Research Spike

Research spike to achieve ≥80% acceptable accuracy on a diverse evaluation set.

## Files

| File | Purpose |
|------|---------|
| `evaluation-set.json` | 210 labeled items (generated from TS source) |
| `generate-eval-json.ts` | Generates JSON from `src/gemini/evaluation-set.ts` |
| `evaluate.html` | Benchmark page (runs in Chrome, no extension needed) |
| `evaluate.js` | Benchmark logic: calls LanguageModel API directly |
| `run-benchmark.ts` | Playwright runner: opens Chrome, runs benchmark, saves results |
| `results-*.json` | Benchmark results (one per run) |
| `prompt-configs/` | Prompt variant configs (future) |

## Quick Start

```bash
# Generate the evaluation JSON from TypeScript source
pnpm spike:gen-eval

# Run a benchmark (uses system Chrome, not bundled Chromium)
pnpm spike:benchmark              # runs "baseline" config
pnpm spike:benchmark detection-v1 # runs "detection-v1" config
```

## Prompt Configs

Defined in `evaluate.js` as `PROMPT_CONFIGS`:

- **baseline**: Current production prompt (no detection signals, no few-shot)
- **detection-v1**: Adds sentence variation, contractions, AI vocabulary, structural regularity signals + 3 few-shot examples

Add new configs by adding entries to `PROMPT_CONFIGS` in `evaluate.js`.

## Requirements

- System Chrome (not Chromium) with Gemini Nano model downloaded
- `@playwright/test` installed
- Run from repo root

## What It Measures

- Exact accuracy (matches `expectedLabel`)
- Acceptable accuracy (matches any `acceptableLabels`)
- Per-category breakdown
- Confusion matrix
- Invalid JSON rate
- Label consistency (with repeat > 1)
- Per-item latency, average, P95
