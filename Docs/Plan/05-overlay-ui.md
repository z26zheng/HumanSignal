# 05 Overlay UI

## Purpose

Build the overlay root, sticker renderer, position synchronization system, and observer layer that displays Signal Stickers on LinkedIn posts and comments without injecting into LinkedIn's DOM tree.

## Depends On

- **01 Extension Shell** (content script entry, messaging)
- **02 LinkedIn DOM Adapter** (element references, post/comment detection, feed change detection)

## Outputs

- Overlay root element management (create, destroy, z-index).
- Signal Sticker components with all visual states.
- Inline explanation popover component (rendered inside overlay root).
- Position synchronization loop (rAF-based, read/write separated).
- IntersectionObserver-based sticker activation/deactivation.
- MutationObserver integration for new/removed feed items.
- Item registry tracking sticker lifecycle.
- Stickers are accessible (ARIA, keyboard focus).

## Architecture Context

The overlay root is a single `position: fixed` element appended to `document.body`. It is the only DOM mutation the extension makes on LinkedIn pages. The extension never modifies LinkedIn's own elements or styles.

All stickers float above LinkedIn content using `transform: translate(x, y)`. They do not participate in LinkedIn's layout.

## Tasks

### 1. Overlay Root Setup

Create and manage the overlay root:

```typescript
class OverlayRoot {
  private root: HTMLDivElement;

  create(): void
  destroy(): void
  getRoot(): HTMLDivElement
}
```

Root element properties:
- `position: fixed`
- `top: 0; left: 0`
- `width: 100vw; height: 100vh`
- `pointer-events: none`
- `z-index: 2147483647` (max safe)
- `overflow: visible`
- No background, no border
- Unique ID: `signallens-overlay-root`

### 2. Sticker Component

Build the Signal Sticker as a self-contained element (plain DOM, not Preact — since it lives in the overlay, not in an extension page):

```typescript
interface StickerProps {
  label: string
  color: 'green' | 'yellow' | 'orange' | 'red' | 'gray'
  state: 'loading' | 'labeled' | 'unclear' | 'unavailable'
  itemId: string
  onClick: () => void
}

class SignalSticker {
  private element: HTMLDivElement;

  create(props: StickerProps): HTMLDivElement
  update(props: Partial<StickerProps>): void
  setPosition(x: number, y: number): void
  show(): void
  hide(): void
  destroy(): void
}
```

Visual requirements:
- Small pill/badge shape.
- Background color matching the color prop.
- White or dark text label.
- Subtle border or shadow for contrast against LinkedIn backgrounds.
- Loading state: pulsing gray placeholder.
- Unavailable state: hidden (no sticker rendered).
- `pointer-events: auto` on the sticker element.
- `role="status"`, `aria-label="Signal: {label}"`.
- `tabindex="0"` for keyboard access.
- Click handler that sends `SHOW_EXPLANATION` message.

### 3. Sticker Styles

Inject a `<style>` element inside the overlay root (scoped, not global):

- Define sticker classes for each color.
- Define state classes (loading, labeled).
- Use CSS transitions for smooth position updates and state changes.
- Add `will-change: transform` for GPU compositing.

### 4. Position Synchronization

Implement the rAF-based position sync loop:

```typescript
class PositionSync {
  private tracked: Map<string, TrackedItem>;
  private running: boolean;

  startLoop(): void
  stopLoop(): void
  addItem(itemId: string, element: HTMLElement, sticker: SignalSticker): void
  removeItem(itemId: string): void
}
```

Each frame:
1. **Read phase:** Call `getBoundingClientRect()` on all active tracked elements. Collect all positions.
2. **Write phase:** Apply `transform: translate(x, y)` on all corresponding stickers.

Position the sticker near the top-right area of the post/comment container but offset to avoid covering LinkedIn's three-dot menu and action buttons:
- Post stickers: position at `top + 8px`, `right - 56px` (avoids the three-dot menu which occupies the rightmost ~48px).
- Comment stickers: position at `top + 4px`, `right - 12px` (comments have smaller controls).
- Verify against HTML fixtures that no LinkedIn native controls are covered.
- If the computed position would place the sticker outside the container bounds, fall back to `top + 8px`, `left + 8px`.

Handle edge cases:
- Element returns zero-rect (hidden/removed): hide sticker, mark for cleanup.
- Element is above viewport: hide sticker.
- Element is below viewport: hide sticker.

### 5. IntersectionObserver Integration

Use IntersectionObserver to activate/deactivate position tracking:

```typescript
class ViewportTracker {
  private observer: IntersectionObserver;

  observe(element: HTMLElement, itemId: string): void
  unobserve(element: HTMLElement): void
}
```

