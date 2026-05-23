# Sticker Loading & AI Status States

Date: 2026-05-08

## Problem

Users need to understand what's happening between clicking into LinkedIn and seeing a final label. Two specific gaps exist:

1. When the on-device AI (Gemini Nano) is actively scoring a post, the sticker should communicate "working on it" without being distracting.
2. When the AI is not available (not downloaded, not supported, errored), users should understand why labels may be less accurate and have a clear path to enabling the AI.

---

## Sticker Lifecycle

A sticker moves through these visual states in order:

```
[Appears]  →  [Rules result]  →  [AI upgrading]  →  [Final result]
   gray          colored         colored + pulse      colored (done)
```

Or if AI is unavailable:

```
[Appears]  →  [Rules result]  →  (stays as rules result)
   gray          colored
```

---

## State 1: Initial Scoring ("Scoring...")

**When:** Sticker just appeared, rules engine hasn't returned yet.

**Appearance:**
- Gray pill with text "Scoring..."
- Subtle opacity pulse animation (0.4 → 0.7 → 0.4, 1.5s cycle)
- No spinner. Spinners feel heavy for small pills.

**Duration:** Usually <300ms. Most users won't see this state.

---

## State 2: Rules Result (baseline label)

**When:** Rules engine returned a label but AI has not run yet.

**Appearance:**
- Colored pill with the label text (e.g., 🟠 "Likely AI")
- No special indicator. This looks like a final result to the user.

**Why no indicator here:** Most of the time, this is good enough. We don't want every sticker to feel "incomplete." The rules result is usable on its own.

---

## State 3: AI Enhancing (Gemini running)

**When:** Gemini Nano is available and is actively re-scoring this specific item.

**Appearance:**
- The existing colored pill stays visible with its rules-based label.
- A small animated shimmer passes across the pill background (left-to-right, subtle, 2s cycle).
- Tooltip on hover: "Enhancing with on-device AI..."

**Why shimmer, not a spinner:**
- A spinner suggests "waiting." Shimmer suggests "improving in the background."
- The sticker already has a usable label. The shimmer communicates "this might get better" without implying "this is wrong."

**When it ends:** Shimmer stops and the label/color updates to the Gemini result (which may be the same label, or a different one). If the label changes, a brief color transition (200ms ease) makes the update feel smooth rather than jarring.

---

## State 4: AI Unavailable Indicator

**When:** Gemini Nano is not downloaded, not supported on the device, or has errored out.

**Appearance on stickers:**
- Stickers show rules-based labels as normal. No degraded appearance.
- A small info icon (ℹ️, 10px, muted gray) appears in the bottom-right corner of each sticker.
- Hovering the info icon shows a tooltip: "Basic analysis only. Enable enhanced analysis in the popup for better accuracy."
- Clicking the info icon opens the extension popup (or focuses it if already open).

**Why not degrade the sticker itself:**
- The rules-based label is still useful. Making it look "broken" or "incomplete" would undermine trust in the product.
- The info icon is subtle enough that users who don't care about AI won't notice it, but users who want better results have a clear path.

**Alternative considered:** A one-time banner at the top of the feed saying "Enable on-device AI for better accuracy." Rejected because injecting banners into LinkedIn is more invasive and harder to position safely.

---

## State 5: AI Enhancement Failed (for this item)

**When:** Gemini was available and tried to score this item, but returned invalid output or timed out.

**Appearance:**
- The rules-based label stays. No visual change to the pill color or text.
- In the explanation popover, a small note appears at the bottom: "Enhanced analysis was unavailable for this item."
- No special sticker indicator. The rules result is still valid and useful.

**Why silent failure:**
- Users don't need to know about per-item AI failures. The rules result is the fallback and it works.
- Showing errors on individual stickers would make the product feel unreliable.

---

## Tooltip Copy

| State | Hover tooltip |
|-------|--------------|
| Scoring... | "Analyzing this post..." |
| Rules result (AI available) | "Signal: [label]" |
| Rules result (AI unavailable) | "Signal: [label]" (info icon tooltip: "Basic analysis only. Enable enhanced analysis in the popup for better accuracy.") |
| AI enhancing | "Enhancing with on-device AI..." |
| Final AI result | "Signal: [label]" |
| AI failed for item | "Signal: [label]" (popover note: "Enhanced analysis was unavailable for this item.") |

---

## Popup Connection

When a user clicks the info icon (AI unavailable indicator), the extension popup should open to the "Enhanced analysis" section. If the popup is already open, it should scroll or highlight that section.

This creates a clear funnel:

```
Sticker info icon → Popup "Enhanced analysis" section → "Enable" button → Download starts
```

---

## Animation Specs

### Scoring pulse

```css
@keyframes human-signal-scoring-pulse {
  0%, 100% { opacity: 0.4; }
  50% { opacity: 0.7; }
}
```
- Duration: 1.5s
- Iteration: infinite
- Timing: ease-in-out

### AI enhancing shimmer

```css
@keyframes human-signal-shimmer {
  0% { background-position: -100% 0; }
  100% { background-position: 200% 0; }
}
```
- Applied as a linear-gradient overlay on the pill background
- Duration: 2s
- Iteration: infinite
- Timing: linear
- Gradient: transparent → white at 10% opacity → transparent

### Label upgrade transition

```css
.human-signal-sticker {
  transition: background-color 200ms ease, color 200ms ease;
}
```
- Only fires when the label/color actually changes after AI enhancement.

---

## Summary of User-Facing Indicators

| Situation | What the user sees |
|-----------|-------------------|
| Rules engine scoring | Gray pill, gentle pulse, "Scoring..." |
| Rules result ready | Colored pill with label |
| AI actively enhancing | Colored pill with subtle shimmer |
| AI finished, same label | Shimmer stops, no other change |
| AI finished, different label | Smooth color/text transition to new label |
| AI not available | Normal sticker + tiny ℹ️ icon with tooltip pointing to popup |
| AI failed for this item | Normal sticker, note in popover only |
