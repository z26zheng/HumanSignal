# Privacy Policy — HumanSignal

**Last updated: May 2026**

## Summary

HumanSignal does not collect, store, or transmit any personal data. All processing happens on your device.

---

## What HumanSignal does

HumanSignal is a Chrome extension that reads the visible text of LinkedIn posts and comments you are already viewing, runs an on-device AI model to estimate whether the text appears to be AI-generated, and displays a small label badge next to each post. Nothing more.

---

## Data we do NOT collect

- We do not collect your name, email address, or any personally identifiable information.
- We do not collect your LinkedIn profile, connections, or activity.
- We do not collect the text of posts or comments you view.
- We do not record your browsing history or which pages you visit.
- We do not track clicks, scrolls, or any other user activity.
- We do not use analytics services of any kind.
- We do not have a server. There is no backend.

---

## What stays on your device

The extension stores the following data **locally in your browser only**, using the Chrome `storage.local` API:

| What | Why |
|---|---|
| Your settings (sensitivity level, sticker visibility preference) | So your preferences persist across browser sessions |
| A cache of content hashes and their scoring results | To avoid re-processing posts you have already scrolled past |

A **content hash** is a one-way fingerprint of post text — it cannot be reversed to recover the original text. The raw text of any post is never stored.

This data never leaves your device. It is never transmitted to any server.

---

## Permissions explained

| Permission | Why it is needed |
|---|---|
| `storage` | Save your settings and scoring cache locally |
| `offscreen` | Run the AI model (ONNX/WebAssembly) in a background document |
| `activeTab` | Detect whether the current tab is a LinkedIn page |
| `https://www.linkedin.com/*` | Inject the content script to read post text and show label badges |

---

## Third-party services

HumanSignal uses no third-party services, analytics platforms, advertising networks, or tracking pixels.

The AI model (TMR RoBERTa Q4) is bundled inside the extension package. It is not fetched from any remote server at runtime.

---

## Children's privacy

HumanSignal does not knowingly collect data from anyone, including children under 13.

---

## Changes to this policy

If this policy changes in a material way, the updated policy will be published at this URL and the extension version will be incremented.

---

## Contact

For questions about this privacy policy, open an issue at:
https://github.com/z26zheng/HumanSignal/issues
