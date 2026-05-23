# Extension Popup

**Revised:** 2026-05-15

## Design Principles

1. **Show value first, controls second.** The popup should immediately tell users what HumanSignal found on the current page before asking them to configure anything.
2. **Use human language.** No developer jargon in the default view. No "service worker," "cache entries," "queue depth," or "scoring mode."
3. **Progressive disclosure.** Simple controls hidden behind expandable sections. The default view is the summary + toggle.
4. **Visual hierarchy.** The label breakdown with colors is the most eye-catching element. The on/off toggle is always accessible. Everything else recedes.
5. **Respect the space.** Chrome extension popups are small (360px wide, max ~560px tall). Every pixel must earn its place.
6. **One control per action.** No duplicate paths to the same function. The toggle is the single on/off control.

---

## Popup Structure (Revised)

The popup has 4 visible sections for normal users (down from 7 in the previous implementation). Developer mode adds one button, not inline dashboards.

```
┌─────────────────────────────────────┐
│  [Logo] HumanSignal          [ON ◉] │
│  Make LinkedIn feel human again.    │
├─────────────────────────────────────┤
│                                     │
│  This page:  13 posts scored        │
│                                     │
│  ● Feels Human              6      │
│  ● Possibly AI              3      │
│  ● Likely AI                0      │
│  ● Almost Certainly AI      0      │
│  ● Can't Tell               4      │
│                                     │
├─────────────────────────────────────┤
│  ▸ Settings                         │
├─────────────────────────────────────┤
│  AI Analysis                        │
│  ● Active — running locally         │
├─────────────────────────────────────┤
│  ▸ Data & privacy                   │
└─────────────────────────────────────┘
```

---

## Section 1: Brand + Toggle + Live Summary

Always visible. Not collapsible.

```
┌─────────────────────────────────────┐
│  [Logo] HumanSignal          [ON ◉] │
│  Make LinkedIn feel human again.    │
├─────────────────────────────────────┤
│                                     │
│  This page:  13 posts scored        │
│                                     │
│  ● Feels Human              6      │
│  ● Possibly AI              3      │
│  ● Likely AI                0      │
│  ● Almost Certainly AI      0      │
│  ● Can't Tell               4      │
│                                     │
└─────────────────────────────────────┘
```

- Brand name, tagline, and master on/off toggle.
- Live label breakdown for the current LinkedIn tab.
- Labels with 0 count are dimmed, not hidden — users should see the full spectrum.
- The toggle is the **only** on/off control. No separate pause button.

### What was removed

| Element | Why removed |
|---------|-------------|
| "Pause HumanSignal" button + helper text | Redundant with the header toggle. Two controls for one action violates principle 6. Reclaims ~60px of vertical space. |

---

## Section 2: Settings (collapsed by default)

```
┌─────────────────────────────────────┐
│  ▸ Settings                         │
└─────────────────────────────────────┘
```

When expanded:

```
┌─────────────────────────────────────┐
│  ▾ Settings                         │
│                                     │
│  Show stickers on                   │
│  [All ▾]                            │
│                                     │
│  Sensitivity                        │
│  ○─────────●─────────○              │
│  Relaxed    Normal    Strict        │
│                                     │
└─────────────────────────────────────┘
```

- **"Show stickers on"** dropdown: All, Posts only, Comments only. No "Off" option — the toggle handles on/off.
- **"Sensitivity"** segmented control: Relaxed, Normal, Strict.
- Collapsed by default. Most users never need to change these. The defaults (All + Normal) work well.

### What was removed

| Element | Why removed |
|---------|-------------|
| "Off" option in the sticker dropdown | Redundant with the header toggle. Three controls for one action (toggle, pause button, dropdown off) reduced to one (toggle). |

### Naming decisions (unchanged from previous spec)

