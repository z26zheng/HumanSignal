# 07 Scoring Coordinator

## Purpose

Build the central scoring coordinator in the service worker: manages the scoring mode (rules vs Gemini), local cache with versioning, priority queue with concurrency control, and message routing between content script and scoring engines.

## Depends On

- **01 Extension Shell** (service worker, messaging layer, storage utilities)
- **03 Rules Engine** (scoring function, scoring version)
- **04 Gemini Integration** (scoring function, availability detection)

## Outputs

- `ScoringCoordinator` class in the service worker.
- Mode management (rules mode vs Gemini mode, one-way switch).
- Priority queue with viewport-based scheduling.
- Local score cache with TTL and version invalidation.
- Concurrency control (1 Gemini request at a time for MVP).
- Service worker lifecycle resilience (state recovery from IndexedDB).
- Content script message handling for score requests.

## Architecture Context

The scoring coordinator is the service worker's core logic. It:

- Receives score requests from content scripts.
- Decides which scoring engine to use (rules or Gemini, never both).
- Manages a priority queue for Gemini requests.
- Caches results locally.
- Returns results to content scripts.
- Handles service worker termination gracefully.

Only one scoring mode is active at a time. Once Gemini is available, rules are never used for new items.

## Tasks

### 1. Scoring Mode Manager

```typescript
type ScoringMode = 'rules' | 'gemini'

class ModeManager {
  private mode: ScoringMode = 'rules';

  async initialize(): Promise<void>    // check Gemini availability on startup
  getMode(): ScoringMode
  switchToGemini(): void               // one-way switch
  onGeminiAvailable(): void            // called when download completes
}
```

On service worker startup:
1. Check Gemini availability via message to offscreen document.
2. If available, set mode to `gemini`.
3. If not, set mode to `rules`.
4. Listen for `MODEL_STATUS` messages indicating download completion; switch mode when received.

Mode switch is one-way and permanent (for the lifetime of the extension install, until Gemini becomes unavailable due to a Chrome update or storage issue).

### 2. Score Cache

```typescript
interface CacheEntry {
  contentHash: string
  result: ScoringResult
  scoringVersion: number
  createdAt: number
}

class ScoreCache {
  private maxEntries: number = 10000;
  private ttlMs: number = 14 * 24 * 60 * 60 * 1000; // 14 days

  async get(contentHash: string): Promise<ScoringResult | null>
  async set(contentHash: string, result: ScoringResult): Promise<void>
  async clear(): Promise<void>
  async getSize(): Promise<number>
  async evictExpired(): Promise<void>
  async evictOldest(count: number): Promise<void>
}
```

Cache lookup logic:
1. Find entry by `contentHash`.
2. Reject if `scoringVersion` does not match current version.
3. Reject if `createdAt + ttlMs < now`.
4. Return result if valid.

Storage: IndexedDB (object store `scoreCache` with index on `contentHash`).

Handle `QuotaExceededError` by evicting oldest 25% and retrying.

### 3. Priority Queue

```typescript
type Priority = 1 | 2 | 3  // 1 = highest (in viewport), 3 = lowest

interface QueueItem {
  itemId: string
  contentHash: string
  text: string
  itemType: 'post' | 'comment'
  priority: Priority
  addedAt: number
}

class ScoringQueue {
  private queue: QueueItem[] = [];
  private inFlight: Map<string, Promise<ScoringResult | null>> = new Map();
  private maxQueueSize: number = 20;
  private maxConcurrent: number = 1;  // MVP: 1 for Gemini

  enqueue(item: QueueItem): void
  cancel(itemId: string): void
  cancelByPriority(priority: Priority): void
  updatePriority(itemId: string, priority: Priority): void
  processNext(): Promise<void>
  isProcessing(): boolean
}
```

Queue behavior:
- Sorted by priority (1 first), then by `addedAt` (oldest first within same priority).
- When queue exceeds `maxQueueSize`, drop lowest-priority items.
- Only 1 item processed at a time for Gemini mode.
- In rules mode, process all immediately (synchronous, no queue needed).

### 4. Viewport Priority Updates

Content script sends priority updates when items enter/leave viewport:

```typescript
type PriorityUpdate = { itemId: string; inViewport: boolean }
```

- Item enters viewport: set priority to 1.
- Item leaves viewport: set priority to 3.
- Items near viewport (reported by IntersectionObserver with margin): priority 2.

### 5. Deduplication

Prevent duplicate scoring:

- Before enqueuing, check if `contentHash` is already in-flight.
- If yes, wait for the existing in-flight promise rather than starting a new request.
- Use `inFlight: Map<contentHash, Promise<ScoringResult | null>>` for tracking.

### 6. Score Request Handler

