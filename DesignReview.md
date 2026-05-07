# Design Review: Execution Plans (00-08)

Reviewer perspective: Principal Software Engineer
Scope: Architecture document (revised) and all execution plans in `/Plan/`

---

## Overall Assessment

The execution plans are notably well-structured. Each plan has a clear purpose, dependency declaration, task breakdown, typed interfaces, verification checklist, and duration estimate. The sequence document (00) provides a coherent dependency graph with integration gates between phases. The architecture document has been substantially improved since the initial review — it now includes a messaging architecture, failure mode table, concurrency model, cache versioning, testing strategy, scope constraints, and filter mode deferral.

The plans are ready for implementation with the issues noted below. Most are clarifications or edge cases rather than structural problems.

---

## Architecture Document (Revised): Issues Resolved

The revised architecture addresses the critical gaps from the prior review:

- **Messaging architecture** is now specified (Section 6) with context responsibilities, protocol, and service worker lifecycle handling.
- **Score reconciliation** is eliminated by the "one active scorer" decision — rules until Gemini is ready, then Gemini only. This is a clean simplification.
- **Filter mode** is explicitly deferred to post-MVP (Section 10), removing the DOM mutation contradiction.
- **Failure modes** are documented in a table (Section 12) with detection, recovery, and user impact.
- **Concurrency and scheduling** is addressed (Section 11) with priority queue, viewport-based cancellation, and rapid scroll handling.
- **Cache versioning** is specified (Section 9) with `scoringVersion` invalidation.
- **Testing strategy** is now continuous from Phase 1 (Section 15) rather than deferred.
- **Scope constraints** (Section 16) explicitly state English-only, desktop Chrome only, and accessibility baseline.
- **Confidence vs dimensions inconsistency** is justified — categorical confidence is user-facing, numeric dimensions are internal.

These were the right calls. The architecture is significantly stronger.

---

## Sequence Document (00-sequence.md)

**Strengths:**
- Clean dependency graph with no circular dependencies.
- Integration gates between phases are specific and verifiable.
- Filter mode explicitly removed from MVP with rationale.
- Parallel execution summary gives realistic timeline visibility.

**Issues:**

1. **Gate 2 is too loose.** "Gemini session creates successfully in offscreen document" is a binary check. The gate should also verify that a structured JSON prompt returns a parseable result — this is the blocking open question from the architecture doc and should be validated at the earliest possible gate.

2. **Plan 06 depends on Plan 05 but not Plan 07.** The popup's diagnostics section (Plan 06, Task 4) displays health data from the scoring coordinator (Plan 07). If 06 is built before 07 is complete, the diagnostics section will have no data source. Either add a dependency from 06 to 07 for the diagnostics section, or stub the `GET_HEALTH` message in Plan 01 and note that diagnostics are populated only after Plan 07 lands.

3. **No integration gate between Phase 1 and Phase 2 for the adapter-overlay contract.** Plan 02 defines `DetectedPost.element` as the tracking reference. Plan 05 consumes it for `getBoundingClientRect`. If the adapter returns the wrong level of nesting (too deep or too shallow), sticker positioning will be wrong. Gate 2 should include: "Overlay can position a test element over the adapter's returned `element` reference at the correct visual location."

---

## Plan 01: Extension Shell

**Strengths:**
- Comprehensive messaging type definition.
- Clear directory structure.
- Verification checklist covers all message roundtrips.

**Issues:**

4. **Missing `sidePanel` permission in manifest.** The architecture lists side panel as a future/fallback option. If the offscreen document fails to host Prompt API sessions (blocking open question 1), the fallback is a side panel. Adding the `sidePanel` permission now costs nothing and avoids a manifest change later that would trigger a Chrome Web Store re-review. At minimum, note this as a known future addition.

5. **`@crxjs/vite-plugin` viability.** The plan says "with `@crxjs/vite-plugin` or manual MV3 config" but doesn't commit. `@crxjs/vite-plugin` has had maintenance gaps and compatibility issues with newer Vite versions. The plan should specify a decision criterion: if the plugin works with the current Vite version, use it; otherwise, use manual multi-entry Vite config. Don't discover this during implementation.

