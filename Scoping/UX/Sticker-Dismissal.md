# Sticker Dismissal

## Decision: Right-Click to Minimize, Dot to Restore

Date: 2026-05-08

## Problem

Stickers overlay LinkedIn content using a fixed-position overlay root. In some layouts, a sticker may cover a reaction button, a "see more" link, a comment input, or another interactive element. Users need a way to get the sticker out of the way without losing the score entirely.

## Options Considered

| Option | Description | Verdict |
|--------|-------------|---------|
| Drag to reposition | User drags sticker to another corner of the post | Too complex for MVP. Needs per-post position persistence. |
| "X" button on every sticker | Small close icon always visible on the sticker | Makes every sticker wider. Users may dismiss by accident. Restoring requires a trip to the popup. |
| Swipe to minimize | User swipes sticker to collapse it into a dot | Swipe gesture is not obvious on desktop. Not keyboard accessible. |
| Right-click to minimize (chosen) | Right-click opens a context menu. Sticker collapses into a tiny colored dot. Clicking the dot restores. | Simple, discoverable, non-destructive, keyboard accessible. |

## Chosen Behavior

1. **Right-click** (or long-press on trackpad) on any sticker shows a small context menu:
   - "Hide this sticker"
   - "Hide all stickers on this post"

2. **A hidden sticker becomes a tiny colored dot** (4-6px circle) in the same position. The dot uses the same color as the sticker label. It is nearly invisible but still tappable/clickable.

3. **Clicking the dot** restores the full sticker with its label.

4. **Keyboard support:**
   - Pressing **Escape** while a sticker is focused minimizes it to a dot.
   - The dot is focusable via **Tab** so keyboard-only users can restore it.
   - Pressing **Enter** on a focused dot restores the full sticker.

5. **"Hide all stickers on this post"** collapses every sticker on that post/comment into dots. Useful when multiple stickers in a thread are in the way.

6. **Stickers restore automatically** on the next page load or feed refresh. Dismissal is temporary and per-session. Users who want persistent removal should use the "Show stickers on" setting in the popup.

## Why Not a Visible "X" on Every Sticker

- An "X" on every sticker adds visual clutter to the feed. Most stickers will never need dismissal.
- Right-click is a low-frequency action that only users who need it will discover. Power-user friendly without burdening casual users.
- The dot-to-restore pattern avoids the "where did my sticker go?" problem that a full hide would create.

## Why Not Permanent Dismissal

- The sticker shows a per-content-hash score. If the same post appears in a different session, users likely want to see the sticker again.
- Permanent dismissal per post would require storing dismissed item IDs, adding storage complexity for a rare action.
- The popup's "Show stickers on: Off" setting already provides permanent global dismissal.
