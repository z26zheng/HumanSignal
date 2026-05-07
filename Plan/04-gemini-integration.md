# 04 Gemini Integration

## Purpose

Build the Gemini Nano integration: availability detection, user-triggered download, offscreen document hosting, session lifecycle management, structured JSON prompting, and result validation.

## Depends On

- **01 Extension Shell** (offscreen document, messaging layer, shared types, storage utilities)

## Outputs

- A `GeminiService` module that runs in the offscreen document.
- Availability detection and status reporting.
- User-activated model download with progress tracking.
- Session creation, reuse, and cleanup.
- Structured JSON prompt that returns a valid `ScoringResult`.
- JSON validation and repair strategy.
- Message handlers for service worker communication.

## Architecture Context

Gemini Nano sessions run in the offscreen document because:
- The Prompt API may not be available in service workers.
- The offscreen document persists independently of whether any user-visible extension UI is open.
- It can be created/destroyed by the service worker as needed.

Once Gemini is available, it is the sole scorer. The rules engine is no longer invoked.

MVP: 1 concurrent session. No parallel inference.

## Tasks

### 1. Availability Detection

Implement in the offscreen document:

```typescript
type GeminiStatus = 'available' | 'downloadable' | 'downloading' | 'unavailable' | 'error'

async function checkGeminiAvailability(): Promise<GeminiStatus>
```

Use `LanguageModel.availability()` with:
```typescript
const availability = await LanguageModel.availability({
  expectedInputs: [{ type: 'text', languages: ['en'] }],
  expectedOutputs: [{ type: 'text', languages: ['en'] }],
});
```

Map Chrome's response to our `GeminiStatus` enum. Report status to service worker.

### 2. Model Download Trigger

Implement download initiation (requires user gesture forwarded from UI):

```typescript
async function triggerModelDownload(onProgress: (percent: number) => void): Promise<void>
```

Use `LanguageModel.create()` with a download progress monitor:
```typescript
const session = await LanguageModel.create({
  monitor(m) {
    m.addEventListener('downloadprogress', (e) => {
      onProgress(Math.round(e.loaded * 100));
    });
  },
});
```

Forward progress events to the service worker, which relays them to the popup for display.

**User gesture requirement:** Chrome's Prompt API requires user activation to trigger the initial model download. The popup click ("Enable On-Device AI") generates a valid user gesture in the popup context. During prototyping, verify whether this gesture propagates correctly when the service worker forwards the `TRIGGER_DOWNLOAD` message to the offscreen document.

If the gesture does not propagate (offscreen document cannot call `LanguageModel.create()` without its own gesture), the fallback is: call `LanguageModel.create()` directly in the popup context, then transfer scoring responsibilities to the offscreen document for subsequent prompts. Document the result of this prototype in the implementation.

### 3. Session Management

Implement session lifecycle:

```typescript
class GeminiSessionManager {
  private session: LanguageModelSession | null = null;
  private idleTimeout: number | null = null;

  async getOrCreateSession(): Promise<LanguageModelSession>
  async destroySession(): Promise<void>
  resetIdleTimer(): void
}
```

- Reuse sessions across prompts.
- Destroy after 60 seconds of inactivity.
- Recreate if session becomes invalid.
- Handle `QuotaExceededError` by destroying and recreating.

### 4. Scoring Prompt

Design the system prompt and scoring prompt:

**System prompt** (set via `initialPrompts`):

```
You are a content quality classifier for LinkedIn posts and comments.
Classify the given text and return a JSON object.
Do not make binary AI detection claims.
Focus on signal quality, specificity, and originality.
Be conservative: prefer "Unclear" over overconfident negative labels for ambiguous content.
```

**User prompt template:**

```
Classify this LinkedIn {post|comment}:

---
{text}
---

Return JSON matching this schema exactly:
{
  "primaryLabel": one of ["High Signal", "Specific", "Mixed", "Generic", "Engagement Bait", "Low Signal", "Unclear"] for posts or ["Thoughtful", "Specific", "Question", "Generic", "Low Effort", "Repeated", "Unclear"] for comments,
  "color": one of ["green", "yellow", "orange", "red", "gray"],
  "confidence": one of ["low", "medium", "high"],
  "dimensions": { "authenticity": 0-1, "originality": 0-1, "specificity": 0-1, "engagementBait": 0-1, "templating": 0-1, "usefulness": 0-1 },
  "reasons": [2-3 concise sentences explaining why]
}
```

