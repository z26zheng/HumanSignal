# Engineering and Coding Best Practices

These standards apply to all code written for the HumanSignal Chrome extension.

---

## 1. Testing

### Unit Tests

- Every module must have unit tests covering its public API.
- Tests run on every build. Failing tests block merges.
- Use Vitest as the test runner.
- Target: 80%+ code coverage on scoring logic and utility functions.
- Test edge cases explicitly: empty inputs, very long inputs, null/undefined, invalid types.

### Integration Tests

- Test cross-module interactions: content script to service worker messaging, scoring coordinator to cache, overlay to registry.
- Use Playwright for end-to-end extension testing against saved HTML fixtures.
- Integration tests run before every release candidate.

### Fixture-Based Testing

- LinkedIn DOM detection uses saved HTML fixtures, not live pages.
- Rules engine and Gemini prompts use golden-set fixtures with expected outputs.
- Fixtures are checked into version control and updated when LinkedIn changes.

### Test Naming

- Test names describe the behavior, not the implementation: `scores short praise comment as Low Effort`, not `test classify function`.
- Group tests by behavior, not by file.

---

## 2. SOLID Principles

### Single Responsibility

- Each module does one thing. The DOM adapter detects elements. The rules engine scores text. The overlay renders stickers. They do not know about each other's internals.
- Functions should be short (under 30 lines preferred). If a function does multiple things, split it.

### Open/Closed

- Scoring thresholds are in a configuration object, not hardcoded in logic. New rules can be added without modifying existing classification functions.
- The DOM adapter uses a strategy pattern for selectors. New LinkedIn A/B test variants are added as new strategies without changing existing ones.

### Liskov Substitution

- Both the rules engine and Gemini return the same `ScoringResult` shape. The UI does not know or care which produced the result.
- Any scoring source can be swapped without breaking consumers.

### Interface Segregation

- The content script depends on the DOM adapter's public interface, not its internal selector implementation.
- The popup depends on typed message responses, not on the service worker's internal state shape.

### Dependency Inversion

- High-level modules (scoring coordinator) depend on abstractions (scorer interface), not on concrete implementations (rules engine internals or Gemini session details).
- Storage access goes through typed wrappers, not raw `chrome.storage` calls scattered throughout the codebase.

---

## 3. Logging and Observability

### Event Logging

- Log significant events: scoring started, scoring completed, Gemini session created, Gemini failed, adapter found posts, adapter found zero posts, settings changed, cache eviction triggered.
- Use structured log entries: `{ level, timestamp, context, message, data? }`.
- Never log LinkedIn content text (privacy constraint). Log content hashes, item counts, and metadata only.

### Log Levels

- `error`: Something failed and user experience is degraded.
- `warn`: Something unexpected happened but the system recovered.
- `info`: Significant lifecycle events (startup, mode switch, session created).
- `debug`: Detailed internal state (only in development builds).

### Log Storage

- In-memory ring buffer (last 200 entries).
- Exposed via `GET_HEALTH` message for popup diagnostics.
- Not persisted to disk. Cleared on page reload or service worker restart.
- Debug level stripped from production builds.

### Health Metrics

- Track and expose: items scored, cache hit rate, average latency, failure count, queue depth, current scoring mode, adapter success rate.
- Available in the popup diagnostics section.

---

## 4. Error Handling

### Error Boundaries

- Every module's public API catches errors at the boundary.
- Errors never propagate across module boundaries uncaught.
- Use the `safeCatch` wrapper for all public-facing functions.
- Return typed fallback values on failure, not undefined or thrown exceptions.

### Fail Gracefully

- If the DOM adapter fails, stickers do not appear. LinkedIn still works.
- If scoring fails, the sticker shows "unavailable." LinkedIn still works.
- If messaging fails, the content script reconnects. LinkedIn still works.
- The extension never crashes the page.

### Error Recovery

- Transient failures (network, service worker restart) are retried automatically.
- Persistent failures (3+ consecutive Gemini errors) trigger mode degradation.
- Recovery is silent. Users see degraded stickers, not error dialogs on LinkedIn.

### No Silent Swallowing

- Caught errors are always logged. Never catch and discard.
- Use `logger.error(context, error)` in every catch block.

---

## 5. Code Organization

### Module Boundaries

- Each plan (02-07) produces an isolated module with a clear public API.
- Internal implementation details are not exported.
- Cross-module communication goes through the messaging layer or explicit function interfaces.

### File Size

- Prefer files under 200 lines. Split when a file grows beyond 300 lines.
- One concept per file. Do not combine unrelated logic.

### Naming

- Files: `kebab-case.ts`.
- Types/interfaces: `PascalCase`.
- Functions/variables: `camelCase`.
- Constants: `UPPER_SNAKE_CASE`.
- Boolean variables: prefix with `is`, `has`, `should`, `can`.

### Imports

- Use path aliases (`@/utils/`, `@/types/`) rather than deep relative paths.
- Group imports: external packages, then internal modules, then types.
- No circular imports. If two modules need each other, extract the shared dependency.

---

## 6. TypeScript Standards

### Always Have Typings

- Every variable, parameter, return value, and property must have an explicit type annotation. No implicit `any` through omission.
- Every function signature is fully typed: parameters and return type.
- Every data structure has a corresponding `interface` or `type` definition.
- Every message, event, and callback has typed payloads.
- Every configuration object is typed with a named interface.
- If a value can be multiple things, use a discriminated union — never `any` or untyped objects.
- Third-party libraries must have type definitions (`@types/*` or built-in). If types do not exist, write a local `.d.ts` declaration file.