Handle `SCORE_BATCH` messages from content script:

```typescript
interface ScoreBatchResponse {
  immediate: ScoringResult[]  // cache hits + rules results
  queued: string[]            // itemIds queued for Gemini (content script shows loading state)
}

async function handleScoreBatch(items: ExtractedItem[]): Promise<ScoreBatchResponse> {
  const immediate: ScoringResult[] = [];
  const queued: string[] = [];

  for (const item of items) {
    const contentHash = hashText(item.text);

    // 1. Check cache
    const cached = await cache.get(contentHash);
    if (cached) {
      immediate.push(cached);
      continue;
    }

    // 2. Score based on mode
    if (modeManager.getMode() === 'rules') {
      const result = scoreWithRules(item);
      await cache.set(contentHash, result);
      immediate.push(result);
    } else {
      // Enqueue for Gemini (async)
      queue.enqueue({ itemId: item.itemId, contentHash, text: item.text, itemType: item.itemType, priority: 1, addedAt: Date.now() });
      queued.push(item.itemId);
    }
  }

  return { immediate, queued };
}
```

The content script manages sticker states locally:
- Items in `immediate` get their sticker set to the scored state.
- Items in `queued` get their sticker set to loading state by the content script's item registry.
- When Gemini completes, the service worker sends a `SCORE_RESULT` message with the result.
- If Gemini fails for an item after repair/retry, the coordinator falls back to `scoreWithRules(item)` for that item and sends the rules-based result via `SCORE_RESULT`.

### 7. Gemini Result Routing

When Gemini returns a result (via message from offscreen document):

1. Cache the result.
2. Remove from in-flight map.
3. Send `SCORE_RESULT` message to the content script tab that requested it.
4. Process next item in queue.

### 8. Rapid Scroll Debouncing

When many items arrive quickly:

- Content script debounces discovery (150ms, handled in Plan 05).
- Service worker also debounces: if 10+ items arrive within 200ms, only process items that are priority 1 (in viewport) immediately. Queue the rest.

### 9. Service Worker Recovery and Reconnection Protocol

On service worker wake (after termination):

1. Rebuild `ModeManager` state from stored Gemini status.
2. Reload cache connection (IndexedDB).
3. Re-check Gemini availability.
4. Broadcast `SERVICE_WORKER_ALIVE` to all connected tabs.
5. Any in-flight items from before termination are lost.

Content script reconnection protocol:

1. Content script detects service worker disconnect via `chrome.runtime.onDisconnect` or failed `sendMessage`.
2. Content script enters "reconnecting" state: stickers in loading state remain, no new score requests sent.
3. Content script polls `chrome.runtime.sendMessage({ type: 'PING' })` every 2 seconds until a `PONG` is received.
4. On successful reconnection, content script re-sends all items in its registry that are in loading/queued state.
5. Alternatively, the service worker broadcasts `SERVICE_WORKER_ALIVE` on wake, and content scripts listen for it to trigger re-send.

Persist to storage:
- Current scoring mode.
- Gemini status.
- Queue is NOT persisted (ephemeral; content script re-sends on reconnect).

### 10. Content Hash Function

```typescript
function hashText(text: string): string {
  // Normalize: lowercase, collapse whitespace, trim
  const normalized = text.toLowerCase().replace(/\s+/g, ' ').trim();
  // Use a fast hash (FNV-1a or similar) - not crypto, just dedup
  return fnv1a(normalized);
}
```

Keep it fast and deterministic. No need for cryptographic security.

### 11. Health Metrics

Track locally (for diagnostics in popup):

- Total items scored this session.
- Cache hit rate.
- Average Gemini latency.
- Gemini failure count.
- Queue depth (current).
- Current scoring mode.

Expose via a `GET_HEALTH` message type. The popup fetches this on open to display in its diagnostics section.

## Verification

- [ ] Rules mode: items scored synchronously, results returned immediately.
- [ ] Gemini mode: items queued, results arrive asynchronously via message.
- [ ] Cache hit returns stored result without invoking any scorer.
- [ ] Stale cache entries (wrong version or expired TTL) are rejected.
- [ ] Queue respects priority ordering.
- [ ] Queue does not exceed max size (drops lowest priority).
- [ ] Only 1 Gemini request in-flight at a time.
- [ ] Duplicate content hashes are deduplicated (single in-flight promise shared).
- [ ] Mode switches from rules to Gemini when download completes.
- [ ] Service worker recovery rebuilds state correctly after termination.
- [ ] Content script receives results for all requested items (immediate for rules, async for Gemini).
- [ ] `QuotaExceededError` on cache write triggers eviction and retry.
- [ ] Health metrics are accurate and accessible.

## Duration Estimate

5-7 days.