6. **No `PRIORITY_UPDATE` message type.** The scoring coordinator (Plan 07, Task 4) requires content scripts to send priority updates when items enter/leave viewport. This message type is missing from the messaging contract in Plan 01. Add:
   ```
   | { type: 'PRIORITY_UPDATE'; updates: PriorityUpdate[] }
   ```

7. **No `GET_HEALTH` message type.** The popup diagnostics (Plan 06, Task 4) fetches health data via a `GET_HEALTH` message. This is also missing from Plan 01's messaging contract.

8. **No `CHECK_GEMINI_STATUS` or `TRIGGER_DOWNLOAD` message type.** Plan 04 (Tasks 1 and 2) defines these as message handlers in the offscreen document, but they are not in the Plan 01 messaging contract. The messaging contract should be the single source of truth for all message types.

---

## Plan 02: LinkedIn DOM Adapter

**Strengths:**
- Explicit acknowledgment of brittleness with isolation strategy.
- HTML fixture test suite from day one is the right call.
- `isAdapterHealthy()` health check enables the failure mode table's "3+ consecutive zero-match" detection.
- Element recycling detection is thoughtfully included.

**Issues:**

9. **`postId` stability is underspecified.** The plan says "stable identifier derived from DOM/URL context (data attributes, link hrefs, or content hash fallback)." This needs more specificity. If the `postId` is a content hash fallback, it will change when LinkedIn truncates the post text with "see more." If it's derived from a `data-urn` attribute, it's stable but may not exist on all post types. The plan should define a priority chain: (1) `data-urn` or activity URN from link href, (2) permalink URL hash, (3) content hash as last resort, with a flag indicating which method was used so downstream consumers know the stability level.

10. **No mention of LinkedIn's "see more" truncation.** When a post is truncated, the adapter will extract only the visible portion. If the user later clicks "see more" and the full text is revealed, the content hash changes, and the item gets re-scored with a potentially different label. The plan should specify: (a) detect whether a post is truncated (presence of "see more" button), (b) flag this on the `DetectedPost`, and (c) decide whether to score truncated text or skip until expanded. Scoring truncated text risks label instability; skipping risks never scoring posts the user doesn't expand.

11. **Fixture anonymization may break selectors.** "Anonymize fixtures (replace names, profile URLs)" — if the anonymization changes element structure or removes attributes, it could cause test/production divergence. Anonymize text content but preserve DOM structure and attributes exactly.

12. **No strategy for LinkedIn A/B tests.** Architecture open question 6 asks about this but the adapter plan doesn't address it. LinkedIn frequently runs A/B tests with different DOM structures for the same page type. The adapter should include: (a) multiple selector strategies per element type, tried in priority order, and (b) logging which strategy succeeded so the team can detect when LinkedIn rolls out a new variant.

---

## Plan 03: Rules Engine

**Strengths:**
- Clean separation of feature extraction, classification, and explanation generation.
- Golden set with 80% agreement threshold is a reasonable starting bar.
- `scoringVersion` constant for cache invalidation is included.
- Conservative scoring philosophy is explicit.

**Issues:**

13. **Critical architecture contradiction.** The architecture document states: "The rules engine is active only when Gemini is unavailable. Once Gemini is downloaded, the rules engine is never invoked." The Plan 03 Architecture Context section repeats this. However, the Gemini repair strategy (Plan 04, Task 6) says on second failure: "Return `null` to the scoring coordinator, which keeps the item in 'unavailable' sticker state." If Gemini fails for an item, the fallback should be a rules-based score, not "unavailable." The architecture should clarify: when in Gemini mode, if Gemini fails for a specific item, does the coordinator fall back to rules for that item, or does it show "unavailable"? Showing "unavailable" is a worse user experience than showing a rules-based score. Recommend: per-item fallback to rules when Gemini fails, even in Gemini mode. Update Plan 03, Plan 04, and Plan 07 to reflect this.

