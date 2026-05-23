# Universal Debug Panel

Date: 2026-05-08

## Purpose

A persistent, always-visible debug surface that shows the LLM's real-time event stream, active traces, and system state. Unlike the per-pill debug popover (which shows one item at a time), the debug panel shows everything happening across all items simultaneously.

This is the "mission control" for developers working on HumanSignal.

---

## Where It Lives

The debug panel is a **Chrome side panel** — not the extension popup, not a popover, not a tab.

Why side panel and not popup:
- The popup closes when you click away. A developer debugging scoring behavior needs it open while scrolling LinkedIn.
- The popup is 360px wide and 560px tall. Not enough room for a live event stream plus metrics.
- A side panel stays open alongside the LinkedIn tab. The developer can scroll the feed and watch events arrive in real time.

Why side panel and not a new tab:
- A new tab loses context of the LinkedIn page. The developer can't see stickers and the debug panel simultaneously.
- A side panel sits beside the feed, which is exactly the workflow: scroll, watch stickers appear, watch the panel show what happened.

Why not the same side panel we removed from MVP:
- The MVP removed the side panel for *user-facing explanations*. This debug panel is developer-only, behind the developer mode flag. It doesn't conflict with the popup-first decision for normal users.

---

## How to Open

1. Enable developer mode (Data & privacy > Diagnostics > Developer mode toggle).
2. A new button appears in the popup: **"Open debug panel"**.
3. Clicking it opens the Chrome side panel.
4. The panel stays open as long as the developer wants. It persists across LinkedIn page navigations within the same tab.
5. Disabling developer mode auto-closes the panel.

Alternative access: right-click the extension icon → "Open debug panel" (only visible when developer mode is on).

---

## Layout

The panel is split into three vertical sections: **status bar**, **live event stream**, and **item trace inspector**. The event stream is the dominant section.

```
┌──────────────────────────────────────────┐
│  🔧 HumanSignal Debug Panel             │
├──────────────────────────────────────────┤
│                                          │
│  ── Status Bar ────────────────────────  │
│                                          │
│  Mode: gemini    Session: active (4s)    │
│  Queue: 2        In-flight: 1            │
│  Scored: 47      Failures: 2             │
│  Cache: 312 (78% hit)                    │
│                                          │
├──────────────────────────────────────────┤
│                                          │
│  ── Live Event Stream ─────────────────  │
│                                          │
│  Filter: [All ▾]  [Search...]   [⏸ ▶]   │
│                                          │
│  22:41:55.183  STICKER_UPGRADED          │
│  item-a3f8  post                         │
│  Likely AI → Feels Human                 │
│                                          │
│  22:41:55.182  AI_COMPLETED              │
│  item-a3f8  post                         │
│  1842ms → feels-human, high              │
│                                          │
│  22:41:53.340  AI_STARTED                │
│  item-a3f8  post                         │
│  Session: reused                         │
│                                          │
│  22:41:52.900  RULES_COMPLETED           │
│  item-c7e2  comment                      │
│  8ms → likely-ai, medium                 │
│                                          │
│  22:41:52.892  RULES_STARTED             │
│  item-c7e2  comment                      │
│                                          │
│  22:41:52.021  AI_QUEUED                 │
│  item-a3f8  post                         │
│  Priority: 1 (in viewport)              │
│                                          │
│  22:41:52.020  STICKER_SHOWN             │
│  item-a3f8  post                         │
│  Label: Likely AI (rules result)         │
│                                          │
│  22:41:52.019  RULES_COMPLETED           │
│  item-a3f8  post                         │
│  12ms → likely-ai, medium                │
│                                          │
│  ... (scrolls, newest at top)            │
│                                          │
├──────────────────────────────────────────┤
│                                          │
│  ── Item Trace Inspector ──────────────  │
│                                          │
│  Click any event above to inspect the    │
│  full trace for that item.               │
│                                          │
└──────────────────────────────────────────┘
```

---

## Section 1: Status Bar

A compact, always-visible row at the top showing system-wide state at a glance. Updates every 2 seconds.

