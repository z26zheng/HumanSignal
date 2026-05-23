# 02 LinkedIn DOM Adapter

## Purpose

Build the isolated module that detects LinkedIn posts and comments in the page DOM, extracts text content, provides element references for overlay positioning, and handles LinkedIn's dynamic feed behavior (infinite scroll, element recycling).

## Depends On

- **01 Extension Shell** (content script entry point, shared types)

## Outputs

- A `LinkedInAdapter` class/module that the content script imports.
- Functions to find all visible post containers and comment containers.
- Text extraction from posts and comments.
- Element references suitable for `getBoundingClientRect()` tracking.
- Detection of new items added by infinite scroll.
- Detection of removed/recycled items.
- HTML fixture test suite with at least 5 saved LinkedIn page snapshots.

## Architecture Context

This module is expected to be brittle. LinkedIn can change their DOM at any time. The adapter is deliberately isolated so that breakage here does not affect scoring, overlay rendering, or settings.

Detection approach:
- Prefer ARIA/accessibility attributes and semantic structure.
- Use data attributes where available.
- Fall back to structural heuristics (nesting depth, sibling patterns).
- Avoid relying on generated class names that change between deploys.

## Tasks

### 1. LinkedIn Page Research

- Manually inspect LinkedIn feed page DOM structure.
- Identify stable selectors for: feed container, individual post wrappers, post text content, comment sections, individual comments, comment text.
- Document which attributes/structures appear stable vs volatile.
- Save 5+ HTML fixture snapshots (feed page, post detail, comment thread, profile activity, different post types like articles, reposts, polls).
- Anonymize fixtures (replace names, profile URLs).

### 2. Page Type Detection

Implement detection of which LinkedIn page type is active:

- Feed (`/feed/`)
- Post detail (`/feed/update/...` or `/posts/...`)
- Profile activity (`/in/.../recent-activity/`)
- Other (unsupported)

Export: `getPageType(): 'feed' | 'postDetail' | 'profileActivity' | 'unsupported'`

### 3. Post Detection

Implement post container detection:

```typescript
interface DetectedPost {
  element: HTMLElement        // outermost post container for position tracking
  textElement: HTMLElement    // element containing post text
  text: string               // extracted normalized text
  postId: string             // stable identifier (see priority chain below)
  postIdMethod: 'urn' | 'permalink' | 'contentHash'  // stability indicator
  isTruncated: boolean       // true if "see more" is present and text is partial
}

function detectPosts(): DetectedPost[]
```

Requirements:
- Find all currently-rendered post containers on the page.
- Handle feed posts, repost wrappers, article shares, poll posts.
- Return the outermost container (for overlay positioning) and the text element (for extraction).
- Generate a stable `postId` using this priority chain:
  1. `data-urn` or activity URN extracted from a permalink `<a>` href (most stable).
  2. Permalink URL hash derived from the post's share/detail link (stable across page types).
  3. Content hash of normalized text (least stable, changes if post is expanded or edited).
- Set `postIdMethod` to indicate which method was used.
- Detect "see more" truncation: if a "see more" button/link is present in the post container, set `isTruncated: true`. The extracted text is the visible portion only; the extension does not click "see more."

### 4. Comment Detection

Implement comment container detection:

```typescript
interface DetectedComment {
  element: HTMLElement
  textElement: HTMLElement
  text: string
  commentId: string
  parentPostId: string
}

function detectComments(): DetectedComment[]
```

Requirements:
- Find visible comments within expanded comment sections.
- Do NOT auto-expand collapsed comments or click "see more."
- Associate each comment with its parent post.
- Handle nested/reply comments.

### 5. Text Extraction

Implement clean text extraction:

```typescript
function extractText(element: HTMLElement): string
```

Requirements:
- Strip HTML tags, extract text content.
- Preserve paragraph breaks as newlines.
- Remove "see more" link text.
- Remove hashtag links but keep hashtag text.
- Remove mention formatting but keep mentioned names.
- Trim whitespace.
- Handle empty or loading states (return empty string).

### 6. Element Recycling Detection

LinkedIn reuses DOM nodes during infinite scroll. Detect when a tracked element's content changes:

```typescript
function hasElementContentChanged(element: HTMLElement, previousText: string): boolean
```

Also detect when elements are removed from the DOM entirely (for sticker cleanup).

### 7. Feed Change Observer Setup

Provide observer configuration for the content script:

```typescript
interface AdapterObserverConfig {
  feedContainerSelector: string
  observerOptions: MutationObserverInit
}

function getObserverConfig(): AdapterObserverConfig
```

The content script uses this to set up its MutationObserver. When mutations fire, it calls `detectPosts()` and `detectComments()` again to find new items.

### 8. Multi-Strategy Selectors (A/B Test Resilience)

LinkedIn frequently runs A/B tests with different DOM structures for the same page type. The adapter should:

- Define 2-3 selector strategies per element type (post container, comment container, text element), tried in priority order.
- Log which strategy succeeded on each detection run.
- If the primary strategy fails, try fallbacks before returning empty.
- When a new fixture reveals a new DOM variant, add it as a new strategy without removing old ones.

This allows the adapter to work across concurrent LinkedIn A/B test variants.

### 9. Fixture Test Suite

Create tests that run against saved HTML fixtures:

- Load each fixture into a DOM environment (jsdom or happy-dom).
- Run `detectPosts()` and verify expected post count and text extraction.
- Run `detectComments()` and verify expected comment count.
- Verify `extractText()` produces clean output for known content.
- Verify `getPageType()` returns correct type for each fixture.
- Preserve DOM structure and attributes during fixture anonymization (only replace text content, not element structure).

Run on every build.

### 9. Resilience

- If no posts are detected, return empty array (do not throw).
- If a selector fails, try fallback selectors before giving up.
- Log detection failures locally (count of zero-result detections) for health monitoring.
- Export a `isAdapterHealthy(): boolean` check (true if posts were found in last 3 attempts).

## Verification

- [ ] `detectPosts()` returns correct posts on all 5+ HTML fixtures.
- [ ] `detectComments()` returns correct comments on fixtures with comment threads.
- [ ] `extractText()` produces clean, normalized text without HTML artifacts.
- [ ] `getPageType()` correctly identifies feed, post detail, and profile activity pages.
- [ ] Element recycling detection correctly identifies when a container's content changes.
- [ ] All fixture tests pass.
- [ ] Adapter returns empty arrays (not errors) when selectors fail.

## Duration Estimate

4-5 days.
