# Telemetry & Debugging Instrumentation Scope

Date: 2026-05-08

## Purpose

Wire up the existing but disconnected `EventTraceStore` and add missing timing, counters, and state-transition tracking across the extension. This powers the Developer Mode debug pills, LLM dashboard, and log viewer documented in `Scoping/UX/Developer-Mode.md`.

---

## Current State

| System | Status |
|--------|--------|
| Logger (200-entry ring buffer) | Working. ~50 call sites. No per-item timing. |
| ScoringTelemetry (per-item timestamps) | Working but only called from ScoringCoordinator. Missing content-script-side events. |
| EventTraceStore (18 event types) | Dead code. Defined in `shared/event-trace.ts` but never instantiated or called. |
| HealthMetrics (5 counters) | Working. Exposed via `GET_HEALTH`. Missing breakdowns and percentiles. |

---

## Tier 1: Wire the EventTraceStore

**Goal:** Every item gets a full lifecycle trace from DOM discovery to final label. Powers the debug pill and debug popover in Developer Mode.

### Work Items

#### 1.1 Instantiate EventTraceStore

- Create a singleton `EventTraceStore` instance in the `ScoringCoordinator`.
- Pass a reference (or message relay) to `OverlayController` so content-script-side events can be recorded.
- Max 200 item traces (FIFO eviction, matching the existing store design).

#### 1.2 OverlayController events (content script side, ~7 call sites)

| Event | Where to add | What to record |
|-------|-------------|----------------|
| `DISCOVERED` | `discoverAndScore()` after `detectPosts()` / `detectComments()` returns | Item type, element tag |
| `EXTRACTED` | `addPost()` / `addComment()` after `ExtractedItem` is created | Text length, content hash, truncation status |
| `STICKER_SHOWN` | `addRegistryEntry()` after sticker is appended to overlay root | Initial label ("Scoring..."), source ("pending") |
| `STICKER_UPGRADED` | `handleScoreResults()` when label changes from rules baseline | Old label → new label, old source → new source |
| `STICKER_UNCHANGED` | `handleScoreResults()` when AI returns same label as rules | Label, confirmed by AI |
| `CANCELLED` | `removeDetachedEntries()` when element is no longer in DOM | Reason: "detached" |
| `ERROR` | `handleScoreFailure()` | Error code, item count |

#### 1.3 ScoringCoordinator events (background side, ~10 call sites)

| Event | Where to add | What to record |
|-------|-------------|----------------|
| `CACHE_HIT` | `getCachedResult()` when result is found | Scoring version, cached source |
| `CACHE_MISS` | `getCachedResult()` when result is null | Expected version |
| `RULES_STARTED` | `handleScoreBatch()` before `scoreWithRules()` | — |
| `RULES_COMPLETED` | `handleScoreBatch()` after `scoreWithRules()` returns | Latency ms, label, confidence |
| `AI_QUEUED` | `handleScoreBatch()` when item is enqueued | Priority, queue depth |
| `AI_STARTED` | `processQueue()` before `scoreGeminiWithFallback()` | Session state (created/reused) |
| `AI_COMPLETED` | `runGeminiRequest()` on valid Gemini result | Latency ms, label, confidence |
| `AI_FAILED` | `runGeminiRequest()` when Gemini returns null or errors | Error message, will fallback to rules |
| `AI_RETRY` | `scoreWithGemini()` in GeminiService when repair prompt is sent | Attempt number |
| `AI_SKIPPED` | `handleScoreBatch()` when mode is rules and item won't be sent to AI | Reason: "rules-only-mode" / "paused" / "unavailable" |

#### 1.4 Expose traces via messaging

- Add `GET_ITEM_TRACE` message type: given an `itemId`, returns the full event trace as JSON.
- Add `GET_ALL_TRACES` message type: returns summary of all active traces (for the LLM dashboard recent events).
- The debug pill reads from these when clicked.

#### 1.5 Architecture decision: where the store lives

The store should live in the **background service worker** (ScoringCoordinator owns it). Content-script-side events (`DISCOVERED`, `EXTRACTED`, `STICKER_SHOWN`, `STICKER_UPGRADED`, `STICKER_UNCHANGED`, `CANCELLED`) are relayed to background via a lightweight `TRACE_EVENT` message.

Why background, not content script:
- Scoring, cache, and Gemini events already happen in background.
- A single store avoids merge complexity.
- Content-script events are few and small — messaging overhead is negligible.
- The store is already designed for background-side access via `GET_HEALTH` / `GET_TELEMETRY`.

---

## Tier 2: Add Missing Timing

**Goal:** Populate the latency breakdown in the debug popover and LLM dashboard with real measurements.

### Work Items

#### 2.1 Rules engine per-item timing