| Old name | New name | Why |
|----------|----------|-----|
| Signal Stickers | Show stickers on | Describes the action, not the component name. |
| Strictness | Sensitivity | More intuitive. |
| Low / Medium / High | Relaxed / Normal / Strict | Friendlier language. |

---

## Section 3: AI Analysis (single merged section)

Previously this was two separate sections: "Enhanced analysis" (Gemini Nano) and "AI Detection Model" (TMR). Users don't know or care that there are two models. Merged into one.

```
┌─────────────────────────────────────┐
│  AI Analysis                        │
│  ● Active — running locally         │
└─────────────────────────────────────┘
```

### Combined status logic

The section shows a single combined status derived from both TMR and Gemini states:

| TMR state | Gemini state | User-facing display |
|-----------|-------------|-------------------|
| Ready | Available | `● Active — running locally` (green dot) |
| Ready | Unavailable | `● Active — running locally` (green dot, TMR is enough) |
| Ready | Downloadable | `● Active` + subtle "Enable enhanced explanations" link below |
| Loading | Any | `Setting up AI analysis...` + progress bar |
| Error | Any | `AI analysis temporarily unavailable. Results use pattern matching.` + [Try again] |
| Not loaded | Downloadable | Onboarding flow (see below) |
| Not loaded | Available | `● Active — running locally` (Gemini alone is sufficient) |
| Not loaded | Unavailable | `Pattern-based analysis active.` (no AI at all, rules only) |

### Onboarding flow (when no AI model is available)

```
┌─────────────────────────────────────┐
│  AI Analysis                        │
│                                     │
│  You're seeing basic results.       │
│  Enable AI analysis for more        │
│  accurate labels — it's private     │
│  and runs entirely on your device.  │
│                                     │
│  ┌───────────────────────────────┐  │
│  │ ✦  Better accuracy            │  │
│  │ 🔒 Fully private, on-device   │  │
│  │ ⚡ Works offline              │  │
│  └───────────────────────────────┘  │
│                                     │
│  [Enable AI analysis]               │
│                                     │
│  ~70 MB download. Runs locally.     │
└─────────────────────────────────────┘
```

The "Enable" button triggers whichever model is available (TMR download, Gemini download, or both). The user doesn't choose between models — the system decides.

### What was removed

| Element | Why removed |
|---------|-------------|
| Separate "Enhanced analysis" section (Gemini) | Merged into "AI Analysis." Users don't need to know about individual models. |
| Separate "AI Detection Model" section (TMR) | Merged into "AI Analysis." |
| Model-specific status lines | Replaced with a single combined status. |

### Where model-specific detail went

Individual model status (Gemini session state, TMR loaded/error, download progress per model) is available in the developer mode diagnostics panel. Normal users see only the combined status.

---

## Section 4: Data & Privacy (collapsed by default)

```
┌─────────────────────────────────────┐
│  ▸ Data & privacy                   │
└─────────────────────────────────────┘
```

When expanded:

```
┌─────────────────────────────────────┐
│  ▾ Data & privacy                   │
│                                     │
│  All analysis happens on your       │
│  device. Nothing is sent to a       │
│  server.                            │
│                                     │
│  [Clear cache]                      │
│  [Delete all data]                  │
│                                     │
└─────────────────────────────────────┘
```

- Privacy reassurance sentence.
- Clear cache and delete all data buttons.
- "Delete all data" requires inline confirmation before executing.
- **No Diagnostics sub-section.** Diagnostics (scoring mode, cache entries, queue depth, failures) are developer-only and live exclusively in developer mode.

### What was removed from this section

| Element | Why removed |
|---------|-------------|
| Diagnostics sub-section (Mode, Items scored, Cache, Queue, Failures) | Developer jargon. Moved exclusively to developer mode. Normal users should never see "queue depth." |
| Developer mode toggle | Moved to hidden access method (see below). |

---

## Developer Mode Access

Developer mode is no longer toggled from inside Data & Privacy > Diagnostics. Instead:

**Access method:** Long-press (500ms) on the "HumanSignal" brand name in the header. A small toast confirms: "Developer mode enabled" / "Developer mode disabled."

This keeps the toggle completely hidden from casual users while remaining discoverable for developers who know to look for it.

### What developer mode shows in the popup

When developer mode is on, one additional element appears:

```
┌─────────────────────────────────────┐
│  ▸ Data & privacy                   │
├─────────────────────────────────────┤
│  🔧 [Open debug panel]             │
└─────────────────────────────────────┘
```

A single button: "Open debug panel." Clicking it opens the Chrome side panel with the full LLM Dashboard, log viewer, and per-model diagnostics (as documented in `Developer-Mode.md` and `Debug-Panel.md`).

### What developer mode does NOT show in the popup

The LLM Dashboard and Log Viewer are **not** rendered inline in the popup. The popup is 360px x 560px — too small for a dashboard with Model Status, Session Activity, Failures, Cache, Recent Events, filter/search log viewer, and export buttons. These belong in the side panel.

---

## State Handling

### Not on LinkedIn

```
┌─────────────────────────────────────┐
│  [Logo] HumanSignal          [ON ◉] │
│  Make LinkedIn feel human again.    │
├─────────────────────────────────────┤
│                                     │
│  Open LinkedIn to start.            │
│                                     │
└─────────────────────────────────────┘
```

AI Analysis and Data & privacy sections still visible below for configuration.

### Extension Disabled

```
┌─────────────────────────────────────┐
│  [Logo] HumanSignal          [OFF ○]│
│  Make LinkedIn feel human again.    │
├─────────────────────────────────────┤
│                                     │
│  HumanSignal is paused.             │
│  Turn it on to see stickers.        │
│                                     │
└─────────────────────────────────────┘
```

All other sections hidden when off. Clean and simple.

### Loading

```
┌─────────────────────────────────────┐
│  This page:                         │
│  Scoring posts on this page...      │
└─────────────────────────────────────┘
```

Transitions to label breakdown once results arrive.

### Service Worker Disconnected

```
┌─────────────────────────────────────┐
│  HumanSignal is reconnecting.       │
│  Try refreshing the LinkedIn page.  │
└─────────────────────────────────────┘
```

Actionable guidance, not a status report.

---

## Visual Design

### Dimensions

- Width: 360px (fixed)
- Max height: 560px (scrollable if needed, but the revised layout should fit without scrolling in the common case)
- Padding: 20px
- Section gap: 14px
- Border radius on cards: 14px

### Typography

- Product name: 15px, bold
- Tagline: 14px, regular, muted color
- Section headings: 15px, bold
- Label names in breakdown: 13px, medium weight
- Label counts: 13px, bold
- Muted helper text: 12px, muted color

### Interactions

- Master toggle: slide toggle with smooth transition
- Sensitivity: segmented control
- Collapsible sections: chevron rotates on expand/collapse
- "Delete all data": inline confirmation ("Are you sure?" with Cancel / Delete)
- Developer mode: long-press brand name (500ms)

---

## What Was Removed from Default View

| Element | Where it went |
|---------|--------------|
| "Pause HumanSignal" button + helper text | Removed entirely. Toggle handles on/off. |
| "Off" option in sticker dropdown | Removed. Toggle handles on/off. |
| Separate "Enhanced analysis" section | Merged into "AI Analysis." |
| Separate "AI Detection Model" section | Merged into "AI Analysis." |
| Diagnostics (Mode, Cache, Queue, Failures) | Developer mode only (debug panel). |
| Developer mode toggle | Hidden: long-press brand name. |
| LLM Dashboard | Developer mode debug panel (side panel). |
| Log Viewer | Developer mode debug panel (side panel). |
| "Background service worker: Connected/Unavailable" | Removed. Error state handled by contextual message. |
| Weekly summary checkbox | Removed for MVP. |
