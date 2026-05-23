# Developer Mode

Date: 2026-05-08

## Purpose

Developer mode is a hidden diagnostic surface for developers, QA testers, and power users who need to see exactly what the extension is doing. It exposes per-item telemetry inline on LinkedIn and a central LLM dashboard in the popup.

Normal users should never encounter developer mode unless they deliberately enable it.

---

## How to Enable

Developer mode is toggled in the popup under **Data & privacy > Diagnostics**:

```
┌─────────────────────────────────────┐
│  ▾ Diagnostics                      │
│                                     │
│  Scoring mode: gemini               │
│  Items scored: 47                   │
│  Cache: 312 items                   │
│  Queue: 0                           │
│  Failures: 2                        │
│                                     │
│  Developer mode               [OFF] │
│                                     │
└─────────────────────────────────────┘
```

**Access method (revised 2026-05-15):** Long-press (500ms) on the "HumanSignal" brand name in the popup header. A small toast confirms: "Developer mode enabled" / "Developer mode disabled." This replaces the previous approach of burying a toggle inside Data & privacy > Diagnostics.

- Developer mode persists across sessions (stored in `chrome.storage.local`).
- Disabling developer mode immediately removes all debug pills from the feed, closes the debug panel if open, and hides the "Open debug panel" button in the popup.

---

## Part 1: Debug Pill (Inline on LinkedIn)

### What It Is

When developer mode is on, a small secondary pill appears next to every scoring sticker on LinkedIn. This is the **debug pill**.

```
┌──────────────────────────────────────────────┐
│                                              │
│  LinkedIn post content...                    │
│                                              │
│        🟢 Feels Human    🔧 142ms           │
│                                              │
└──────────────────────────────────────────────┘
```

- The scoring sticker (🟢 Feels Human) behaves normally.
- The debug pill (🔧 142ms) appears to its right.
- The debug pill shows the total scoring latency for this item.

### Debug Pill Appearance

- Small monospace pill, dark background (`#1e293b`), light text (`#e2e8f0`).
- Wrench icon (🔧) or a simple `D` prefix to distinguish from the scoring sticker.
- Compact: shows only the most important metric inline — **total latency in ms**.
- Does not use the label color system. Always the same dark/muted style so it's visually distinct from scoring stickers.

### Debug Pill States

| State | Pill text | Meaning |
|-------|-----------|---------|
| Rules scored | `🔧 12ms rules` | Rules engine returned a result in 12ms |
| AI queued | `🔧 12ms rules → AI queued` | Rules result shown, AI enhancement is queued |
| AI scoring | `🔧 12ms rules → AI ⏳` | AI is actively processing this item |
| AI complete | `🔧 12ms rules → 1842ms AI` | AI returned a result, showing both latencies |
| AI failed | `🔧 12ms rules → AI ✗` | AI attempted and failed for this item |
| AI unavailable | `🔧 12ms rules only` | AI not available, rules result is final |
| Cache hit | `🔧 cache` | Result came from cache, no scoring ran |
| Error | `🔧 error` | Scoring failed entirely for this item |

### Clicking the Debug Pill

Clicking the debug pill opens a **debug popover** (separate from the explanation popover) showing full telemetry for this specific item:

```
┌─────────────────────────────────────┐
│  🔧 Debug: item-a3f8c2             │
├─────────────────────────────────────┤
│                                     │
│  Item type        post              │
│  Content hash     a3f8c2...b7      │
│  Text length      847 chars         │
│  Truncated        no                │
│                                     │
│  ── Event Trace ──────────────────  │
│                                     │
│  17:41:52.004  DISCOVERED           │
│                DOM adapter found     │
│                post element          │
│                                     │
│  17:41:52.005  EXTRACTED            │
│                847 chars, hash       │
│                a3f8c2...b7          │
│                                     │
│  17:41:52.006  CACHE_MISS           │
│                No cached result for  │
│                this hash + version   │
│                                     │
│  17:41:52.007  RULES_STARTED        │
│                                     │
│  17:41:52.019  RULES_COMPLETED      │
│                12ms → likely-ai      │
│                confidence: medium    │
│                                     │
│  17:41:52.020  STICKER_SHOWN        │
│                Label: Likely AI      │
│                (rules result)        │
│                                     │
│  17:41:52.021  AI_QUEUED            │
│                Priority: 1           │
│                (in viewport)         │
│                                     │
│  17:41:53.340  AI_STARTED           │
│                Session: reused       │
│                                     │
│  17:41:55.182  AI_COMPLETED         │
│                1842ms → feels-human  │
│                confidence: high      │
│                                     │
│  17:41:55.183  STICKER_UPGRADED     │
│                Likely AI →           │
│                Feels Human           │
│                                     │
│  ── Result ───────────────────────  │
│                                     │
│  Source            gemini            │
│  Final label       feels-human      │
│  Confidence        high             │
│  Scoring version   gemini-1         │
│                                     │
│  ── Latency Summary ──────────────  │
│                                     │
│  Rules engine      12ms             │
│  AI queue wait     1319ms           │
│  AI inference      1842ms           │
│  Total (discover   3179ms           │
│   → final label)                    │
│  Cache             miss             │
│                                     │
│  ── Dimensions ───────────────────  │
│                                     │
│  Authenticity      0.82             │
│  Specificity       0.91             │
│  Originality       0.74             │
│  Usefulness        0.88             │
│  Engagement bait   0.05             │
│  Templating        0.08             │
│                                     │
│  [Copy as JSON]                     │
│                                     │
└─────────────────────────────────────┘
```

The event trace is the primary section. It tells the full story of what happened to this item in chronological order.

#### Event Trace

Every item tracks an ordered list of timestamped events from discovery to final label. Each event includes a short description line.

| Event | When it fires | Description shown |
|-------|--------------|-------------------|
| `DISCOVERED` | DOM adapter finds the post/comment element | "DOM adapter found [post/comment] element" |
| `EXTRACTED` | Text extracted and content hash computed | "[n] chars, hash [truncated hash]" |
| `CACHE_HIT` | Cache lookup found a valid entry | "Cached [source] result, version [v]" |
| `CACHE_MISS` | Cache lookup found nothing or stale entry | "No cached result for this hash + version" |
| `RULES_STARTED` | Rules engine begins scoring | (no description needed) |
| `RULES_COMPLETED` | Rules engine returns a result | "[n]ms → [label], confidence: [level]" |
| `STICKER_SHOWN` | Sticker rendered on LinkedIn with initial label | "Label: [display label] ([source] result)" |
| `AI_QUEUED` | Item added to the Gemini scoring queue | "Priority: [1-3] ([reason])" |
| `AI_STARTED` | Gemini begins processing this item | "Session: [created/reused]" |
| `AI_COMPLETED` | Gemini returns a valid result | "[n]ms → [label], confidence: [level]" |
| `AI_FAILED` | Gemini returned invalid output or errored | "[error message]" |
| `AI_RETRY` | Gemini repair prompt sent after first failure | "Retry attempt [n]" |
| `AI_SKIPPED` | AI was unavailable or item was not sent to AI | "[reason: unavailable/paused/low-priority]" |
| `STICKER_UPGRADED` | Sticker label changed after AI result | "[old label] → [new label]" |
| `STICKER_UNCHANGED` | AI returned same label as rules | "AI confirmed rules result" |
| `CANCELLED` | Item left viewport before scoring completed | "Item scrolled out of viewport" |
| `ERROR` | Unexpected error at any stage | "[error message]" |

Events are displayed newest-last (chronological, top-to-bottom). Each event shows:
- Timestamp with millisecond precision
- Event name in uppercase monospace
- 1-2 line description

#### Other Sections