| Where | What to add |
|-------|------------|
| `ScoringCoordinator.handleScoreBatch()` | Record `Date.now()` before and after `scoreWithRules()`. Attach `rulesLatencyMs` to the trace event. |

Expected: <5ms per item. This confirms the rules engine stays fast.

#### 2.2 Gemini queue wait time

| Where | What to add |
|-------|------------|
| `ScoringQueue.enqueue()` | Already stores `addedAt` timestamp. |
| `ScoringCoordinator.processQueue()` | At dequeue, compute `queueWaitMs = Date.now() - queueItem.addedAt`. Attach to `AI_STARTED` trace event. |

Expected: variable. Long queue waits indicate throughput bottleneck.

#### 2.3 Gemini inference time (separated from queue wait)

| Where | What to add |
|-------|------------|
| `ScoringCoordinator.runGeminiRequest()` | Record `Date.now()` before and after `sendToOffscreen(GEMINI_PROMPT)`. Attach `geminiInferenceMs` to trace event. |

Currently `recordScoringLatency()` measures the entire path including queue wait. This separates the two.

#### 2.4 Gemini session creation latency

| Where | What to add |
|-------|------------|
| `GeminiService.getOrCreateSession()` | Record `Date.now()` before and after `languageModel.create()`. Log as `gemini.sessionCreated` with `latencyMs`. |

Expected: can be several seconds on first creation. Important for understanding first-score delay.

#### 2.5 Discovery scan timing

| Where | What to add |
|-------|------------|
| `OverlayController.discoverAndScore()` | Record `Date.now()` before adapter calls and after item creation. Log as `overlay.discoverTiming` with `scanMs`, `postCount`, `commentCount`. |

Expected: should be <50ms. If it creeps up, LinkedIn DOM may have changed.

#### 2.6 Message round-trip timing

| Where | What to add |
|-------|------------|
| `sendRuntimeMessage()` in `shared/messaging.ts` | Record `Date.now()` before send and after response. Log as `messaging.roundTrip` with `messageType`, `roundTripMs`. Only in debug level. |

Expected: <50ms for most messages. Spikes indicate service worker wake-up delays.

#### 2.7 IndexedDB operation timing

| Where | What to add |
|-------|------------|
| `ScoreCache.safeGetPersistedEntry()` | Time the IDB read. Log as `scoreCache.readLatency` at debug level. |
| `ScoreCache.safePutPersistedEntry()` | Time the IDB write. Log as `scoreCache.writeLatency` at debug level. |

Expected: <10ms reads, <20ms writes. Quota pressure may spike these.

---

## Tier 3: Add Missing Counters

**Goal:** Populate the LLM dashboard with operational metrics beyond the current 5 health counters.

### Work Items

#### 3.1 Extend HealthMetrics interface

Add to `shared/types.ts`:

```typescript
interface HealthMetrics {
  // existing
  itemsScored: number;
  cacheEntries: number;
  cacheHitRate: number;
  avgLatencyMs: number;
  failureCount: number;
  queueDepth: number;
  scoringMode: ScoringMode;
  adapterSuccessRate: number;
  logEntryCount: number;

  // new counters
  rulesOnlyCount: number;
  geminiUpgradeCount: number;
  geminiFailedCount: number;
  cacheEvictionCount: number;
  queueDropCount: number;
  dedupHitCount: number;
  modeSwitchCount: number;
  mutationObserverFireCount: number;
  discoveryCount: number;
  stickerCreatedCount: number;
  stickerDetachedCount: number;

  // new latency
  p95LatencyMs: number;
  rulesAvgLatencyMs: number;
  geminiAvgLatencyMs: number;
  geminiAvgQueueWaitMs: number;

  // new state
  geminiConsecutiveFailures: number;
  geminiPausedUntil: number | null;
  geminiSessionState: 'active' | 'idle' | 'destroyed' | 'none';
  lastModeSwitchAt: number | null;
}
```

#### 3.2 ScoringCoordinator new counters

| Counter | Increment when |
|---------|---------------|
| `rulesOnlyCount` | Rules result returned and item was NOT queued for Gemini |
| `geminiUpgradeCount` | Gemini returned a valid result (regardless of whether label changed) |
| `geminiFailedCount` | Gemini failed and rules fallback was used |
| `dedupHitCount` | `inFlightByHash` found an existing promise |

#### 3.3 ScoreCache new counters

| Counter | Increment when |
|---------|---------------|
| `evictionCount` | Each entry removed in `evictOldest()` or `evictExpired()` |
| `idbErrorCount` | Each caught error in `safeGetPersistedEntry` or `safePutPersistedEntry` |

Expose via a new `getCacheMetrics()` method.

#### 3.4 ScoringQueue new counters

| Counter | Increment when |
|---------|---------------|
| `dropCount` | Each entry removed in `trim()` |
| `peakDepth` | Updated on each `enqueue()` if current depth exceeds previous peak |

