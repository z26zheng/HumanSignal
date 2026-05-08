# Privacy Disclosure

HumanSignal classifies visible LinkedIn posts and comments on the user's device. It does not send LinkedIn content, scores, feedback, or diagnostics to HumanSignal servers or third-party services.

## Data Processed

HumanSignal reads post and comment text that is already rendered in the user's browser on `https://www.linkedin.com/*`. This text is used only to produce local signal labels, confidence, dimension scores, and short explanations.

When Chrome's built-in Gemini Nano APIs are available, HumanSignal may pass visible post or comment text to Chrome's on-device model runtime. Chrome manages that model locally. HumanSignal does not upload that text.

## Data Stored

HumanSignal stores:

- Content hashes used to identify repeated content without storing raw LinkedIn text.
- Signal labels, confidence values, dimension scores, explanations, scoring source, scoring version, and timestamps.
- User settings such as sticker visibility, strictness, weekly summary preference, and scoring mode.
- User feedback on labels, including the item identifier, label, source, feedback type, and timestamp.
- Local diagnostics such as cache size, queue depth, scoring mode, failures, and log entries.

HumanSignal does not store raw LinkedIn post or comment text in its score cache.

## Retention And Controls

Score cache entries expire after 14 days and may be evicted earlier when the local cache exceeds its size limit. Users can clear cached scores or delete all HumanSignal data from the extension popup.

Uninstalling the extension removes extension-managed browser storage according to Chrome extension storage behavior.

## Third Parties

HumanSignal does not transmit data to external servers. It does not use analytics, remote logging, advertising SDKs, or third-party APIs.

Gemini Nano, when available, is Chrome's built-in on-device AI capability. Model download, storage, and execution are managed by Chrome.

## Permissions

HumanSignal requests:

- `storage` to save user settings, cached scores, and feedback locally.
- `offscreen` to host the on-device AI session used by Chrome extension service workers.
- `activeTab` to apply popup setting changes to the current LinkedIn tab.
- `sidePanel` for extension UI capability.
- `https://www.linkedin.com/*` host access to read visible LinkedIn page content and render overlay stickers.