| Field | Source | Example |
|-------|--------|---------|
| Mode | `ScoringCoordinator.modeManager.getMode()` | `gemini` |
| Session | Gemini session state + idle duration | `active (4s)` / `idle (32s)` / `destroyed` / `none` |
| Queue | `ScoringQueue.getDepth()` | `2` |
| In-flight | `ScoringCoordinator.inFlightByHash.size` | `1` |
| Scored | `ScoringCoordinator.itemsScored` | `47` |
| Failures | `ScoringCoordinator.failureCount` | `2` |
| Cache | `ScoreCache.getSize()` + hit rate | `312 (78% hit)` |

The status bar uses subtle color coding:
- Mode `gemini` = green text. Mode `rules` = yellow text.
- Failures > 0 = red count.
- Queue > 5 = amber count (indicates backpressure).

---

## Section 2: Live Event Stream

The main section. Shows a real-time, auto-scrolling feed of every event from the `EventTraceStore`, across all items.

### Event Format

Each event entry shows three lines:

```
[timestamp]  [EVENT_NAME]
[itemId]  [itemType]
[description]
```

- **Timestamp:** `HH:MM:SS.mmm` format (millisecond precision, local time).
- **Event name:** uppercase monospace, color-coded by category.
- **Item ID:** truncated hash. Clickable — clicking it opens the item's full trace in the inspector below.
- **Item type:** `post` or `comment`.
- **Description:** 1-line summary from the trace event detail.

### Event Color Coding

| Category | Events | Color |
|----------|--------|-------|
| Discovery | `DISCOVERED`, `EXTRACTED` | Muted gray |
| Cache | `CACHE_HIT`, `CACHE_MISS` | Cyan |
| Rules | `RULES_STARTED`, `RULES_COMPLETED` | Blue |
| AI | `AI_QUEUED`, `AI_STARTED`, `AI_COMPLETED` | Green |
| AI failure | `AI_FAILED`, `AI_RETRY`, `AI_SKIPPED` | Orange |
| Sticker | `STICKER_SHOWN`, `STICKER_UPGRADED`, `STICKER_UNCHANGED` | White/default |
| Lifecycle | `CANCELLED` | Yellow |
| Error | `ERROR` | Red background tint |

### Controls

**Filter dropdown:**
- All
- AI only (AI_QUEUED, AI_STARTED, AI_COMPLETED, AI_FAILED, AI_RETRY, AI_SKIPPED)
- Rules only (RULES_STARTED, RULES_COMPLETED)
- Errors & warnings (AI_FAILED, AI_RETRY, ERROR, CANCELLED)
- Sticker lifecycle (STICKER_SHOWN, STICKER_UPGRADED, STICKER_UNCHANGED)
- Cache (CACHE_HIT, CACHE_MISS)

**Search box:**
- Free-text search across item ID, event name, and description.
- Filters the stream in real time.

**Pause/Resume button (⏸ / ▶):**
- Pauses the auto-scroll so the developer can read a specific section without it scrolling away.
- New events still arrive and are buffered. When resumed, the stream jumps to the latest.
- Badge on the pause button shows how many events arrived while paused: `⏸ (12)`.

**Auto-scroll behavior:**
- When not paused, the stream auto-scrolls to keep the newest event visible (newest at top).
- If the developer manually scrolls up to inspect older events, auto-scroll pauses automatically. A "Jump to latest" button appears at the top.

### Stream Capacity

- Shows the last 500 events in the panel (more than the 200-entry log buffer, because the stream includes trace events from EventTraceStore as well as logger entries).
- Older events are evicted from the panel view but may still exist in the EventTraceStore if the item is still tracked.

---

## Section 3: Item Trace Inspector

A collapsible bottom section that shows the full per-item event trace for a selected item.

### How to open