### Strict Mode

- `strict: true` in `tsconfig.json`. No exceptions.
- No `any` in production code. Use `unknown` and narrow with type guards.
- No `@ts-ignore` or `@ts-expect-error` unless accompanied by a comment explaining why and a tracking issue.
- Enable `noUncheckedIndexedAccess` to catch potential undefined from array/object access.

### Type Safety

- All message types are discriminated unions (tagged with `type` field).
- All function parameters and return types are explicitly typed.
- Prefer `interface` for object shapes, `type` for unions and intersections.
- Use `as const` for literal enums and configuration objects.
- Prefer branded types for domain identifiers (e.g., `type ContentHash = string & { __brand: 'ContentHash' }`) to prevent accidental misuse.

### Null Handling

- Prefer explicit `| null` over optional (`?`) for values that may be absent.
- Always handle null cases. No assumptions about data presence.
- Use early returns to narrow types rather than nested conditionals.

---

## 7. Performance

### Frame Budget

- Content script work per frame must stay under 2ms.
- Read/write separation is a hard invariant: all DOM reads before any DOM writes in each rAF callback.
- Use `requestAnimationFrame` for visual updates, never `setInterval`.

### Memory

- Content script heap target: under 30MB.
- Total extension memory target: under 50MB (excluding Chrome-managed Gemini model).
- Cap data structures: max 50 tracked items, max 10,000 cache entries.
- Clean up references when items leave the viewport or are removed.

### Async Work

- Never block the main thread with synchronous heavy computation.
- Rules engine scoring is synchronous but fast (under 5ms per item).
- Gemini scoring is async and non-blocking.
- Debounce observer callbacks (150ms for mutations).

### Caching

- Cache by content hash, not raw text.
- Check cache before invoking any scorer.
- Respect TTL and version invalidation.

---

## 8. Security

### No Secrets in Code

- No API keys, tokens, or credentials in source code.
- No hardcoded URLs to external services (MVP has no backend, but enforce this habit).

### Input Validation

- Validate all data crossing trust boundaries: messages from other extension contexts, data from IndexedDB, Gemini model output.
- Never trust external data shape. Validate with type guards before use.

### Content Security

- Never execute strings as code (`eval`, `new Function`).
- Never inject unescaped user content or LinkedIn content into HTML.
- Sanitize any text before rendering in popover or popup.

---

## 9. Privacy

### Data Minimization

- Process only visible LinkedIn text needed for scoring.
- Store content hashes, not raw text.
- Never store author names, profile URLs, or personally identifiable information in cache.
- Saved insights (opt-in) are the only feature that stores actual text, and only locally.

### No Exfiltration

- No network requests to any external server. All processing is local.
- No analytics, tracking pixels, or third-party scripts.
- Opt-in anonymous telemetry is a post-MVP consideration only.

### User Control

- Users can clear all data at any time.
- Users can disable the extension without residual effects.
- Cached data has a TTL and is automatically evicted.

---

## 10. Code Review Standards

### Before Merging

- All tests pass.
- No linter warnings.
- No `any` types added.
- New code has corresponding tests.
- Error cases are handled and logged.
- No LinkedIn content text in logs or stored data.

### Readability

- Code should be understandable without comments. Use clear names over explanatory comments.
- Comments explain "why," not "what."
- Complex logic gets a brief docstring explaining the intent.

### Commit Messages

- Format: `type(scope): description` (e.g., `feat(rules): add engagement bait detection`).
- Types: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`.
- One logical change per commit. Do not combine unrelated changes.

---

## 11. Dependency Management

### Minimal Dependencies

- Prefer standard browser APIs over third-party libraries.
- Every new dependency must justify its inclusion. Avoid packages for trivial functionality.
- Pin exact versions in `package.json`. Use `pnpm` lockfile.

### Audit

- Run `pnpm audit` regularly.
- No dependencies with known critical vulnerabilities.
- Prefer dependencies with active maintenance and small bundle size.

---

## 12. Configuration

### Externalize Configuration

- Scoring thresholds, cache TTL, max entries, debounce intervals, sticker offsets: all in configuration objects, not scattered in logic.
- Configuration is typed. Invalid values are caught at build time or startup.

### Environment Awareness

- Development builds include debug logging and source maps.
- Production builds strip debug logs, minify, and optimize.
- Use WXT's built-in environment handling for dev/prod differences.

---

## 13. Documentation

### Code Documentation

- Every public function has a brief JSDoc explaining its purpose and return behavior.
- Complex algorithms have inline comments explaining the approach.
- No redundant comments (do not comment `// increment counter` above `counter++`).

### Architecture Documentation

- The Architecture.md is the source of truth for system design decisions.
- Plan files are the source of truth for implementation details.
- Update these documents when decisions change. Do not let code and docs diverge.

---

## 14. Git Workflow

### Branching

- One branch per plan (e.g., `plan-01-extension-shell`, `plan-02-dom-adapter`).
- Merge to `main` only after the plan's verification checklist passes.
- No direct commits to `main`.

### Pull Requests

- Each PR corresponds to a plan or a subset of a plan.
- PR description includes: what changed, why, how to test, and which verification items are covered.
- Squash merge to keep `main` history clean.

---

## Summary

The guiding principles in priority order:

1. **Do not break LinkedIn.** The extension is invisible in terms of page behavior.
2. **Fail gracefully.** Degraded functionality over crashes, always.
3. **Privacy first.** No content exfiltration, minimal storage, user control.
4. **Test everything.** Untested code is broken code you have not found yet.
5. **Keep it simple.** Fewer abstractions, clear boundaries, readable code.
