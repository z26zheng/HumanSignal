# 08 Testing and QA

## Purpose

Build the integration test suite, verify failure modes, finalize privacy disclosure, and prepare the extension for Chrome Web Store submission.

## Depends On

- All previous plans (01-08) must be complete.

## Outputs

- End-to-end Playwright test suite.
- Failure mode verification tests.
- Privacy disclosure document.
- Chrome Web Store listing assets.
- Performance benchmark results.
- Release checklist.

## Tasks

### 1. End-to-End Test Environment

Set up Playwright with Chrome extension loading:

```typescript
// playwright.config.ts
const extensionPath = path.join(__dirname, 'dist');

const context = await chromium.launchPersistentContext('', {
  headless: false,
  args: [
    `--disable-extensions-except=${extensionPath}`,
    `--load-extension=${extensionPath}`,
  ],
});
```

Create a local test server that serves saved LinkedIn HTML fixtures as real pages (to test content script injection).

### 2. Core Flow Tests

Test the happy path end-to-end:

- [ ] Extension loads without errors on fixture LinkedIn page.
- [ ] Content script injects and overlay root appears.
- [ ] Posts are detected and stickers appear in loading state.
- [ ] Scores arrive and stickers update to labeled state.
- [ ] Stickers position correctly relative to posts.
- [ ] Clicking sticker opens inline explanation popover with correct data.
- [ ] Popover closes on outside click, Escape, and scroll-away.
- [ ] Popup opens and shows settings, model status, and diagnostics.
- [ ] Settings changes in popup apply immediately (e.g., disable stickers → stickers disappear).
- [ ] Extension does not mutate LinkedIn DOM elements (overlay-only invariant).

### 3. Scroll and Dynamic Feed Tests

- [ ] Scrolling repositions stickers smoothly.
- [ ] New posts loaded by infinite scroll get stickers.
- [ ] Posts that scroll far off-screen have stickers removed.
- [ ] Rapid scrolling does not cause jank or console errors.
- [ ] Queue does not grow unbounded during rapid scroll.

### 4. Gemini Flow Tests

(These require Gemini Nano availability or a mock.)

- [ ] If Gemini unavailable: rules mode active, stickers appear with rules scores.
- [ ] If Gemini available: stickers appear with loading state, then Gemini scores arrive.
- [ ] Download progress shows in popup when model is downloading.
- [ ] Mode switch from rules to Gemini works correctly mid-session.
- [ ] Invalid Gemini response triggers repair/retry.
- [ ] Repeated Gemini failures trigger error state and popup shows error status.

For CI without Gemini: create a mock offscreen document that returns canned responses.

### 5. Failure Mode Verification

Test each failure scenario from Architecture section 12:

- [ ] DOM adapter returns zero posts: extension shows "layout not recognized" in popup, no stickers rendered, no console errors.
- [ ] Service worker terminated mid-request: content script reconnects and re-sends.
- [ ] Gemini returns invalid JSON: retry fires, then falls back gracefully.
- [ ] IndexedDB quota exceeded: eviction triggers, scoring continues.
- [ ] Element removed mid-score: sticker cleaned up, no orphan elements.
- [ ] Popover open when item scrolls away: popover closes cleanly.

### 6. Performance Benchmarks

Measure on a fixture page with 20 posts and 50 comments:

- [ ] Time from content script injection to first sticker visible: target < 500ms (rules mode). Measurement starts at content script `DOMContentLoaded`, not page navigation start.
- [ ] Scroll frame time with 15 active stickers: target < 2ms extension overhead.
- [ ] Content script heap memory: target < 30MB.
- [ ] Total extension memory (all contexts excluding Chrome-managed Gemini model): target < 50MB.
- [ ] IndexedDB cache write latency: target < 10ms per entry.
- [ ] Rules engine scoring latency: target < 5ms per item.

Record baselines. Flag regressions in CI.

### 6b. Mode Transition Test

Dedicated integration test for the rules-to-Gemini transition:

1. Load fixture page with Gemini unavailable (mock offscreen returns `unavailable`).
2. Verify rules-based stickers appear on visible posts.
3. Simulate Gemini becoming available (mock offscreen sends `MODEL_STATUS: available`).
4. Scroll to reveal new posts below the fold.
5. Verify new posts get Gemini-scored stickers (check `source: 'gemini'` in popover).
6. Verify old posts retain their rules-based stickers (no re-scoring, no flicker).
7. Verify that if Gemini fails for one new item, it gets a rules-based fallback score (not "unavailable").

### 7. Accessibility Audit

- [ ] All stickers have `role="status"` and descriptive `aria-label`.
- [ ] Stickers are keyboard-focusable and activatable with Enter/Space.
- [ ] Inline popover has `role="dialog"` and traps focus while open.
- [ ] Escape closes popover and returns focus to sticker.
- [ ] Popup is keyboard-navigable.
- [ ] Color is not the only differentiator (text labels always present).
- [ ] Focus indicators are visible.
- [ ] Screen reader announces sticker labels correctly.

### 8. Privacy Disclosure

Write the privacy disclosure document for Chrome Web Store and extension settings:

Content:
- What data is collected: visible post/comment text is processed locally, never sent to any server.
- What is stored: content hashes, labels, confidence scores, dimension scores, timestamps, feedback. Not raw LinkedIn text (except user-saved insights).
- Retention: 14-day cache TTL, manual clear available.
- Third parties: none. No data leaves the device.
- Gemini Nano: Chrome's built-in AI. Processing is on-device. Model is managed by Chrome.
- LinkedIn data: only visible content already rendered by the user's browser is read.

### 9. Chrome Web Store Preparation

- [ ] Extension description (short and long).
- [ ] Screenshots (3-5 showing stickers on LinkedIn, inline popover, popup settings).
- [ ] Privacy practices declaration (matches disclosure above).
- [ ] Verify manifest permissions are minimal and justified.
- [ ] Verify extension size < 1MB (excluding Chrome-managed model).
- [ ] Verify no unused permissions.
- [ ] Test on Chrome stable channel.

### 10. Release Checklist

Before first beta release:

- [ ] All core flow tests pass.
- [ ] All failure mode tests pass.
- [ ] Performance benchmarks meet targets.
- [ ] Accessibility audit passes.
- [ ] Privacy disclosure written and accessible in extension.
- [ ] No console errors on LinkedIn feed, post detail, and profile pages.
- [ ] Settings persist across browser restart.
- [ ] Extension can be cleanly uninstalled (no orphan storage).
- [ ] Works in Chrome stable (not just Canary/Dev).
- [ ] Gemini unavailable path works fully (rules-only mode).

## Verification

This plan's output is verified by all checks above passing.

## Duration Estimate

5-7 days.
