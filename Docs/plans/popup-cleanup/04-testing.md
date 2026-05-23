# 04 -- Popup Cleanup: Testing

**Status:** Draft
**Depends on:** 02-implementation
**Blocks:** None

## Unit Tests

### AI Analysis merged status

```typescript
describe('aiAnalysisContent', () => {
  it('shows "Active — running locally" when both TMR and Gemini are ready');
  it('shows "Active" with "Enable enhanced explanations" link when TMR ready but Gemini downloadable');
  it('shows "Setting up AI analysis..." when TMR is loading');
  it('shows error message with "Try again" when TMR has error');
  it('shows "Active — running locally" when Gemini available but no TMR');
  it('shows onboarding flow when Gemini downloadable and no TMR');
  it('shows "Pattern-based analysis active" when neither model is available');
});
```

### Long-press developer mode toggle

```typescript
describe('developer mode long-press', () => {
  it('enables developer mode after 500ms press on brand name');
  it('does not enable on short tap (<500ms)');
  it('cancels if pointer leaves the element before 500ms');
  it('disables developer mode on second long-press');
  it('shows "Open debug panel" button when developer mode is on');
  it('hides "Open debug panel" button when developer mode is off');
});
```

## Regression Tests

These must pass unchanged:

| Test | Why |
|------|-----|
| Existing popup state handling tests (not on LinkedIn, paused, reconnecting) | State handling logic is unchanged |
| Existing settings update tests | Settings messaging is unchanged |
| Existing Gemini download flow tests | Gemini download still works, just displayed differently |

## Manual Test Script

1. Build and load extension
2. Open popup on LinkedIn
3. Verify: only 4 sections visible (brand+summary, collapsed settings, AI Analysis, collapsed Data & privacy)
4. Verify: no "Pause HumanSignal" button anywhere
5. Expand Settings — verify "Show stickers on" has All / Posts / Comments (no Off)
6. Toggle off via header toggle — verify popup shows paused state
7. Toggle on — verify popup returns to summary view
8. Check AI Analysis section — verify single combined status, not two separate model sections
9. Expand Data & privacy — verify no Diagnostics sub-section, no developer mode toggle
10. Long-press brand name for 500ms — verify toast "Developer mode enabled"
11. Verify: "Open debug panel" button appears
12. Click "Open debug panel" — verify Chrome side panel opens
13. Long-press brand name again — verify toast "Developer mode disabled"
14. Verify: "Open debug panel" button disappears
15. Short-tap brand name — verify nothing happens (no accidental toggle)

## Edge Cases

| Scenario | Expected |
|----------|----------|
| Popup opened while TMR is downloading | AI Analysis shows "Setting up..." with progress |
| Popup opened with developer mode on but side panel closed | "Open debug panel" button visible, clicking opens panel |
| Popup opened when both models errored | AI Analysis shows error state with "Try again" |
| User clicks "Delete all data" | Confirmation prompt shown. After delete, popup resets to defaults. Developer mode is also cleared. |
| User resizes popup (Chrome allows vertical resize) | Collapsed sections should not expand. Layout should not break. |