14. **Classification thresholds are specified but not justified.** Rule 1: `engagementBaitScore > 0.7` — where does 0.7 come from? Rule 3: `genericPhraseRatio > 0.5` — why 0.5? These are fine as starting points (the plan says so), but the plan should specify: tune against the golden set before locking, and include threshold values in a configuration object (not hardcoded in the classify function) so they can be adjusted without changing classification logic.

15. **`namedEntityCount` extraction is non-trivial.** The feature extractor lists `namedEntityCount` but doesn't specify how named entities are detected without NLP. Simple regex for capitalized multi-word sequences will produce false positives (sentence starts, acronyms). The plan should specify the detection approach: regex for patterns like "at [Capitalized Word]", "CEO of [Company]", or known title/role patterns. Accept that this will be imprecise and document the known false-positive categories.

16. **Comment `Repeated` label has no detection mechanism.** The label taxonomy includes "Repeated" for comments, but the classification rules in Task 3 don't include a rule for it. Detecting repeated comments requires comparing against other comments by the same author, which the adapter doesn't track (no author extraction). Either remove `Repeated` from the rules engine labels (Gemini can handle it) or add author extraction to Plan 02 and a similarity check to Plan 03.

17. **Golden set of 100+ items needs a creation strategy.** The plan says to create items but doesn't say where they come from. Options: manually curated from real LinkedIn content (best quality, slow), synthetically generated with known properties (fast, risks training to synthetic patterns), or a mix. Specify the approach and ensure the golden set includes the hard cases that matter (borderline mixed-signal posts, short ambiguous comments, posts with URLs/images but little text).

---

## Plan 04: Gemini Integration

**Strengths:**
- Offscreen document hosting rationale is clear.
- Repair strategy with circuit-breaker (3 consecutive failures) is well-designed.
- Session idle timeout (60 seconds) prevents resource waste.
- Storage requirements communication is included.
- Golden set prompt evaluation with offline runner is the right approach.

**Issues:**

