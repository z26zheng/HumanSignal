# Beta Release Checklist

Use this checklist before the first HumanSignal beta release.

## Automated Checks

- [ ] `corepack pnpm test` passes.
- [ ] `corepack pnpm compile` passes.
- [ ] `corepack pnpm build` passes.
- [ ] `PLAYWRIGHT_EXTENSION_HEADLESS=1 corepack pnpm test:e2e` passes.
- [ ] `corepack pnpm eval:rules` passes.
- [ ] `corepack pnpm perf:baseline` passes.
- [ ] `corepack pnpm zip` creates a Chrome Web Store package.
- [ ] `corepack pnpm release:check-package` confirms the package is below 1 MB.

## Core LinkedIn QA

- [ ] Extension loads on LinkedIn feed without console errors.
- [ ] Extension loads on post detail pages without console errors.
- [ ] Extension loads on profile activity pages without console errors.
- [ ] Overlay root is the only HumanSignal DOM container added to the page.
- [ ] Stickers appear for visible posts and comments.
- [ ] Stickers remain positioned correctly during scroll.
- [ ] New feed items get scored after dynamic DOM updates.
- [ ] Off-screen or removed items do not leave orphan stickers.
- [ ] Clicking a sticker opens an inline explanation popover.
- [ ] Escape closes the popover and returns control to the page.

## Popup And Settings QA

- [ ] Popup opens from the extension action on an active LinkedIn tab.
- [ ] Background service worker status shows connected.
- [ ] Sticker visibility changes apply immediately to the active LinkedIn tab.
- [ ] Settings persist after browser restart.
- [ ] Clear cache removes score cache entries.
- [ ] Delete all data resets settings, feedback, Gemini status, and score cache.

## Gemini And Failure Modes

- [ ] Rules-only mode works when Gemini Nano is unavailable.
- [ ] Gemini availability check reports status in the popup.
- [ ] Gemini download flow starts only from user action.
- [ ] Invalid Gemini output retries or falls back to rules.
- [ ] Repeated Gemini failures surface an error status and continue in rules mode.
- [ ] Service worker restart during scoring does not permanently strand visible stickers.
- [ ] IndexedDB unavailable or quota failure does not prevent scoring.

## Accessibility

- [ ] Stickers have descriptive `aria-label` values.
- [ ] Stickers are keyboard focusable and activate with Enter and Space.
- [ ] Popover uses `role="dialog"`.
- [ ] Focus indicators are visible.
- [ ] Text labels are always present; color is not the only signal.
- [ ] Popup is keyboard navigable.

## Performance

- [ ] First rules-mode sticker appears within 500 ms after content script startup on a 20-post fixture.
- [ ] Scroll overhead with 15 visible stickers is below 2 ms per frame.
- [ ] Content script heap stays below 30 MB during fixture scroll.
- [ ] Extension memory excluding Chrome-managed model stays below 50 MB.
- [ ] IndexedDB cache writes average below 10 ms per entry.
- [x] Rules engine agreement with LLM-labeled evaluation set is at least 80%. Latest local baseline: 95% over 20 items.
- [x] Rules engine scores each item in under 5 ms. Latest local baseline: 0.008 ms per item over 1000 items.

## Store Preparation

- [ ] Privacy disclosure in `docs/privacy-disclosure.md` matches the Chrome Web Store privacy declaration.
- [ ] Manifest permissions are minimal and justified.
- [x] Chrome extension package is below 1 MB, excluding Chrome-managed model storage. Latest local package: 40.48 KB.
- [ ] Short description: "On-device signal labels for LinkedIn posts and comments."
- [ ] Long description explains local-only scoring, stickers, popovers, settings, and Gemini Nano availability.
- [ ] Screenshots cover LinkedIn stickers, explanation popover, popup settings, and rules-only mode.
- [ ] Test package on Chrome stable before submission.