Use `responseConstraint` with JSON schema if supported:

```typescript
const schema = {
  type: 'object',
  properties: {
    primaryLabel: { type: 'string', enum: [...] },
    color: { type: 'string', enum: ['green', 'yellow', 'orange', 'red', 'gray'] },
    confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
    dimensions: { type: 'object', ... },
    reasons: { type: 'array', items: { type: 'string' }, minItems: 2, maxItems: 3 }
  },
  required: ['primaryLabel', 'color', 'confidence', 'dimensions', 'reasons']
};
```

### 5. Result Validation

Validate Gemini output before returning:

```typescript
function validateGeminiResult(raw: unknown): ScoringResult | null
```

Check:
- JSON parses correctly.
- `primaryLabel` is in allowed enum.
- `color` is in allowed enum.
- `confidence` is in allowed enum.
- `dimensions` values are numbers between 0 and 1.
- `reasons` is an array of 2-3 non-empty strings.

If validation fails, return `null` (triggers repair strategy).

### 6. Repair Strategy

When Gemini returns invalid output:

1. **First attempt:** Re-prompt once with a simplified prompt (shorter instructions, explicit "respond with only JSON").
2. **Second failure:** Return `null` to the scoring coordinator. The coordinator will fall back to the rules engine for this item only (per-item fallback). The global mode remains Gemini.
3. **Track failure rate locally.** If 3+ consecutive failures occur, report `GeminiStatus: 'error'` and pause Gemini requests for 5 minutes. During pause, all items fall back to rules.

Do not retry indefinitely.

### 6b. Token/Length Limit Handling

LinkedIn posts can exceed Gemini Nano's context window:

1. Measure the maximum input length Gemini Nano accepts during prototyping.
2. If a post exceeds the limit, truncate to the maximum length and add `[truncated]` at the end.
3. Flag `isTruncated: true` on the scoring result so the popover can show "based on partial text."
4. If truncation would remove more than 50% of the text, fall back to rules for that item instead.

### 7. Public Scoring Function

```typescript
async function scoreWithGemini(item: ExtractedItem): Promise<ScoringResult | null>
```

- Creates/reuses session.
- Sends prompt.
- Validates response.
- Returns `ScoringResult` with `source: 'gemini'` or `null` on failure.
- Resets idle timer on success.

### 8. Message Handlers

Register in the offscreen document:

```typescript
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {
    case 'CHECK_GEMINI_STATUS': ...
    case 'TRIGGER_DOWNLOAD': ...
    case 'GEMINI_PROMPT': ...
    case 'DESTROY_SESSION': ...
  }
});
```

All communication goes through the service worker; the offscreen document never talks directly to the content script.

### 9. Golden Set Prompt Evaluation

Create an offline evaluation script:

- Run the scoring prompt against 50+ test items.
- Measure: label agreement with expected labels, invalid JSON rate, average latency.
- Target: 80%+ agreement (must be >= rules engine agreement), <10% invalid JSON rate.
- If Gemini cannot beat rules on the golden set, investigate prompt issues before shipping Gemini mode.
- Run manually when prompts change (not on every build, since it requires Gemini Nano availability).

### 10. Storage Requirements Communication

Before triggering download, check available storage if possible. Prepare a user-facing message:

> "Chrome's on-device AI model requires approximately 2GB of free space. Chrome will manage the download."

Surface this in the popup before the user clicks "Enable."

## Verification

- [ ] `checkGeminiAvailability()` correctly detects all four states on supported and unsupported devices.
- [ ] `triggerModelDownload()` reports progress percentages to service worker.
- [ ] Session creates successfully and responds to prompts.
- [ ] `scoreWithGemini()` returns valid `ScoringResult` for a known test post.
- [ ] Invalid JSON from Gemini triggers repair strategy correctly.
- [ ] Session is destroyed after 60 seconds of inactivity.
- [ ] 3 consecutive failures trigger error state and pause.
- [ ] Message handlers respond correctly to all message types.
- [ ] Offscreen document can be destroyed and recreated without losing functionality.

## Duration Estimate

5-7 days (includes prompt iteration and evaluation).