| Section | Fields |
|---------|--------|
| Result | Final scoring source, label (internal key), confidence, scoring version |
| Latency Summary | Rules engine ms, AI queue wait ms, AI inference ms, total end-to-end ms (discovery → final label), cache hit/miss |
| Dimensions | All six dimension scores as raw floats |

The Errors section from the previous design is removed. Errors now appear inline in the event trace with full context about when they happened in the item's lifecycle.

**"Copy as JSON"** button copies the full debug payload including the event trace to the clipboard for bug reports.

### Debug Popover Behavior

- Opens next to the debug pill, same positioning logic as the explanation popover.
- Only one popover open at a time (debug or explanation, not both).
- Clicking a scoring sticker while a debug popover is open closes the debug popover and opens the explanation popover, and vice versa.
- Closes on outside click, Escape, or scroll-away.

---

## Part 2: LLM Dashboard (in Popup)

### What It Is

When developer mode is on, a new section appears in the popup between "Enhanced analysis" and "Data & privacy." This is the **LLM dashboard** — a central view of what the AI model is doing across all tabs.

### Layout

```
┌─────────────────────────────────────┐
│  🔧 LLM Dashboard                  │
├─────────────────────────────────────┤
│                                     │
│  ── Model Status ─────────────────  │
│                                     │
│  Availability     available         │
│  Session          active (idle 12s) │
│  Mode             gemini            │
│  Scoring version  gemini-1          │
│                                     │
│  ── Session Activity ─────────────  │
│                                     │
│  Items scored     47                │
│  In-flight        1                 │
│  Queue depth      3                 │
│  Avg latency      1.2s              │
│  P95 latency      3.4s              │
│                                     │
│  ── Failures ─────────────────────  │
│                                     │
│  Consecutive      0                 │
│  Total            2                 │
│  Last error       (none)            │
│  Paused until     (not paused)      │
│                                     │
│  ── Cache ────────────────────────  │
│                                     │
│  Entries           312              │
│  Hit rate          78%              │
│  Memory entries    24               │
│  IndexedDB entries 312              │
│                                     │
│  ── Recent Events ────────────────  │
│                                     │
│  17:42:01  gemini.score     ok      │
│  17:42:00  gemini.score     ok      │
│  17:41:58  gemini.score     fail    │
│  17:41:55  gemini.session   created │
│  17:41:52  mode.switch      gemini  │
│                                     │
│  [View full log (200 entries)]      │
│  [Export log as JSON]               │
│                                     │
└─────────────────────────────────────┘
```

### Dashboard Sections

| Section | What it shows |
|---------|--------------|
| Model Status | Current Gemini availability, session state (active/idle/destroyed), scoring mode, scoring version |
| Session Activity | Items scored this session, in-flight count, queue depth, average and P95 AI latency |
| Failures | Consecutive failure count, total failures, last error message, pause-until timestamp if circuit-breaker is active |
| Cache | Total entries, hit rate percentage, breakdown of memory vs IndexedDB entries |
| Recent Events | Last ~10 log entries relevant to scoring and AI, with timestamp, context, and outcome. Scrollable. |

### Dashboard Behavior

- Auto-refreshes every 2 seconds while the popup is open and developer mode is on.
- "View full log" opens a scrollable view of the full 200-entry in-memory log buffer.
- "Export log as JSON" downloads the full log buffer plus current health metrics as a `.json` file. Useful for bug reports.
- The dashboard is only visible when developer mode is enabled. It disappears immediately when developer mode is toggled off.

---

## Part 3: Log Viewer

### What It Is

A scrollable, filterable view of the full in-memory log buffer. Accessed from the LLM Dashboard's "View full log" link.

### Layout

```
┌─────────────────────────────────────┐
│  🔧 Log Viewer          [Export]    │
├─────────────────────────────────────┤
│  Filter: [All ▾]  [Search...]       │
├─────────────────────────────────────┤
│                                     │
│  17:42:01  INFO   gemini.score      │
│  Scoring completed                  │
│  { itemType: "post", latency: 1842 }│
│                                     │
│  17:41:58  WARN   gemini.score      │
│  Gemini returned invalid JSON       │
│  { attempt: 1, willRetry: true }    │
│                                     │
│  17:41:55  INFO   gemini.session    │
│  Session created                    │
│  { idleTimeout: 60000 }             │
│                                     │
│  ... (scrollable)                   │
│                                     │
└─────────────────────────────────────┘
```

