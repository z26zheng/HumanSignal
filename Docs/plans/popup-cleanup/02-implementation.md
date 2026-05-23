# 02 -- Popup Cleanup: Implementation

**Status:** Draft
**Depends on:** 00-overview
**Blocks:** 04-testing

## Changes

### 1. Remove the "Pause HumanSignal" section

**File:** `src/entrypoints/popup/App.tsx`, lines 539-549

Delete the entire section:

```tsx
// DELETE this section:
<section className="panel" aria-label="Pause">
  <button ... onClick={handleToggle}>Pause HumanSignal</button>
  <p className="muted">Temporarily hide all stickers.</p>
</section>
```

The header toggle (`handleToggle` at line 163) already handles on/off. No replacement needed.

### 2. Remove "Off" from sticker visibility dropdown

**File:** `src/entrypoints/popup/App.tsx`, line 564

Remove the `<option value="off">Off</option>` line. The dropdown should only have: All, Posts only, Comments only.

Also remove the `isEnabled: value !== 'off'` logic from the `onChange` handler (line 558) — the dropdown no longer controls enabled state.

### 3. Collapse settings into an expandable section

**File:** `src/entrypoints/popup/App.tsx`, lines 551-585

Wrap the "Show stickers on" and "Sensitivity" controls in a collapsible section, collapsed by default:

```tsx
const [settingsOpen, setSettingsOpen] = useState<boolean>(false);

<section className="panel" aria-label="Settings">
  <button
    type="button"
    className="collapse-toggle"
    onClick={(): void => setSettingsOpen(!settingsOpen)}
    aria-expanded={settingsOpen}
  >
    <span className="chevron">{settingsOpen ? '▾' : '▸'}</span>
    Settings
  </button>

  {settingsOpen ? (
    <div className="collapse-body">
      {/* existing Show stickers on dropdown */}
      {/* existing Sensitivity segmented control */}
    </div>
  ) : null}
</section>
```

### 4. Merge "Enhanced analysis" and "AI Detection Model" into "AI Analysis"

**File:** `src/entrypoints/popup/App.tsx`, lines 587-610

Replace the two separate `<section>` blocks with a single merged section:

```tsx
<section className="panel" aria-label="AI Analysis">
  <h2 className="panel-heading">AI Analysis</h2>
  {aiAnalysisContent()}
</section>
```

**New function:** `aiAnalysisContent()` derives a single combined status from `tmrLoaded`, `tmrError`, and `geminiStatus`:

```tsx
function aiAnalysisContent(): JSX.Element {
  // Both ready
  if (tmrLoaded && geminiStatus.availability === 'available') {
    return (
      <div className="gemini-headline">
        <span className="dot dot--green" />
        <span className="gemini-headline-text">Active — running locally</span>
      </div>
    );
  }

  // TMR ready, Gemini not
  if (tmrLoaded) {
    return (
      <div className="gemini-section">
        <div className="gemini-headline">
          <span className="dot dot--green" />
          <span className="gemini-headline-text">Active</span>
        </div>
        {geminiStatus.availability === 'downloadable' ? (
          <p className="muted">
            <a onClick={handleTriggerDownload}>Enable enhanced explanations</a>
          </p>
        ) : null}
      </div>
    );
  }

  // TMR loading
  if (!tmrLoaded && tmrError === null) {
    return (
      <div className="gemini-headline">
        <span className="dot dot--yellow" />
        <span className="gemini-headline-text">Setting up AI analysis...</span>
      </div>
    );
  }

  // TMR error
  if (tmrError !== null) {
    return (
      <div className="gemini-section">
        <p className="muted">AI analysis temporarily unavailable. Results use pattern matching.</p>
        <button type="button" className="btn btn--sm" onClick={checkTmrStatus}>Try again</button>
      </div>
    );
  }

  // No TMR, Gemini available
  if (geminiStatus.availability === 'available') {
    return (
      <div className="gemini-headline">
        <span className="dot dot--green" />
        <span className="gemini-headline-text">Active — running locally</span>
      </div>
    );
  }

  // No TMR, Gemini downloadable — show onboarding
  if (geminiStatus.availability === 'downloadable') {
    return geminiOnboardingFlow();
  }

  // Nothing available
  return <p className="muted">Pattern-based analysis active.</p>;
}
```

Remove the separate `geminiStatusSection()` function (lines 412-465) and the separate TMR section (lines 592-610). Their logic is absorbed into `aiAnalysisContent()`.

**File:** `src/entrypoints/popup/enhanced-analysis.ts`

Update `getEnhancedAnalysisContent` to accept both Gemini and TMR state, or replace it entirely with the inline `aiAnalysisContent()` logic above. The file can be simplified since the merged section doesn't need the full onboarding/downloading/error state machine for two separate models.

### 5. Remove Diagnostics from Data & Privacy

**File:** `src/entrypoints/popup/App.tsx`, lines 676-717

Delete the entire Diagnostics sub-section inside the Data & Privacy collapse body:

```tsx
// DELETE this block:
<button className="collapse-toggle" onClick={...} aria-expanded={diagOpen}>
  <span className="chevron">...</span>
  Diagnostics
</button>
{diagOpen && health !== null ? (
  <dl className="diagnostics">...</dl>
) : null}
{diagOpen ? (
  <div className="dev-toggle">...</div>
) : null}
```

Normal users see only: privacy statement + Clear cache + Delete all data.

### 6. Add long-press developer mode toggle on brand name

**File:** `src/entrypoints/popup/App.tsx`, in `brandHeader()` function (lines 395-409)

Add a long-press handler to the brand name:

```tsx
function brandHeader(showToggle: boolean): JSX.Element {
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handlePointerDown(): void {
    longPressTimer.current = setTimeout((): void => {
      void updateSettings({ isDeveloperMode: !settings.isDeveloperMode });
      // Show toast: "Developer mode enabled" / "Developer mode disabled"
    }, 500);
  }

  function handlePointerUp(): void {
    if (longPressTimer.current !== null) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }

  return (
    <header className="brand">
      <div
        className="brand-text"
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
      >
        <p className="brand-name">HumanSignal</p>
        <p className="brand-tagline">Make LinkedIn feel human again.</p>
      </div>
      {showToggle ? ( /* toggle */ ) : null}
    </header>
  );
}
```

### 7. Replace inline LLM Dashboard + Log Viewer with "Open debug panel" button

**File:** `src/entrypoints/popup/App.tsx`, lines 722-723

Replace:

```tsx
// DELETE:
{settings.isDeveloperMode && dashboardData !== null ? devDashboardSection(dashboardData) : null}
{settings.isDeveloperMode && logViewerOpen ? devLogViewerSection() : null}
```

With:

```tsx
{settings.isDeveloperMode ? (
  <section className="panel dev-panel-link" aria-label="Developer tools">
    <button
      type="button"
      className="btn"
      style={{ width: '100%' }}
      onClick={(): void => {
        // Open the Chrome side panel
        void sendToBackground({ type: 'OPEN_DEBUG_PANEL', source: 'popup' });
      }}
    >
      🔧 Open debug panel
    </button>
  </section>
) : null}
```

The `devDashboardSection()` and `devLogViewerSection()` functions (lines 213-393) can be removed from App.tsx. The dashboard and log viewer components will be reused by the side panel entry point (not deleted from the codebase, just moved out of the popup rendering path).

### 8. Remove unused state variables

After the above changes, these state variables are no longer used in the popup and should be removed:

```typescript
// DELETE:
const [diagOpen, setDiagOpen] = useState<boolean>(false);
const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
const [allLogs, setAllLogs] = useState<readonly LogViewerEntry[]>([]);
const [logViewerOpen, setLogViewerOpen] = useState<boolean>(false);
const [logFilter, setLogFilter] = useState<LogFilter>('all');
const [logSearch, setLogSearch] = useState<string>('');
```

The `useEffect` that polls `GET_DEBUG_STATE` every 2 seconds (lines 130-155) should also be removed from the popup — the debug panel polls from its own side panel context.

### 9. Clean up unused imports

Remove imports that are no longer used after the above changes:

```typescript
// Remove or verify:
import { buildDashboardData, type DashboardData } from '@/entrypoints/popup/llm-dashboard';
import { filterLogEntries, formatTimestamp, type LogFilter, type LogViewerEntry } from '@/entrypoints/popup/log-viewer';
```

These modules stay in the codebase (they'll be used by the debug panel side panel entry point) but are no longer imported by `App.tsx`.

## Files Changed vs Not Changed

| File | Changed? | What |
|------|----------|------|
| `src/entrypoints/popup/App.tsx` | Modified | All 9 changes above |
| `src/entrypoints/popup/style.css` | Modified | Remove pause button styles, add collapsed settings styles, remove inline dashboard styles from popup |
| `src/entrypoints/popup/enhanced-analysis.ts` | Modified | Simplify or merge with inline `aiAnalysisContent()` |
| `src/entrypoints/popup/llm-dashboard.ts` | Not touched | Reused by debug panel |
| `src/entrypoints/popup/log-viewer.ts` | Not touched | Reused by debug panel |
| `src/shared/*` | Not touched | |
| `src/overlay/*` | Not touched | |
| `src/scoring-coordinator/*` | Not touched | |
| `src/gemini/*` | Not touched | |
| `src/tmr/*` | Not touched | |

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Removing Diagnostics hides useful info from power users | Low | Diagnostics are available in the debug panel. Developer mode is one long-press away. |
| Long-press on brand name is undiscoverable | Intentional | Developer mode should be hidden from casual users. Developers will be told about it in onboarding docs. |
| Removing "Off" from dropdown confuses users who used it | Low | The toggle is more visible and intuitive. The dropdown still allows per-type filtering. |
| Merged AI Analysis section hides model-specific errors | Low | If TMR errors, the combined status shows "temporarily unavailable." Per-model detail is in the debug panel. |