- Click any item ID in the live event stream.
- Or click a debug pill on LinkedIn (if both the debug panel and debug popover are available, prefer the panel when it's open).

### Layout

When an item is selected:

```
┌──────────────────────────────────────────┐
│  ── Item Trace: item-a3f8 (post) ──────  │
│                                          │
│  22:41:52.004  DISCOVERED               │
│  DOM adapter found post element          │
│                                          │
│  22:41:52.005  EXTRACTED                 │
│  847 chars, hash a3f8c2...b7            │
│                                          │
│  22:41:52.006  CACHE_MISS               │
│  No cached result for this hash          │
│                                          │
│  22:41:52.007  RULES_STARTED            │
│                                          │
│  22:41:52.019  RULES_COMPLETED          │
│  12ms → likely-ai, medium               │
│                                          │
│  22:41:52.020  STICKER_SHOWN            │
│  Label: Likely AI (rules result)         │
│                                          │
│  22:41:52.021  AI_QUEUED                │
│  Priority: 1 (in viewport)              │
│                                          │
│  22:41:53.340  AI_STARTED              │
│  Session: reused, queue wait: 1319ms     │
│                                          │
│  22:41:55.182  AI_COMPLETED            │
│  1842ms → feels-human, high              │
│                                          │
│  22:41:55.183  STICKER_UPGRADED        │
│  Likely AI → Feels Human                 │
│                                          │
│  ── Latency Summary ───────────────────  │
│  Rules: 12ms  Queue: 1319ms  AI: 1842ms │
│  Total: 3179ms                           │
│                                          │
│  [Copy trace as JSON]  [Close]           │
│                                          │
└──────────────────────────────────────────┘
```

This is the same trace data shown in the per-pill debug popover, but displayed in the persistent panel instead.

### Inspector Behavior

- Selecting a new item replaces the previous trace. Only one item inspected at a time.
- The latency summary is derived from trace timestamps (same logic as debug popover).
- "Copy trace as JSON" copies the full trace for this item.
- "Close" collapses the inspector back to the placeholder text.
- When the inspected item receives new events (e.g., AI_COMPLETED arrives while the trace is open), the trace updates live.

---

## Interaction with Other Debug Surfaces

| Surface | Relationship to debug panel |
|---------|---------------------------|
| **Debug pill (on LinkedIn)** | Independent. Both can be active. Clicking a debug pill opens the per-item debug popover on LinkedIn. If the panel is also open, clicking the item ID in the panel's stream is an alternative way to see the same trace. |
| **Debug popover (on LinkedIn)** | Independent. The popover shows one item's trace inline. The panel shows all items' events plus a selectable inspector. They don't conflict. |
| **LLM Dashboard (in popup)** | The popup dashboard shows aggregate metrics. The debug panel shows real-time per-event detail. Complementary, not overlapping. The popup dashboard is useful for a quick health check; the panel is for active debugging. |
| **Log viewer (in popup)** | The popup log viewer shows the 200-entry ring buffer. The debug panel's event stream shows EventTraceStore events, which are more granular and per-item. The popup log viewer remains available for logger-level events that aren't per-item traces. |

---

## Panel Lifecycle

| Trigger | What happens |
|---------|-------------|
| Developer mode enabled + "Open debug panel" clicked | Side panel opens. Connects to background via `chrome.runtime.connect` port. Starts receiving events. |
| Developer mode disabled | Panel auto-closes. |
| LinkedIn tab navigated to a different site | Panel stays open but shows: "Navigate to LinkedIn to see events." |
| LinkedIn tab navigated to a new LinkedIn page | Panel continues. New items' events appear in the stream. Old items that were detached show CANCELLED events. |
| Extension updated/reloaded | Panel closes. Developer re-opens after reload. |
| Service worker restarts | Panel reconnects. Shows a "Reconnected" event in the stream. Events from before the restart are lost (in-memory only). |
| Multiple LinkedIn tabs open | Panel shows events from the active tab only. A tab selector at the top of the panel allows switching between tabs. |

---

## Message Protocol

The debug panel uses a long-lived `chrome.runtime.connect` port (not request/response messaging) so events can be pushed to the panel in real time without polling.

| Message | Direction | Payload |
|---------|-----------|---------|
| `DEBUG_PANEL_CONNECTED` | panel → background | `{ tabId }` — panel declares which tab to observe |
| `DEBUG_PANEL_EVENT` | background → panel | `{ itemId, event, timestamp, detail?, itemType }` — pushed on each new trace event |
| `DEBUG_PANEL_STATUS` | background → panel | Full status bar payload — pushed every 2 seconds |
| `DEBUG_PANEL_ITEM_TRACE` | panel → background (request) | `{ itemId }` — panel requests full trace for inspector |
| `DEBUG_PANEL_ITEM_TRACE_RESULT` | background → panel (response) | Full ordered event array for the item |
| `DEBUG_PANEL_DISCONNECTED` | panel → background | Panel closing, stop pushing events |

---

## Visual Design

### Dimensions

- Side panel width: controlled by Chrome (typically ~400px, user-resizable).
- No fixed height — fills the side panel area.

### Typography

- Monospace font for timestamps, event names, item IDs, and descriptions: `JetBrains Mono`, `Fira Code`, or `ui-monospace` system fallback.
- Status bar uses the same sans-serif as the popup.
- Font size: 12px for stream entries, 13px for status bar, 11px for secondary detail lines.

### Theme

- Dark theme only. Debug panels look better dark and it visually separates the panel from LinkedIn's light UI.
- Background: `#0f172a`
- Event entry background: `#1e293b`
- Text: `#e2e8f0`
- Muted text: `#94a3b8`
- Event category colors per the table above.
- Selected item highlight: `#2563eb` left border accent.

### Scrolling

- The event stream is the only scrollable section.
- Status bar is sticky at the top.
- Item trace inspector is sticky at the bottom (collapsible).

---

## Privacy

Same rules as all debug surfaces:

- No raw LinkedIn text anywhere in the panel.
- Item IDs shown as truncated content hashes.
- Descriptions reference metadata (text length, label, latency), never content.
- "Copy trace as JSON" exports hashes and metrics, never post/comment text.
- All data is in-memory. Nothing is persisted by the panel itself.

---

## Implementation Notes

- The debug panel is a **Chrome side panel** registered in the manifest only when developer mode is on, or always registered but showing a "Enable developer mode" placeholder when off.
- Entry point: `src/entrypoints/debug-panel/main.ts` + `src/entrypoints/debug-panel/App.tsx`.
- Uses the same Preact stack as the popup.
- Connects to background via `chrome.runtime.connect` for push-based event streaming.
- Background maintains a set of connected debug panel ports. When a trace event fires, it pushes to all connected panels (typically just one).
- The panel does not import scoring, caching, or adapter modules. It only receives data via the port protocol.
- The 500-event stream buffer is maintained in the panel's own in-memory state, not in the background.
- Status bar data comes from the existing `GET_HEALTH` / `GET_EXTENDED_HEALTH` message, polled every 2 seconds by the panel.

---

## Manifest Changes

When developer mode is enabled, the side panel permission (`sidePanel`) needs to be available. Options:

**Option A:** Always include `sidePanel` in permissions. The panel entry point is always registered but shows a placeholder when developer mode is off. Simpler to implement.

**Option B:** Use optional permissions. Request `sidePanel` when developer mode is toggled on. More correct but adds permission prompt UX.

Recommendation: **Option A** for now. The `sidePanel` permission doesn't trigger a user-facing prompt in Chrome, so there's no UX cost to including it.

---

## Verification

- [ ] Debug panel opens from popup button when developer mode is on.
- [ ] Debug panel auto-closes when developer mode is toggled off.
- [ ] Status bar shows correct live system state, updates every 2 seconds.
- [ ] Live event stream shows events from all items in real time.
- [ ] Events are color-coded by category.
- [ ] Filter dropdown correctly filters the stream.
- [ ] Search filters events by item ID, event name, and description.
- [ ] Pause button stops auto-scroll and shows buffered event count.
- [ ] Resume button jumps to latest and resumes auto-scroll.
- [ ] Clicking an item ID opens the full trace in the inspector.
- [ ] Inspector updates live when new events arrive for the inspected item.
- [ ] "Copy trace as JSON" produces valid, parseable JSON with no raw LinkedIn text.
- [ ] Panel survives LinkedIn page navigations within the same tab.
- [ ] Panel reconnects gracefully after service worker restart.
- [ ] No raw LinkedIn post/comment text appears anywhere in the panel.
- [ ] Panel does not affect LinkedIn performance or extension behavior when open.
- [ ] Panel is not visible or accessible when developer mode is off.