- When element enters viewport: activate position tracking, show sticker.
- When element leaves viewport: deactivate position tracking, hide sticker (but keep in registry).
- Threshold: `0.1` (element is 10% visible).
- Root margin: `200px` (start tracking slightly before element is visible for smoother UX).

### 6. MutationObserver Integration

Hook into the LinkedIn DOM adapter's observer config:

- On new items detected: create stickers in loading state, start tracking, send score request.
- On items removed/recycled: destroy sticker, remove from registry, stop tracking.
- Debounce: batch new items for 150ms before processing.

### 7. Item Registry

Central state for all tracked items:

```typescript
interface RegistryEntry {
  itemId: string
  itemType: 'post' | 'comment'
  element: HTMLElement
  sticker: SignalSticker
  state: 'loading' | 'scored' | 'hidden' | 'failed'
  score: ScoringResult | null
  inViewport: boolean
}

class ItemRegistry {
  add(entry: RegistryEntry): void
  get(itemId: string): RegistryEntry | undefined
  remove(itemId: string): void
  getActive(): RegistryEntry[]  // in viewport
  updateScore(itemId: string, score: ScoringResult): void
  clear(): void
}
```

- Max 50 entries tracked simultaneously.
- When over limit, remove oldest off-screen entries.
- Persist nothing from the registry (it is ephemeral per page load).

### 8. Score Result Handling

When a scoring result arrives from the service worker:

1. Find the registry entry by `itemId`.
2. Update the sticker: set label, color, state to 'labeled'.
3. Store the score in the registry entry.

### 9. Sticker Click Handling

On sticker click:
1. Look up the scoring result from the item registry.
2. If result is available, open the inline explanation popover anchored to the sticker.
3. If result is missing or stale, send `SHOW_EXPLANATION` to service worker, show loading state in popover, update when result arrives.
4. Only one popover can be open at a time (clicking another sticker closes the previous one).

On sticker hover (optional):
- Show a small tooltip with the first reason. Use a simple absolute-positioned div inside the overlay root.

### 9b. Inline Explanation Popover

The popover is rendered inside the overlay root (not inside LinkedIn's DOM):

```typescript
class ExplanationPopover {
  private element: HTMLDivElement;
  private anchorSticker: SignalSticker | null;

  open(sticker: SignalSticker, score: ScoringResult): void
  close(): void
  updateScore(score: ScoringResult): void
  isOpen(): boolean
}
```

Popover content:
- Color badge + primary label + confidence badge.
- 2-3 reason bullet points.
- Scoring source indicator ("Rules-based" or "AI-enhanced").
- Feedback buttons: Agree, Disagree, Not Useful.
- Optional expandable dimension scores.

Popover behavior:
- Positioned adjacent to the clicked sticker (prefer below-right, adjust to stay in viewport).
- `pointer-events: auto` on the popover element.
- Closes on: outside click, Escape key, anchored item scrolls out of viewport.
- Smooth open/close transitions.
- Max width ~320px, responsive to content.

Popover accessibility:
- `role="dialog"`, `aria-labelledby` referencing the label.
- Focus trapped inside while open.
- Escape closes and returns focus to the sticker.

### 10. Keyboard Accessibility

- Stickers receive focus via Tab key.
- Enter/Space triggers the click handler.
- Escape dismisses hover tooltip if shown.
- Focus outline is visible and high-contrast.

## Verification

- [ ] Overlay root appears on LinkedIn page with correct properties.
- [ ] Stickers render in all states (loading, labeled with each color, unclear, unavailable).
- [ ] Stickers position correctly over post containers.
- [ ] Stickers reposition smoothly on scroll without jank.
- [ ] Stickers appear/disappear as posts enter/leave viewport.
- [ ] New posts added by infinite scroll get stickers.
- [ ] Removed/recycled posts have their stickers cleaned up.
- [ ] Sticker click opens inline explanation popover with correct data.
- [ ] Only one popover is open at a time.
- [ ] Popover closes on outside click, Escape, and scroll-away.
- [ ] Popover feedback buttons send FEEDBACK message to service worker.
- [ ] No LinkedIn controls are covered by stickers.
- [ ] Keyboard navigation works (Tab to focus, Enter to activate).
- [ ] Screen reader announces sticker label.
- [ ] Popover is keyboard-navigable with focus trap.
- [ ] Overlay does not intercept clicks meant for LinkedIn (pointer-events: none on root).
- [ ] Performance: no visible jank during normal scrolling with 15 stickers.

## Duration Estimate

5-7 days.
