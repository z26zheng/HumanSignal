# 01 Extension Shell

## Purpose

Set up the Manifest V3 Chrome extension foundation: project structure, build tooling, all extension contexts (content script, service worker, offscreen document, popup), and the messaging layer that connects them.

This is the blocking dependency for all other plans.

## Depends On

Nothing. This is the first task.

## Outputs

- A working Chrome extension that loads in Chrome and injects a content script on LinkedIn pages.
- Service worker starts and responds to messages.
- Offscreen document can be created and destroyed.
- Popup opens and renders a Preact component.
- Typed messaging layer with roundtrip request/response between all contexts.
- Shared TypeScript types exported for other workstreams.
- Basic `chrome.storage.local` read/write utility.

## Tech Stack

- **Framework:** WXT (latest stable)
- **Language:** TypeScript (strict mode)
- **Build:** Vite (managed by WXT)
- **UI:** Preact + `@preact/preset-vite`
- **Package Manager:** pnpm

## Tasks

### 1. Project Bootstrap

Initialize the project using WXT:

```bash
pnpm dlx wxt@latest init human-signal
cd human-signal
```

Select "Vanilla" template (we will add Preact manually for precise control).

Install additional dependencies:

```bash
pnpm add preact
pnpm add -D @preact/preset-vite
```

Configure `wxt.config.ts`:

```typescript
import { defineConfig } from 'wxt';
import preact from '@preact/preset-vite';

export default defineConfig({
  srcDir: 'src',
  manifest: {
    name: 'HumanSignal',
    description: 'Signal intelligence for LinkedIn',
    permissions: ['storage', 'offscreen', 'activeTab'],
    host_permissions: ['https://www.linkedin.com/*'],
  },
  vite: () => ({
    plugins: [preact()],
  }),
});
```

### 2. Project Structure

WXT uses file-based entrypoint discovery. Create this structure:

```
human-signal/
  src/
    entrypoints/
      background.ts           # service worker
      content.ts              # content script (LinkedIn)
      popup/                  # popup Preact app
        index.html
        main.tsx
        App.tsx
      offscreen.html          # offscreen document (unlisted page)
      offscreen.ts            # offscreen document script
    utils/
      messaging.ts            # typed messaging helpers
      storage.ts              # chrome.storage wrappers
      logger.ts               # logging utility
      types.ts                # shared types
  public/
    icon/
      16.png
      48.png
      128.png
  wxt.config.ts
  tsconfig.json
  package.json
```

WXT automatically:
- Generates `manifest.json` from `wxt.config.ts` + entrypoint files.
- Configures the service worker from `entrypoints/background.ts`.
- Injects the content script from `entrypoints/content.ts`.
- Creates the popup from `entrypoints/popup/index.html`.
- Includes `offscreen.html` as an unlisted page.

### 3. WXT Manifest Configuration

WXT generates the manifest automatically. The content script match pattern is declared in the entrypoint file itself:

```typescript
// src/entrypoints/content.ts
export default defineContentScript({
  matches: ['https://www.linkedin.com/*'],
  main(ctx) {
    console.log('HumanSignal content script loaded on LinkedIn');
  },
});
```

Permissions and metadata go in `wxt.config.ts` (see Task 1).

### 4. Content Script Entry

Create `src/entrypoints/content.ts`:

```typescript
export default defineContentScript({
  matches: ['https://www.linkedin.com/*'],
  main(ctx) {
    console.log('HumanSignal content script loaded');
    // Future: DOM adapter, overlay, scoring coordination
  },
});
```

- Confirm it runs on LinkedIn feed, post detail, and profile pages.
- Export messaging helper usage for sending typed messages to background.

### 5. Service Worker (Background)

Create `src/entrypoints/background.ts`:

```typescript
export default defineBackground(() => {
  console.log('HumanSignal background service worker started');

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    // Typed message routing
  });

  chrome.runtime.onInstalled.addListener(({ reason }) => {
    if (reason === 'install') {
      // First-install setup
    }
  });
});
```

- Register message listener for all typed messages.
- Implement basic request/response routing.
- Implement offscreen document creation/destruction utility.

### 6. Offscreen Document

Create `src/entrypoints/offscreen.html` (WXT treats this as an unlisted page):

```html
<!DOCTYPE html>
<html>
  <head><title>HumanSignal AI</title></head>
  <body><script src="./offscreen.ts" type="module"></script></body>
</html>
```

Create `src/entrypoints/offscreen.ts`:

```typescript
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Handle Gemini-related messages
});
```

From the background script, create/destroy it:

```typescript
await chrome.offscreen.createDocument({
  url: chrome.runtime.getURL('/offscreen.html'),
  reasons: [chrome.offscreen.Reason.LOCAL_STORAGE],
  justification: 'Host on-device AI model sessions',
});
```

- Confirm it can be created from service worker and respond to messages.

### 7. Popup

Create `src/entrypoints/popup/index.html`:

```html
<!DOCTYPE html>
<html>
  <head><meta charset="UTF-8" /><title>HumanSignal</title></head>
  <body><div id="app"></div><script src="./main.tsx" type="module"></script></body>
</html>
```

Create `src/entrypoints/popup/main.tsx` and `App.tsx`:

- Mount Preact app with a placeholder component.
- Confirm it renders on extension icon click.
- Target width: 360px.

### 7. Messaging Layer

Implement typed messaging in `src/shared/messaging.ts`:

```typescript
type Message =
  // Scoring
  | { type: 'SCORE_BATCH'; items: ExtractedItem[] }
  | { type: 'SCORE_RESULT'; results: ScoringResult[] }
  | { type: 'PRIORITY_UPDATE'; updates: Array<{ itemId: string; inViewport: boolean }> }
  // Gemini
  | { type: 'GEMINI_PROMPT'; item: ExtractedItem }
  | { type: 'GEMINI_RESULT'; result: ScoringResult | null }
  | { type: 'CHECK_GEMINI_STATUS' }
  | { type: 'TRIGGER_DOWNLOAD' }
  | { type: 'MODEL_STATUS'; status: GeminiStatus }
  // UI
  | { type: 'SHOW_EXPLANATION'; itemId: string }
  | { type: 'SETTINGS_CHANGED'; settings: Partial<UserSettings> }
  | { type: 'FEEDBACK'; itemId: string; feedback: FeedbackType }
  // Health
  | { type: 'GET_HEALTH' }
  | { type: 'HEALTH_RESULT'; health: HealthMetrics }
  // Lifecycle
  | { type: 'SERVICE_WORKER_ALIVE' }
  | { type: 'PING' }
  | { type: 'PONG' }
```

Provide helper functions:
- `sendToBackground(message): Promise<Response>`
- `sendToContentScript(tabId, message): Promise<Response>`
- `sendToOffscreen(message): Promise<Response>`

### 8. Shared Types

Define in `src/shared/types.ts`:

- `ExtractedItem` (itemId, itemType, text, metadata, isTruncated)
- `ScoringResult` (full scoring contract from architecture doc)
- `UserSettings` (all settings fields)
- `GeminiStatus` (available, downloadable, downloading, unavailable, error)
- `HealthMetrics` (itemsScored, cacheHitRate, avgLatency, failureCount, queueDepth, scoringMode)
- `FeedbackType` (agree, disagree, notUseful)
- Label enums, color enums, confidence enums

### 9. Storage Utility

Create `src/shared/storage.ts`:

- Typed wrappers around `chrome.storage.local.get/set`.
- Helper for reading/writing `UserSettings`.
- Helper for reading/writing `GeminiStatus`.

### 10. Error Boundary Standard

All module public APIs must catch errors at the boundary:

- DOM adapter functions must never throw to the content script. Return empty arrays or null on failure.
- Scoring coordinator must never crash the service worker. Catch and log, return error state.
- Overlay renderer must never crash the content script. Catch and hide the sticker on error.
- Messaging helpers must catch and return a typed error response, not propagate exceptions.

Implement a shared `safeCatch` wrapper:

```typescript
function safeCatch<T>(fn: () => T, fallback: T, context: string): T {
  try { return fn(); }
  catch (e) { logger.error(context, e); return fallback; }
}
```

### 11. Logging Utility

Create `src/shared/logger.ts`:

- Log levels: error, warn, info, debug.
- In-memory ring buffer (last 200 entries).
- Exposed via `GET_HEALTH` for popup diagnostics.
- Never includes LinkedIn content text in log entries.
- Debug level disabled in production builds.

## Verification

- [ ] `pnpm dev` opens Chrome with the extension loaded automatically (WXT dev mode).
- [ ] `pnpm build` produces a loadable extension in `.output/chrome-mv3/`.
- [ ] Content script runs on `linkedin.com` pages (console log visible).
- [ ] Service worker starts and responds to PING with PONG.
- [ ] Offscreen document creates and responds to messages.
- [ ] Popup opens and renders Preact placeholder UI.
- [ ] Message roundtrip: content script -> service worker -> content script works.
- [ ] Message roundtrip: service worker -> offscreen document -> service worker works.
- [ ] Settings can be written and read from storage.
- [ ] HMR works: changing content script or popup code updates without manual reload.

## Duration Estimate

3-5 days.
