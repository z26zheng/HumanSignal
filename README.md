<p align="center">
  <img src="human-signal/assets/logo-concepts/extracted/05-horizontal-lockup.png" alt="HumanSignal" height="60">
</p>

<p align="center">
  <strong>Detect AI-generated posts and comments on LinkedIn — entirely on your device.</strong><br>
  No data ever leaves your browser.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Manifest-V3-blue" alt="MV3">
  <img src="https://img.shields.io/badge/Model-TMR_RoBERTa_Q4-teal" alt="TMR">
  <img src="https://img.shields.io/badge/Tests-381_passing-green" alt="Tests">
  <img src="https://img.shields.io/badge/Version-1.0.0.0-navy" alt="Version">
</p>

---

## How it works

HumanSignal injects small signal stickers onto LinkedIn posts and comments. Each sticker shows a confidence label — **Feels Human**, **Possibly AI**, **Likely AI**, or **Almost Certainly AI** — derived from two on-device models running in parallel:

| Engine | What it does |
|---|---|
| **Rules engine** | Fast, deterministic scoring based on linguistic patterns (specificity, engagement bait, listicle structure, etc.). Result appears instantly. |
| **TMR detector** | RoBERTa-Q4 ONNX model fine-tuned for AI text detection. Runs locally in an offscreen worker. Upgrades the sticker label when complete. |

Both engines run entirely in the browser. No text is sent to any server.

---

## Development setup

> **Prerequisites:** Node.js 22+, pnpm 11+

```bash
git clone https://github.com/z26zheng/HumanSignal.git
cd HumanSignal/human-signal

# Install deps + automatically fetch the bundled TMR model (~202 MB) and ORT wasm
pnpm install

# Start the dev server with hot-reload
pnpm dev
```

Then load `.output/chrome-mv3` as an unpacked extension in `chrome://extensions`.

---

## Commands

```bash
pnpm compile          # TypeScript type-check
pnpm test             # Unit tests (Vitest) — 381 tests
pnpm build            # Production build → .output/chrome-mv3/
pnpm zip              # Package for Chrome Web Store → .output/*.zip
pnpm fetch-assets     # Re-fetch TMR model and ORT wasm manually (runs automatically on install)
```

---

## Project structure

```
human-signal/
├── src/
│   ├── entrypoints/        # background SW, content script, popup, offscreen
│   ├── tmr/                # TmrService — RoBERTa ONNX pipeline
│   ├── rules-engine/       # Deterministic text classifier
│   ├── scoring-coordinator/ # Orchestrates rules + TMR, caching, telemetry
│   ├── overlay/            # Signal stickers, popovers, debug pills
│   ├── linkedin-adapter/   # DOM extraction and page-type detection
│   └── shared/             # Types, messaging, storage, event tracing
├── public/
│   ├── icon/               # Extension icons (16–128px)
│   ├── models/             # Bundled TMR model (gitignored, fetched on install)
│   └── ort/                # ORT wasm runtime (gitignored, copied on install)
├── scripts/
│   ├── fetch-assets.ts     # Downloads model + copies ORT wasm
│   └── check-package-size.ts
└── assets/
    └── logo-concepts/      # Brand assets and icon exports
```

---

## Architecture

```
LinkedIn page (content script)
    │  DOM extraction → ExtractedItem
    ▼
Background service worker
    │  Rules engine (sync, instant)
    │  TMR queue (async, sequential)
    ▼
Offscreen document
    │  TmrService — @huggingface/transformers + ONNX Runtime Web
    ▼
Background → Content script
    │  ScoringResult (label + confidence + source)
    ▼
Overlay controller → Signal sticker update
```

---

## Release

The GitHub Actions CD pipeline builds, zips, and uploads to the Chrome Web Store automatically on every push to `main`, using secrets stored in the repository settings (`CWS_EXTENSION_ID`, `CWS_CLIENT_ID`, `CWS_CLIENT_SECRET`, `CWS_REFRESH_TOKEN`).

```bash
# Manual release
pnpm build && pnpm zip
chrome-webstore-upload upload --source .output/human-signal-1.0.0.0-chrome.zip --auto-publish
```

---

<p align="center">
  <sub>Built with WXT · Preact · Transformers.js · ONNX Runtime Web</sub>
</p>
