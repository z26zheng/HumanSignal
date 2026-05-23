# Signal Stickers

## Decision: Color + Label Sticker on Every Post and Comment

Date: 2026-05-08

## What the User Sees

```
🟢 Feels Human
🟡 Possibly AI
🟠 Likely AI
🔴 Almost Certainly AI
⚪ Can't Tell
```

Each sticker is a small pill overlaid on the LinkedIn post or comment via the extension's overlay root. It contains a colored background and a text label.

## Sticker States

| State | Appearance |
|-------|------------|
| Loading | Gray sticker, text: "Scoring..." |
| Labeled | Colored sticker with label text |
| Can't Tell | Gray sticker with "Can't Tell" |
| Minimized | Tiny colored dot (see Sticker-Dismissal.md) |
| Unavailable | Gray sticker with "Unavailable," or hidden entirely |

## Overlay Rendering

- Stickers are rendered inside a single fixed-position overlay root appended to the document body.
- Stickers are children of the overlay root, not injected into LinkedIn's DOM tree.
- Sticker positions sync to their corresponding LinkedIn elements using `transform: translate(x, y)`.
- The overlay root uses `pointer-events: none`; individual stickers use `pointer-events: auto`.

## Interaction

- **Click** — opens the inline explanation popover (see Popover.md).
- **Hover** — may show a one-sentence tooltip reason.
- **Right-click** — opens a context menu for dismissal (see Sticker-Dismissal.md).
- **Keyboard: Enter/Space** — activates the sticker (opens popover).
- **Keyboard: Escape** — minimizes the sticker to a dot.
- **Keyboard: Tab** — stickers are focusable (`tabindex="0"`).

## Accessibility

- Every sticker includes `role="status"` and `aria-label="Signal: [label text]"`.
- Stickers are keyboard-focusable.
- Color is never the sole indicator; the text label is always present.

## Positioning

- Stickers appear near the top-right area of their corresponding post or comment card.
- Stickers must not cover LinkedIn's author name, content text, reaction buttons, comment button, share button, or messaging controls.
- If a sticker cannot be positioned without overlap, it should fail silently (hide rather than obstruct).
