# Chrome Web Store Listing Draft

## Short Description

On-device signal labels for LinkedIn posts and comments.

## Long Description

HumanSignal helps you scan LinkedIn with lightweight Signal Stickers that classify visible posts and comments by usefulness, specificity, and engagement-bait patterns.

The extension reads only content already visible in your browser, then scores it locally. Scores appear as small overlay stickers near LinkedIn posts and comments. Click a sticker to see the explanation, scoring source, and feedback controls.

HumanSignal works in rules-only mode by default. When Chrome's built-in Gemini Nano capability is available, HumanSignal can use it for on-device AI-enhanced scoring. No LinkedIn text, labels, feedback, settings, or diagnostics are sent to HumanSignal servers or third-party APIs.

Key features:

- Local signal labels for LinkedIn feed posts and comments.
- Inline explanations for every label.
- Popup controls for sticker visibility, strictness, cache clearing, and data deletion.
- Rules-only fallback when on-device AI is unavailable.
- Local score cache with a 14-day retention window.

Privacy summary:

- No external analytics.
- No remote logging.
- No advertising SDKs.
- No raw LinkedIn text stored in the score cache.
- No data leaves the device.

## Screenshot Plan

Capture these screenshots before submission:

- LinkedIn feed with Signal Stickers visible.
- Inline explanation popover opened from a sticker.
- Popup settings and diagnostics.
- Rules-only mode on a browser without Gemini Nano.
- Data controls showing clear cache and delete all data.

## Permission Justification

- `storage`: stores settings, cached scores, feedback, and local diagnostics.
- `offscreen`: hosts the on-device AI session required by Chrome extension service workers.
- `activeTab`: applies popup setting changes to the current LinkedIn tab.
- `sidePanel`: reserves extension UI capability.
- `https://www.linkedin.com/*`: detects visible LinkedIn posts/comments and renders overlay stickers.