18. **Prompt includes the JSON schema inline as a string, not via `responseConstraint`.** The plan defines both approaches (inline prompt schema + `responseConstraint`) but doesn't specify which is primary. If `responseConstraint` works, the inline schema in the prompt is redundant and wastes tokens. If `responseConstraint` doesn't work (or Gemini Nano doesn't support it), the inline schema is necessary. The plan should specify: try `responseConstraint` first. If the invalid JSON rate on the golden set exceeds 10%, fall back to inline schema prompting. Document the result of this evaluation.

19. **`triggerModelDownload` says "requires user gesture forwarded from UI" but doesn't explain the forwarding mechanism.** Chrome requires a user gesture for certain APIs. A click in the popup generates a user gesture in the popup context, but that gesture is not automatically forwarded to the offscreen document. The plan should clarify whether `LanguageModel.create()` actually requires a user gesture in the offscreen document, or whether it only requires that the extension initiated the call in response to a user action. If a gesture is truly required in the offscreen document context, this is a significant blocker.

20. **Storage requirements messaging is inconsistent.** Plan 04, Task 10 says "approximately 2GB of free space." The architecture says "22GB+ free space" in the Prompt API constraints (referring to total free space on the Chrome profile volume). The user-facing message in Task 10 is the right one to show users (Chrome manages the actual download), but the plan should note the discrepancy and clarify: the 2GB is the model size, the 22GB is Chrome's total free space requirement for the profile volume. Show users the 2GB message; Chrome handles the rest.

21. **No token/length limit handling.** What happens when a LinkedIn post exceeds Gemini Nano's context window? Long posts (2000+ words) may exceed the model's input capacity. The plan should specify: (a) measure the max input length Gemini Nano accepts, (b) truncate posts that exceed it (with a flag on the result indicating truncation), (c) decide whether truncated posts should fall back to rules instead.

22. **70% golden set agreement target is low.** The rules engine targets 80%, but Gemini targets 70%. Gemini should be at least as accurate as rules (ideally better, since it's presented as an upgrade). If Gemini can't beat rules on the golden set, the product should stay in rules mode. Recommend: Gemini golden set agreement target should be >= rules engine agreement (80%+).

---

## Plan 05: Overlay UI

**Strengths:**
- Read/write phase separation is explicit in the position sync implementation.
- IntersectionObserver with 200px root margin for pre-loading is a nice UX touch.
- Item registry with max 50 entries and LRU eviction is well-bounded.
- Accessibility is included from the start (ARIA, keyboard focus, focus trap).
- Plain DOM (not Preact) for stickers is the right choice for content script overlay.
- Inline explanation popover with viewport-aware positioning is well-specified.

**Issues:**

23. **`z-index: 2147483647` (max safe) may conflict with LinkedIn's own high z-index elements.** LinkedIn uses high z-index values for its messaging overlay, notification dropdowns, and modal dialogs. Using the absolute maximum means the extension's overlay will always be on top of LinkedIn modals. This is fine for stickers (they should be visible) but problematic for the popover — if a user opens a LinkedIn modal while a popover is open, the popover will float above the modal. The plan should specify: close the popover when LinkedIn opens a modal (detectable via MutationObserver on body class changes or new high-z-index elements).

24. **Sticker position "top-right corner of the post/comment container" may cover LinkedIn's post menu.** LinkedIn's three-dot menu is in the top-right corner of posts. The plan says "offset inward to avoid covering LinkedIn controls" but doesn't specify the offset value or how to detect the menu's position. The plan should define a concrete offset (e.g., 48px from the right edge, or position relative to the author name area instead of the container corner) and verify against the HTML fixtures.

25. **No handling of overlapping stickers.** If a comment thread has many short comments, stickers could overlap each other vertically. The plan should specify: (a) detect overlap between stickers in the write phase, (b) offset overlapping stickers, or (c) collapse adjacent stickers into a summary indicator.

26. **150ms debounce on MutationObserver may cause visible delay.** When a user scrolls slowly and one new post appears, the sticker won't appear for 150ms. This is perceptible. Consider: use 150ms debounce only when multiple mutations fire in rapid succession (batch size > 3), but process single new items immediately.

27. **ResizeObserver is listed in Plan 05's Architecture Context (Section 7.3 of the architecture) but not implemented in any task.** The observer layer mentions ResizeObserver for layout changes affecting sticker positions, but Plan 05's tasks only implement IntersectionObserver and MutationObserver. If LinkedIn posts resize (e.g., image lazy-load, "see more" expansion), sticker positions will be wrong until the next scroll triggers a rAF update. Either add a ResizeObserver task or document that rAF-based repositioning handles this case adequately.

---

## Plan 06: Popup and Popover

**Strengths:**
- Popup wireframes are concrete and implementable.
- All five Gemini status states have UI mockups.
- Download progress persistence to storage (for popup close/reopen) is a good detail.
- Dark mode support included.
- Feedback flow is fully specified with local-only storage.

**Issues:**

28. **Popover is in Plan 06 but its shell is built in Plan 05.** This split is documented but creates an awkward boundary. Plan 05 builds `ExplanationPopover` with `open()`, `close()`, `updateScore()`. Plan 06 builds the content rendering inside it. If the interface between them isn't locked down, one plan may deliver something the other can't consume. Recommendation: Plan 05 should define the exact data interface the popover shell expects (i.e., the `ScoringResult` shape plus feedback callback signature). Plan 06 should only concern itself with rendering and behavior within that interface.

29. **Popup height "~500px max" may be too small for all sections.** Settings + Model Status + Data/Diagnostics is a lot of content. If the model is downloading (progress bar + status text) and the diagnostics section is expanded, 500px may overflow. The plan says "works at various heights without overflow issues" in verification but doesn't specify the scroll/overflow strategy. Specify: the popup body should be scrollable, with sticky section headers if needed.

30. **"Enable On-Device AI" button requires careful user gesture handling.** This ties to issue 19 from Plan 04. The popup click is a valid user gesture in the popup context. The plan should verify that this gesture is sufficient for the `LanguageModel.create()` call in the offscreen document, or document the workaround.

31. **No empty state for diagnostics.** On first install before any scoring has occurred, the diagnostics section will show zeros or undefined values. The plan should specify an initial state: "No scoring data yet. Browse LinkedIn to start."

---

## Plan 07: Scoring Coordinator

**Strengths:**
- Mode manager with one-way switch is clean.
- Cache with version-aware lookup and TTL is well-designed.
- Priority queue with viewport-based scheduling matches the architecture's concurrency model.
- Deduplication via in-flight promise map is correct.
- Service worker recovery strategy is explicit.
- `QuotaExceededError` handling with 25% eviction and retry is robust.
- Health metrics for popup diagnostics are included.

**Issues:**

32. **`handleScoreBatch` in rules mode is synchronous but uses `await cache.get()`.** IndexedDB operations are async. In rules mode, the handler awaits the cache check, then runs the synchronous rules engine if there's a miss. This means even rules mode has async latency from the cache lookup. For rules mode, consider an in-memory LRU cache in front of IndexedDB to make the hot path fully synchronous. Cache misses fall through to IndexedDB then rules engine.

33. **Score request handler returns a `pendingResult` placeholder for Gemini mode, but this shape isn't defined.** What does `pendingResult(item)` contain? It should be a `ScoringResult` with a special `state: 'loading'` or similar field. But `ScoringResult` in the shared types doesn't have a `state` field — the sticker's state (`loading`, `labeled`, etc.) is tracked in the item registry, not the scoring result. The plan should clarify: does `handleScoreBatch` return a loading indicator, or does it return nothing for queued items and the content script infers loading state from the absence of a result?

34. **Queue is not persisted but service worker recovery relies on content script re-sending.** This is correct in principle, but the plan should address the timing: when the service worker wakes, how does it signal content scripts to re-send? Does the content script poll, or does the service worker broadcast a "I'm alive" message? Plan 01's messaging layer doesn't include a reconnection protocol.

35. **`hashText` normalization may be too aggressive.** Lowercasing and collapsing whitespace means "I built THIS at Google" and "i built this at google" hash to the same value. This is probably fine for deduplication but could cause issues if LinkedIn renders the same post with different formatting on different pages (feed vs detail). Acceptable for MVP, but note as a known trade-off.

36. **No rate limiting on content script score requests.** A misbehaving content script (or one on a page with hundreds of comments) could flood the service worker with score requests. The scoring coordinator should enforce a per-tab rate limit (e.g., max 30 items per 10 seconds per tab) to prevent resource exhaustion.

---

## Plan 08: Testing and QA

**Strengths:**
- Playwright setup with extension loading is correct.
- Local test server serving HTML fixtures is the right approach (avoids testing against live LinkedIn).
- Failure mode tests map directly to the architecture's failure mode table.
- Performance benchmarks have specific targets.
- Accessibility audit is thorough.
- Privacy disclosure content is comprehensive.
- Release checklist is specific and actionable.

**Issues:**

37. **Core flow tests assume rules mode only.** "Scores arrive and stickers update to labeled state" — in Gemini mode, there's an intermediate loading state. The test suite should have parallel test configurations: one for rules-only mode and one for Gemini mode (with a mock offscreen document). The plan mentions mocking for CI but doesn't specify separate test suites.

38. **No test for the mode transition scenario.** The architecture specifies that when Gemini becomes available mid-session, new items use Gemini while existing stickers keep their rules-based labels. This transition is a critical user experience moment and should have a dedicated integration test: (a) load page in rules mode, (b) verify rules stickers, (c) simulate Gemini becoming available, (d) scroll to reveal new items, (e) verify new items get Gemini stickers while old items retain rules stickers.

39. **Performance benchmark of "< 500ms page load to first sticker" conflates extension overhead with LinkedIn's own load time.** The benchmark should measure: time from content script injection to first sticker visible (extension-only latency), not time from page load. Specify the measurement start point.

40. **No test for extension update path.** The architecture's open question 8 asks about handling extension updates without losing settings or cached data. The test plan should include: (a) install extension, (b) configure settings and populate cache, (c) update to new version, (d) verify settings persist and cache handles `scoringVersion` change correctly.

41. **No visual regression testing.** Sticker appearance, popover layout, and popup design could break silently. Consider adding screenshot comparison tests for sticker states and popover content against known-good baselines.

42. **Chrome Web Store preparation (Task 9) should include a permissions justification document.** Chrome Web Store review often asks why each permission is needed. Prepare a brief justification: `storage` (settings and cache), `offscreen` (Gemini Nano hosting), `activeTab` (content script access), `host_permissions` on linkedin.com (DOM reading for content analysis).

---

## Cross-Cutting Issues

### A. Memory Budget is Still Missing

No plan specifies a memory budget. The overlay (50 tracked items), item registry, in-memory scoring state, and Gemini session all consume memory. The content script shares a process with LinkedIn's own JavaScript. A content script that uses 50-100MB could noticeably degrade LinkedIn's performance on memory-constrained devices. Recommend: add a memory target to Plan 08's performance benchmarks (e.g., "content script heap < 30MB, total extension memory < 50MB excluding Gemini model").

### B. Error Boundaries Between Modules

No plan specifies how errors in one module are isolated from others. If the DOM adapter throws an unexpected error, does it crash the content script (and thus the overlay)? If the scoring coordinator throws, does it crash the service worker? Each module boundary should have a try/catch at the public API level. This should be a cross-cutting requirement in Plan 01 or a coding standard.

### C. Logging Strategy

Plans mention "log locally" and "track failure counts" but there's no unified logging strategy. Define: (a) log levels (error, warn, info, debug), (b) where logs are stored (in-memory ring buffer? IndexedDB?), (c) log retention (how much, for how long), (d) whether logs are visible in the popup diagnostics, and (e) whether logs include any content from LinkedIn (they shouldn't). This could be a small task added to Plan 01.

### D. Content Security Policy Compatibility

Plan 08 mentions "Content script injection blocked by LinkedIn CSP changes" in failure modes, but no plan addresses how the extension's own CSS injection (the `<style>` element in the overlay root, Plan 05 Task 3) interacts with LinkedIn's CSP. Chrome extensions have some CSP exemptions for content scripts, but injecting style elements can sometimes conflict. Verify that scoped style injection works under LinkedIn's current CSP.

### E. Extension Uninstall Cleanup

Plan 08's release checklist includes "can be cleanly uninstalled (no orphan storage)" but no plan specifies what happens on uninstall. `chrome.runtime.onInstalled` with `reason: 'uninstall'` doesn't exist — Chrome doesn't fire an event for uninstall. IndexedDB databases created by the extension persist after uninstall. Document this limitation and decide whether it matters.

---

## Summary of Required Changes

### Must Fix Before Implementation

| # | Plan | Issue |
|---|------|-------|
| 6 | 01 | Add `PRIORITY_UPDATE`, `GET_HEALTH`, `CHECK_GEMINI_STATUS`, `TRIGGER_DOWNLOAD` to messaging contract |
| 8 | 01 | Messaging contract should be single source of truth for all message types |
| 13 | 03/04/07 | Clarify per-item fallback to rules when Gemini fails in Gemini mode |
| 19 | 04 | Clarify user gesture forwarding to offscreen document |
| 33 | 07 | Define `pendingResult` shape or clarify how content script handles queued items |

### Should Fix Before Implementation

| # | Plan | Issue |
|---|------|-------|
| 1 | 00 | Strengthen Gate 2 to include Gemini JSON validation |
| 2 | 00 | Add dependency from 06 diagnostics to 07, or stub `GET_HEALTH` |
| 9 | 02 | Define `postId` priority chain with stability indicator |
| 10 | 02 | Handle "see more" truncation detection |
| 14 | 03 | Make classification thresholds configurable |
| 16 | 03 | Remove `Repeated` from rules labels or add detection mechanism |
| 21 | 04 | Add token/length limit handling for long posts |
| 22 | 04 | Raise Gemini golden set agreement target to >= 80% |
| 24 | 05 | Define concrete sticker offset to avoid covering LinkedIn post menu |
| 34 | 07 | Define reconnection protocol between service worker and content scripts |
| A | All | Add memory budget to performance benchmarks |
| B | 01 | Add error boundary requirement at module API boundaries |

### Nice to Have

| # | Plan | Issue |
|---|------|-------|
| 3 | 00 | Add adapter-overlay positioning check to Gate 2 |
| 4 | 01 | Add `sidePanel` permission preemptively |
| 5 | 01 | Commit to Vite plugin decision before implementation starts |
| 11 | 02 | Preserve DOM structure during fixture anonymization |
| 12 | 02 | Add multi-strategy selectors for LinkedIn A/B tests |
| 15 | 03 | Document named entity detection approach and known limitations |
| 17 | 03 | Specify golden set creation strategy |
| 18 | 04 | Specify `responseConstraint` vs inline schema evaluation criterion |
| 20 | 04 | Clarify storage requirements messaging discrepancy |
| 23 | 05 | Handle LinkedIn modals overlapping with popover |
| 25 | 05 | Address overlapping stickers in dense comment threads |
| 26 | 05 | Reduce debounce for single new items |
| 27 | 05 | Add ResizeObserver task or document rAF coverage |
| 28 | 06 | Lock down popover data interface between Plan 05 and Plan 06 |
| 29 | 06 | Specify popup scroll/overflow strategy |
| 31 | 06 | Define diagnostics empty state |
| 32 | 07 | Consider in-memory LRU cache for rules mode hot path |
| 36 | 07 | Add per-tab rate limiting on score requests |
| 37 | 08 | Create separate test configurations for rules and Gemini modes |
| 38 | 08 | Add mode transition integration test |
| 39 | 08 | Clarify performance benchmark measurement start point |
| 40 | 08 | Add extension update path test |
| 41 | 08 | Consider visual regression testing |
| 42 | 08 | Prepare permissions justification document |
| C | 01 | Define unified logging strategy |
| D | 05/08 | Verify style injection under LinkedIn CSP |
| E | 08 | Document IndexedDB persistence after uninstall |

---

## Duration Assessment

The plans estimate 3-7 days each, totaling roughly 6-9 weeks for a single developer. This is plausible for the scope described, assuming:

- LinkedIn DOM research (Plan 02) goes smoothly. If LinkedIn's DOM is more complex than expected, Plan 02 could easily double.
- Gemini Nano prompt iteration (Plan 04) stays within bounds. Prompt engineering against a small model with structured output constraints can be unpredictable.
- The two blocking open questions (offscreen document Prompt API hosting, Gemini JSON reliability) are answered favorably. If either fails, the fallback paths add 1-2 weeks.

The critical path is: 01 → (02 + 04 in parallel) → 05 → 06. Plan 04 is the highest-variance item on the critical path.

---

## Recommendation

The plans are well-structured and implementation-ready with the fixes noted above. The "must fix" items (messaging contract completeness, Gemini fallback policy, pending result shape, user gesture forwarding) should be resolved in a single revision pass before any coding agent begins work. The "should fix" items can be resolved during implementation without rework risk, but addressing them upfront will save debugging time.

The architecture's decision to use a single active scorer (rules OR Gemini, never both) was a strong simplification that eliminated an entire class of reconciliation bugs. The filter mode deferral was the right call. The inline popover replacing the side panel for MVP reduces the extension's surface area and avoids the side panel's UX awkwardness for quick explanations.

Start with Plan 01. Prototype the Gemini offscreen document hosting (blocking question 1) as early as possible within Plan 01/04 overlap — don't wait until Plan 04 formally begins.