### Features

- Filter dropdown: All, Errors only, Warnings only, AI only, Scoring only, Cache only.
- Search box: free-text search across log context and message fields.
- Each entry shows: timestamp, level (color-coded), context, message, and data payload.
- Error entries highlighted with a subtle red-tinted background.
- Warn entries highlighted with a subtle amber-tinted background.
- Export button downloads the filtered view as JSON.

---

## Privacy in Developer Mode

- Developer mode does not change what data is collected. It only changes what is displayed.
- The debug pill and LLM dashboard read from the same in-memory log buffer and health metrics that already exist.
- No additional LinkedIn content is stored. Content hashes are shown, not raw text.
- Debug popovers show content hashes (truncated), never the original post/comment text.
- Exported logs contain the same structured entries from the ring buffer — no raw LinkedIn content.

---

## When Developer Mode Is Off

- No debug pills appear on LinkedIn.
- No "Open debug panel" button in the popup.
- No debug panel (side panel closes if open).
- No diagnostics visible in the popup at all. Normal users see only the summary, settings, AI Analysis, and Data & privacy sections.

---

## Debug Surfaces Overview (Revised 2026-05-15)

Developer mode enables two debug surfaces. The LLM Dashboard and Log Viewer that were previously rendered inline in the popup have been moved to the debug panel (side panel). The popup is too small (360px x 560px) for dense dashboards.

| Surface | Where | What it shows | Best for |
|---------|-------|--------------|----------|
| **Debug pill + popover** | Inline on LinkedIn, next to each scoring sticker | One item's full event trace, latency breakdown, dimensions | Inspecting a specific post/comment |
| **Debug panel** | Chrome side panel (opened via popup button) | LLM Dashboard (model status, session activity, failures, cache), live event stream, log viewer with filter/search/export, per-model diagnostics, item trace inspector | All debug workflows: quick health check, active event monitoring, log analysis |

The popup's only developer-mode element is a single "Open debug panel" button. Everything else lives in the side panel where there's room for it.

Both surfaces read from the same underlying data (EventTraceStore, HealthMetrics, Logger ring buffer).

See [Debug-Panel.md](Debug-Panel.md) for the full debug panel specification.

---

## Implementation Notes

- Developer mode is a `boolean` in `UserSettings` (e.g., `isDeveloperMode`).
- The debug pill is a second `SignalSticker`-like component rendered in the overlay root, positioned to the right of the scoring sticker.
- The debug popover is a variant of the explanation popover, not a separate system.
- Each item needs a per-item event trace: an ordered array of `{ event, timestamp, detail? }` entries tracked from discovery through final label. This should be stored on the registry entry or a parallel debug metadata map, keyed by item ID.
- The event trace is populated by the DOM adapter (DISCOVERED, EXTRACTED), scoring coordinator (CACHE_HIT/MISS, RULES_STARTED/COMPLETED, AI_QUEUED/STARTED/COMPLETED/FAILED/RETRY/SKIPPED), and overlay controller (STICKER_SHOWN, STICKER_UPGRADED, STICKER_UNCHANGED, CANCELLED).
- Event traces are in-memory only, not persisted. They are cleared when the item leaves the registry.
- Latency summary is derived from event trace timestamps, not tracked as separate counters.
- The LLM dashboard and log viewer live in the debug panel (side panel), not the popup. They read from `GET_HEALTH` and `GET_DEBUG_STATE` messages.
- The debug panel uses a long-lived `chrome.runtime.connect` port for push-based event streaming (see Debug-Panel.md).
- The popup's only developer-mode element is the "Open debug panel" button, which opens the side panel.
