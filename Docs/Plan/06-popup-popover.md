# 06 Popup and Popover

## Purpose

Build the extension popup (settings, model status, diagnostics) and finalize the inline explanation popover (visual design, feedback flow, content rendering). The popover structure is created in Plan 05; this plan handles the content, interactions, and popup integration.

## Depends On

- **01 Extension Shell** (popup entry, Preact, messaging, storage)
- **05 Overlay UI** (popover component shell, sticker click handling)

## Outputs

- Extension popup with settings, model status, and diagnostics.
- Popover content rendering: label, reasons, confidence, dimensions, feedback.
- Feedback submission flow (local storage via service worker).
- Model status display with download trigger.
- Settings that take immediate effect on the active LinkedIn tab.

## Architecture Context

MVP uses two user-facing surfaces:

- **Inline popover:** Appears on sticker click, inside the overlay root. Shows explanation for a specific post/comment. Rendered by the content script.
- **Popup:** Opens on extension icon click. Shows settings, model status, and health diagnostics. Rendered as a Preact app.

No side panel is required for MVP.

## Tasks

### 1. Popup App Shell

Set up Preact app in `src/popup/`:

- Tab-based or section-based layout: Settings, Model Status, Data.
- Compact design (popup width ~360px, height ~500px max).
- Load current settings from storage on open.
- Send `SETTINGS_CHANGED` messages on any change.

### 2. Popup Settings Section

```
┌─────────────────────────────────┐
│ Signal Stickers                 │
│ ○ All  ○ Posts  ○ Comments  ○ Off│
│                                 │
│ Strictness                      │
│ [Medium ▼]                      │
│                                 │
│ Weekly Summary  [toggle]        │
└─────────────────────────────────┘
```

On any change:
1. Write to `chrome.storage.local`.
2. Send `SETTINGS_CHANGED` to service worker.
3. Service worker relays to content script for immediate effect.

### 3. Popup Model Status Section

**Available:**
```
On-Device AI: Active ✓
Scoring uses Gemini Nano.
```

**Downloadable:**
```
On-Device AI: Not enabled
Better scoring with private on-device AI.
Requires ~2GB free space.
[Enable On-Device AI]
```

**Downloading:**
```
On-Device AI: Downloading...
[████████░░░░░░░░] 54%
Using rule-based scoring meanwhile.
```

**Unavailable:**
```
On-Device AI: Not available
Your device/Chrome version doesn't support
on-device AI. Using rule-based scoring.
```

**Error:**
```
On-Device AI: Error
Repeated failures. Using rule-based scoring.
[Retry]
```

The "Enable" button triggers a user gesture that is forwarded via messaging to the offscreen document.

### 4. Popup Data Section

```
┌─────────────────────────────────┐
│ Data                            │
│                                 │
│ Cache: 847 items (14-day TTL)   │
│ [Clear Cache]                   │
│                                 │
│ [Delete All Extension Data]     │
│                                 │
│ Diagnostics                     │
│ Adapter: OK (12 posts found)    │
│ Mode: gemini                    │
│ Failures (1hr): 0              │
│ Avg latency: 1.2s              │
└─────────────────────────────────┘
```

Diagnostics data fetched from service worker via `GET_HEALTH` message.

### 5. Popover Content Rendering

Finalize the explanation popover content (component shell built in Plan 05):

```
┌───────────────────────────────┐
│ 🟢 High Signal  · Medium     │
│                               │
│ • Includes concrete work      │
│   context and metrics.        │
│ • References a specific       │
│   company and timeframe.      │
│                               │
│ Source: AI-enhanced           │
│                               │
│ ┌───────┐┌──────────┐┌─────┐│
│ │ Agree ││ Disagree ││ N/A ││
│ └───────┘└──────────┘└─────┘│
└───────────────────────────────┘
```

Components (plain DOM, not Preact — runs in content script overlay):
- `PopoverHeader`: color dot, label text, confidence pill.
- `PopoverReasons`: bullet list of reasons.
- `PopoverSource`: "Rule-based" or "AI-enhanced" indicator.
- `PopoverFeedback`: three buttons.
- `PopoverDimensions` (optional, collapsible): horizontal bars for each dimension.

### 6. Feedback Flow

When user clicks Agree/Disagree/Not Useful in the popover:

1. Send `FEEDBACK` message to service worker with `{ itemId, feedbackType }`.
2. Service worker stores feedback in IndexedDB: `{ itemId, feedbackType, label, source, timestamp }`.
3. Update popover button state to show selection (highlight selected, disable all).
4. Feedback is local-only for MVP.

### 7. Settings Propagation

When settings change in the popup:

1. Popup writes to `chrome.storage.local`.
2. Popup sends `SETTINGS_CHANGED` to service worker.
3. Service worker forwards to content script on the active LinkedIn tab.
4. Content script applies changes immediately:
   - Sticker visibility: show/hide stickers based on new setting.
   - Strictness: adjust which items get scored (low confidence threshold changes).

### 8. Download Progress Flow

When user clicks "Enable On-Device AI":

1. Popup sends `TRIGGER_DOWNLOAD` to service worker.
2. Service worker forwards to offscreen document.
3. Offscreen document calls `LanguageModel.create()` with progress monitor.
4. Progress events flow: offscreen → service worker → popup (via storage listener or polling).
5. Popup re-renders progress bar.
6. On completion, popup updates to "Active" state. Service worker switches scoring mode.

Since the popup can close during download, progress is also persisted to `chrome.storage.local` so it can be re-read on next popup open.

### 9. Popup Styling

- Clean, minimal design.
- Consistent with sticker color palette (green/yellow/orange/red/gray).
- System font stack.
- Dark mode support (respect `prefers-color-scheme`).
- Accessible: all controls keyboard-reachable, sufficient contrast.

## Verification

- [ ] Popup opens and shows current settings.
- [ ] Changing a setting persists to storage and takes immediate effect on LinkedIn tab.
- [ ] Model status shows correct state for all 5 Gemini statuses.
- [ ] "Enable" button triggers download and progress displays.
- [ ] "Clear Cache" clears IndexedDB entries.
- [ ] "Delete All Data" removes all extension storage.
- [ ] Diagnostics section shows health data from service worker.
- [ ] Popover renders correct label, reasons, confidence, and source.
- [ ] Popover feedback buttons send message and update UI.
- [ ] Popup works at various heights without overflow issues.
- [ ] Dark mode renders correctly.

## Duration Estimate

4-5 days.