Expose via a new `getQueueMetrics()` method.

#### 3.5 ModeManager state tracking

| Field | Updated when |
|-------|-------------|
| `switchCount` | Each time mode changes |
| `lastSwitchAt` | Timestamp of most recent mode change |
| `lastSwitchFrom` | Previous mode before switch |
| `lastSwitchTrigger` | The `GeminiStatus.availability` value that caused the switch |

Log mode transitions at `info` level.

#### 3.6 OverlayController counters

| Counter | Increment when |
|---------|---------------|
| `discoveryCount` | Each `discoverAndScore()` call |
| `stickerCreatedCount` | Each successful `addRegistryEntry()` |
| `stickerDetachedCount` | Each removal in `removeDetachedEntries()` |
| `mutationObserverFireCount` | Each `scheduleDiscovery()` invocation (before debounce) |

Expose via a new `getOverlayMetrics()` method or relay to background.

#### 3.7 Latency percentiles

- Maintain a rolling window of the last 100 scoring latencies in `ScoringCoordinator`.
- Compute p95 from sorted window on each `getHealth()` call.
- Store rules-only and Gemini latencies separately for per-source averages.

---

## Tier 4: Frame Performance (future)

**Goal:** Detect jank caused by the overlay rendering loop. Lower priority — only needed if users report scroll performance issues.

### Work Items

#### 4.1 Position sync frame timing

| Where | What to add |
|-------|------------|
| `PositionSync.syncFrame()` | Record `performance.now()` before and after the frame callback. Track `maxFrameMs`, `avgFrameMs`, `framesAbove2ms`. |

#### 4.2 Anchor search metrics

| Where | What to add |
|-------|------------|
| `PositionSync` anchor resolution | Count `cachedAnchorHits` vs `freshSearches`. Track `anchorSearchFailures`. |

#### 4.3 Expose via HealthMetrics

Add `overlayFrameAvgMs`, `overlayFrameP95Ms`, `overlayFramesAbove2ms` to health metrics.

---

## Delivery Plan

| Tier | Effort | Depends on | Enables |
|------|--------|-----------|---------|
| Tier 1: Wire EventTraceStore | 2-3 days | Nothing | Debug pill, debug popover, per-item trace |
| Tier 2: Missing timing | 1-2 days | Tier 1 (trace events carry timing) | Latency summary in debug popover, latency breakdown in dashboard |
| Tier 3: Missing counters | 1-2 days | Nothing (can parallel with Tier 1) | LLM dashboard metrics, extended health display |
| Tier 4: Frame performance | 1 day | Nothing | Overlay jank detection (defer until needed) |

**Total: 5-8 days for Tiers 1-3. Tier 4 deferred.**

### Suggested order

1. Tier 1 + Tier 2 together (they touch the same call sites — adding a trace event and timing at the same point).
2. Tier 3 (independent counter work, can be a separate PR).
3. Tier 4 (only if performance issues arise).

---

## New Message Types Required

| Message | Direction | Payload |
|---------|-----------|---------|
| `TRACE_EVENT` | content-script → background | `{ itemId, event, timestamp, detail? }` |
| `GET_ITEM_TRACE` | popup → background | Request: `{ itemId }`. Response: full event trace JSON. |
| `GET_ALL_TRACES` | popup → background | Response: summary array of all active traces. |
| `GET_EXTENDED_HEALTH` | popup → background | Response: `HealthMetrics` with all new Tier 3 fields. |

---

## Privacy Constraints

All telemetry added in this scope must follow existing privacy rules:

- No raw LinkedIn text in traces, logs, or metrics.
- Content hashes only (truncated in UI).
- All data is in-memory only, not persisted to disk.
- Event traces are cleared when items leave the registry.
- Log buffer is cleared on service worker restart.
- Exported JSON from Developer Mode contains hashes and metrics, never post/comment text.

---

## Verification

- [ ] EventTraceStore is instantiated and receives events from both content script and background.
- [ ] Every item has a complete trace from DISCOVERED to final label (or CANCELLED/ERROR).
- [ ] Debug pill shows correct latency derived from trace timestamps.
- [ ] Debug popover shows full chronological event trace.
- [ ] "Copy as JSON" exports a complete, parseable trace.
- [ ] LLM dashboard shows all Tier 3 counters.
- [ ] All new timing measurements appear in the appropriate trace events.
- [ ] No raw LinkedIn text appears in any trace, log, or exported JSON.
- [ ] Disabling Developer Mode removes debug pills and dashboard immediately.
- [ ] Extension performance is not measurably degraded with Developer Mode off (trace recording should be gated behind the developer mode flag).
- [ ] All existing unit tests continue to pass.
- [ ] TypeScript compiles with no errors.
