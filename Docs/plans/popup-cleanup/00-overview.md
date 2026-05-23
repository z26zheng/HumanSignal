# 00 -- Popup Cleanup: Overview

**Status:** Draft
**Depends on:** None
**Blocks:** 02-implementation

## Goal

Remove redundant controls, merge model status sections, move developer tooling out of the popup, and collapse settings behind progressive disclosure. The popup should go from 7 visible sections to 4, with a cleaner path from "see value" to "configure."

## What Changes

| # | Change | Why |
|---|--------|-----|
| 1 | Remove "Pause HumanSignal" button + helper text | Redundant with header toggle |
| 2 | Remove "Off" from sticker visibility dropdown | Redundant with header toggle |
| 3 | Merge "Enhanced analysis" + "AI Detection Model" into one "AI Analysis" section | Users don't need to know about individual models |
| 4 | Collapse "Show stickers on" + "Sensitivity" into expandable "Settings" section | Progressive disclosure — most users never change defaults |
| 5 | Move Diagnostics (Mode, Cache, Queue, Failures) behind developer mode flag | Developer jargon should not be visible to normal users |
| 6 | Move developer mode toggle to hidden long-press on brand name | Normal users should never encounter the toggle |
| 7 | Remove inline LLM Dashboard + Log Viewer from popup; replace with "Open debug panel" button | Popup is too small for dense dashboards — these belong in the side panel |

## Before vs After

### Before (7 sections visible when enabled)

```
1. Brand + toggle
2. Live summary
3. Pause button (redundant)
4. Show stickers on + Sensitivity (always visible)
5. Enhanced analysis (Gemini)
6. AI Detection Model (TMR)
7. Data & privacy (collapsed, but Diagnostics inside is user-visible)
   + LLM Dashboard (developer mode, inline)
   + Log Viewer (developer mode, inline)
```

### After (4 sections visible when enabled)

```
1. Brand + toggle + live summary
2. Settings (collapsed)
3. AI Analysis (single merged section)
4. Data & privacy (collapsed, no diagnostics for normal users)
   + "Open debug panel" button (developer mode only)
```

## Dependencies

| Module | Touched? | What changes |
|--------|----------|-------------|
| `src/entrypoints/popup/App.tsx` | Modified | Remove pause section, remove "Off" option, merge model sections, collapse settings, remove inline dashboard/log viewer, add long-press handler, add "Open debug panel" button |
| `src/entrypoints/popup/style.css` | Modified | Remove pause button styles, add collapsed settings styles |
| `src/entrypoints/popup/enhanced-analysis.ts` | Modified | Merge TMR status into combined AI Analysis status logic |
| `src/entrypoints/popup/llm-dashboard.ts` | Not touched | Still used by the debug panel (side panel), just not rendered in popup |
| `src/entrypoints/popup/log-viewer.ts` | Not touched | Same — used by debug panel |
| `src/shared/types.ts` | Not touched | `isDeveloperMode` flag stays on `UserSettings` |
| `src/overlay/*` | Not touched | |
| `src/scoring-coordinator/*` | Not touched | |
