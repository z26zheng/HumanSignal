# PRD: LinkedIn Authenticity & Signal Intelligence

## 1. Product Summary

LinkedIn is increasingly filled with AI-generated posts, generic comments, engagement bait, and automated social activity. This makes it harder for professionals to find useful insight, identify genuine human conversations, and judge whether engagement around a person, company, or topic is meaningful.

This product helps LinkedIn users separate high-signal human content from low-signal AI-assisted or automated content. The initial product should avoid making brittle binary claims such as "this was written by AI." Instead, it should provide an authenticity and signal-quality layer that explains why a post or comment appears human, generic, templated, automated, or low-value.

The recommended wedge is a local-first Chrome extension that overlays private Signal Stickers on LinkedIn posts and comments. The MVP runs without a backend: a deterministic rules engine scores immediately, and Chrome's on-device Gemini Nano can enhance uncertain scores when available. The long-term opportunity is B2B signal intelligence for sales, recruiting, creator analytics, and brand monitoring.

## 2. Working Product Name

Placeholder names:

- HumanSignal
- HumanSignal
- AuthenticFeed
- LinkedIn Signal Filter
- Proof of Human

Recommended positioning:

> Signal intelligence for LinkedIn. Filter generic AI noise, find real human insight, and prioritize authentic engagement.

## 3. Problem Statement

LinkedIn users increasingly encounter content that feels polished but empty:

- AI-generated thought leadership posts
- Generic comments such as "Great insights!" or "Couldn't agree more"
- Engagement-bait posts optimized for impressions rather than substance
- Automated outbound or brand-building activity
- Reposted content with little original context
- Creator comment sections inflated by low-quality engagement

This creates several problems:

1. Professionals waste time reading low-signal content.
2. Salespeople and recruiters struggle to distinguish real human intent from automated activity.
3. Creators and executives cannot easily tell whether engagement is meaningful.
4. Brand and marketing teams lack visibility into how much of an industry conversation is authentic.
5. Trust in LinkedIn as a professional network declines.

The market pain is not simply "AI wrote this." The deeper pain is:

> LinkedIn has too much professional-looking noise and not enough trustworthy signal.

## 4. Product Thesis

People are unlikely to pay much for a generic consumer AI detector. They are more likely to pay for a workflow that helps them make money, save time, or protect reputation.

The product should therefore focus on signal quality and authenticity rather than AI detection alone.

Core thesis:

> LinkedIn power users and teams will pay for tools that help them identify authentic human engagement, filter low-signal content, and prioritize meaningful professional interactions.

## 5. Target Customers

### 5.1 Primary Beachhead: Sales Professionals and GTM Teams

Sales teams already pay for LinkedIn-related tooling through products such as Sales Navigator, Apollo, Clay, ZoomInfo, and social selling tools.

Pain points:

- Hard to tell which prospect posts indicate real buying intent.
- Generic AI posts create false signals.
- Automated comments make engagement look more valuable than it is.
- Sales reps waste time engaging with low-quality posts and prospects.

Value proposition:

> Prioritize real human buying signals and avoid wasting time on automated LinkedIn noise.

Potential willingness to pay:

- Individual prosumer: $15-$30/month
- Team plan: $30-$75/user/month
- Enterprise/API: usage-based or annual contracts

### 5.2 Secondary Segment: Recruiters and Talent Teams

Recruiters use LinkedIn to evaluate candidates, source talent, and understand professional credibility.

Pain points:

- Candidate profiles increasingly include AI-written content.
- Posts may create a false impression of thought leadership.
- Recruiters want to identify candidates with genuine expertise and communication ability.

Value proposition:

> Identify candidates with authentic expertise, original thinking, and real professional engagement.

Potential willingness to pay:

- Recruiter plan: $20-$50/month
- Team plan: $50-$100/user/month if integrated with sourcing workflow

### 5.3 Secondary Segment: Creators, Executives, and Founder-Led Brands

Creators and executives care about engagement quality, audience insight, and reputation.

Pain points:

- Comment sections are filled with generic replies.
- High engagement may not mean real influence.
- They want to know which followers are genuinely engaged.

Value proposition:

> Understand whether your LinkedIn engagement is real, useful, and coming from valuable people.

Potential willingness to pay:

- Creator plan: $19-$49/month
- Agency or executive communications plan: $99-$299/month

### 5.4 Tertiary Segment: Marketing, Brand, and Research Teams

Marketing teams may care about the quality of conversation around categories, competitors, and trends.

Pain points:

- Social listening tools show volume, but not authenticity.
- AI-generated posts distort perceived market sentiment.
- Brand teams need to know whether industry conversations are organic or synthetic.

Value proposition:

> Measure authentic conversation quality across topics, competitors, and categories.

Potential willingness to pay:

- Dashboard: $199-$999/month
- Enterprise reports/API: custom pricing

### 5.5 Weak Segment: Casual LinkedIn Users

Casual users may complain about AI posts, install an extension, and enjoy a cleaner feed. However, willingness to pay is likely low and churn risk is high.

Potential value:

- Free user acquisition
- Viral distribution
- Data for improving models
- Bottom-up entry into companies

Likely pricing:

- Free tier
- $5-$10/month consumer pro plan

This segment should not be the initial monetization focus.

## 6. User Personas

### Persona 1: Sales Development Representative

Name: Maya  
Role: SDR at a B2B SaaS company  
Goal: Find prospects showing real intent and start relevant conversations  
Pain: LinkedIn activity is noisy, and many prospects post generic AI-written content  
Desired outcome: Spend time on prospects with authentic signals and avoid dead-end engagement

### Persona 2: Account Executive

Name: Daniel  
Role: Enterprise AE  
Goal: Understand which prospects and champions are active, credible, and worth engaging  
Pain: Surface-level LinkedIn activity can be misleading  
Desired outcome: Use LinkedIn as a reliable source of relationship and intent intelligence

### Persona 3: Recruiter

Name: Priya  
Role: Technical recruiter  
Goal: Evaluate whether candidates demonstrate real expertise and communication ability  
Pain: AI-written posts and profiles make candidates look more polished than they are  
Desired outcome: Identify candidates with authentic experience and original thinking

### Persona 4: Founder/Creator

Name: Alex  
Role: Founder posting regularly on LinkedIn  
Goal: Grow a real audience and understand engagement quality  
Pain: Comments are inflated by generic responses and engagement pods  
Desired outcome: See which comments, followers, and conversations are genuinely valuable

## 7. Goals

### Product Goals

1. Help users identify high-signal and low-signal LinkedIn content.
2. Reduce time wasted on generic, AI-like, or automated posts and comments.
3. Provide transparent explanations instead of opaque AI verdicts.
4. Validate which customer segment has meaningful willingness to pay.
5. Build a foundation for B2B signal intelligence workflows.

### Business Goals

1. Validate paid demand within 8-12 weeks of MVP launch.
2. Achieve meaningful activation among LinkedIn power users.
3. Convert a measurable percentage of free users to paid plans.
4. Identify one segment with repeatable sales motion and retention potential.

### User Experience Goals

1. Make the product useful within the first LinkedIn session.
2. Avoid shaming or falsely accusing users of AI usage.
3. Keep explanations short, actionable, and understandable.
4. Make filtering feel empowering, not judgmental.

## 8. Non-Goals

The MVP will not:

- Claim with certainty that content was written by AI.
- Publicly label or shame LinkedIn users.
- Auto-comment, auto-message, or automate engagement.
- Auto-scroll, auto-expand, auto-click, or use LinkedIn private APIs.
- Replace LinkedIn Sales Navigator, applicant tracking systems, or social listening platforms.
- Provide legal, compliance, or employment-screening determinations.
- Guarantee detection of every AI-generated or automated post.
- Require a backend scoring service.
- Store full LinkedIn feed history.

## 9. Key Product Principles

### 9.1 Signal Quality Over AI Detection

The product should frame outputs as signal assessments:

- High human signal
- Specific and experience-based
- Generic or templated
- Engagement bait pattern
- Likely AI-assisted
- Low originality signal
- Repeated comment pattern

Avoid:

- "This is AI"
- "This user is fake"
- "This person is lying"
- "100% AI-generated"

### 9.2 Explainability Builds Trust

Every score should include a short explanation, such as:

- "Uses broad motivational language with no specific example."
- "Comment closely matches repeated praise patterns."
- "Post includes concrete personal details and a specific sequence of events."
- "High claim density but few verifiable details."

### 9.3 User Control

Users should be able to decide what to hide, highlight, or ignore. The product should not require everyone to accept a universal definition of authenticity.

### 9.4 Privacy and Platform Caution

The product should minimize stored personal data, avoid unnecessary scraping, and be careful about LinkedIn platform dependency.

### 9.5 Local-First by Default

The MVP should be fully local. Content scoring, sticker rendering, settings, cache, saved insights, and weekly aggregates should run on the user's device.

Architecture principle:

> Rules first, Gemini enhancement second.

Required product implications:

- Users should see initial stickers quickly from the deterministic rules engine.
- If on-device Gemini Nano is available, the product may upgrade labels and explanations asynchronously.
- If Gemini is downloading or unavailable, the product must remain useful in rules-only mode.
- Users should understand whether enhanced private on-device analysis is enabled.
- Raw LinkedIn text should not be sent to a backend for MVP scoring.

## 10. MVP Scope

### 10.1 MVP Format

Local-first Chrome extension for LinkedIn.

Why:

- Fastest path to user validation.
- Native to the user's existing workflow.
- Easier to demonstrate value than a standalone app.
- Enables consumer and prosumer distribution.
- Minimizes privacy risk by keeping scoring and storage on-device.

MVP architecture assumptions:

- Chrome Extension Manifest V3.
- TypeScript, Vite, and Preact for extension UI.
- Content script for page coordination.
- Overlay root for inline Signal Stickers.
- Inline popover for sticker explanations, rendered from the extension overlay.
- Extension popup for quick toggles, settings, clear-data controls, and model status.
- Deterministic rules engine for immediate baseline scoring.
- Optional Chrome Prompt API / Gemini Nano enhancement when available.
- Local storage only for settings, score cache, model state, saved insights, and aggregate summaries.

### 10.2 MVP Surface Area

The MVP should work on:

- LinkedIn home feed posts
- Post detail pages
- Comment threads
- Profile activity sections, if feasible

The MVP should analyze only content the user has already loaded or opened. It should not auto-scroll, auto-expand comments, or scrape LinkedIn in the background.

### 10.3 MVP Features

#### Feature 1: Signal Sticker for Posts

For each visible LinkedIn feed post, show a small color-coded "Signal Sticker" badge. The sticker is the core MVP interaction. It should give users an immediate, low-friction read on whether a post is worth attention.

The sticker must use both color and label, not color alone and not a numeric score alone. The product may calculate numeric scores internally, but the user-facing MVP should emphasize understandable labels.

Recommended sticker labels:

- High Signal
- Specific
- Mixed
- Generic
- Engagement Bait
- Low Signal
- Unclear

Recommended color mapping:

- Green: high-signal, specific, original, or experience-based content
- Yellow: mixed signals or moderate confidence
- Orange: generic, templated, broad, or low-specificity content
- Red: very low-signal, strong engagement-bait pattern, or likely automated content
- Gray: too short, unclear, unsupported, or low-confidence classification

Examples:

- Green sticker: "High Signal"
- Green sticker: "Specific"
- Yellow sticker: "Mixed"
- Orange sticker: "Generic"
- Red sticker: "Engagement Bait"
- Gray sticker: "Unclear"

Sticker behavior:

- The sticker appears on each supported feed post after rules-based scoring completes.
- While scoring is in progress, the sticker area may show a subtle "Scanning" state.
- If Gemini Nano later improves the result, the sticker may update in place without changing page layout.
- If scoring fails, the sticker should show "Unavailable" or disappear without disrupting LinkedIn.
- Clicking the sticker opens an inline explanation popover for that post.
- Hovering over the sticker may show a one-sentence reason.
- The sticker should be visually noticeable but not dominate the LinkedIn post.
- The sticker should be private to the extension user and never modify the original post content for others.

The MVP should not show "AI-generated" as a primary sticker label. "Likely AI-assisted" may appear inside the explanation popover only when the system has enough supporting signals.

#### Feature 2: Signal Sticker for Comments

For supported LinkedIn comments, show the same color + label sticker pattern in a smaller comment-appropriate format.

Comment sticker labels may include:

- Thoughtful
- Specific
- Question
- Generic
- Low Effort
- Repeated
- Unclear

Comment sticker behavior:

- Comment stickers should appear next to, under, or near the comment action row without making comment threads hard to read.
- Short comments should often receive "Unclear" rather than an overconfident negative label.
- Generic praise such as "Great insights" should usually be labeled "Generic" or "Low Effort," not "AI."
- Clicking a comment sticker opens an inline explanation popover for that specific comment.
- Users can optionally collapse low-signal comments.

The goal is to help users find useful replies and ignore generic engagement, especially in crowded comment threads.

#### Feature 3: Feed Filter Controls

Users can set preferences:

- Hide low-signal posts
- Dim likely AI-assisted posts
- Highlight high-human-signal posts
- Collapse generic comments
- Adjust strictness: low, medium, high
- Show stickers on posts only, comments only, or both
- Enable or disable private on-device AI enhancement when available
- Clear local cache and saved local data

#### Feature 4: Inline Explanation Popover

Clicking a Signal Sticker opens a compact inline popover explaining why the item received the label. The popover should appear near the clicked sticker and remain anchored to the relevant post or comment while open.

Explanation examples:

- "Specific first-person experience and concrete details increase human-signal score."
- "Broad advice, listicle structure, and generic phrases reduce originality score."
- "Comment is short, praise-only, and similar to common automated engagement patterns."

The explanation popover should include:

- The selected sticker label
- The top 2-3 reasons behind the label
- Confidence level: low, medium, or high
- Scoring source: rules or private on-device AI enhancement
- Optional secondary signals, such as specificity, originality, and engagement-bait likelihood
- Feedback actions: "Agree," "Disagree," and "Not useful"

Popover behavior:

- Opening a new sticker popover closes any previously open popover.
- Clicking outside the popover closes it.
- The popover should stay within the viewport when possible.
- The popover should not cover LinkedIn's primary action controls for the post or comment.
- The MVP does not require a Chrome side panel for explanations.

#### Feature 5: Weekly Signal Summary

Weekly summary for users:

- Posts scanned
- Comments scanned
- Low-signal content hidden or dimmed
- High-signal posts found
- Most authentic voices encountered
- Topics with highest and lowest signal quality

This feature supports retention and future monetization.

For MVP, weekly summaries should be generated from local aggregate counters only. The product should not store full raw post or comment text to generate summaries.

### 10.4 MVP Exclusions

The MVP should not include:

- Team dashboards
- CRM integrations
- ATS integrations
- API access
- Broad social network support
- Automated outreach
- Public user scoring pages

## 11. Scoring Framework

The MVP scoring framework has two local tiers:

1. Rules engine: deterministic scoring that runs immediately for visible content.
2. Gemini enhancement: optional on-device Gemini Nano scoring that improves uncertain or nuanced results when Chrome supports it.

The product should always remain usable in rules-only mode.

### 11.1 Inputs

Potential signals:

- Specificity of personal experience
- Presence of concrete details, dates, numbers, companies, roles, or events
- Generic motivational phrasing
- Repetitive listicle structure
- Engagement bait language
- Claim density versus evidence density
- Comment length and semantic originality
- Similarity to common AI-generated patterns
- Similarity to repeated comments from the same user
- Use of first-person context
- Nuance, uncertainty, disagreement, or trade-offs
- Link, image, or external reference context

### 11.2 Output Dimensions

Instead of one score, use several dimensions:

1. Authenticity signal
2. Originality signal
3. Specificity signal
4. Engagement-bait likelihood
5. Automation or templating likelihood
6. Usefulness signal

### 11.3 Scoring Sources

#### Rules Engine

The rules engine handles obvious cases quickly and conservatively. It should extract deterministic features such as:

- Text length and sentence count
- First-person language
- Concrete numbers, dates, percentages, named entities, and specific work context
- Generic praise phrases
- Motivational cliches
- Engagement-bait patterns
- Listicle structure
- Claim-to-evidence ratio
- Repeated comment similarity

Rules should prefer "Unclear" over overconfident negative labels when content is ambiguous, short, or unsupported.

#### Gemini Enhancement

If Chrome's on-device Gemini Nano is available and the user enables private on-device analysis, the product may rescore selected items after rules-based scoring.

Gemini enhancement should focus on:

- Mixed-signal content where rules confidence is low
- Richer explanation quality
- Originality and specificity judgment
- Comment nuance
- Confidence calibration

Gemini should not be required for the MVP to function. If Gemini is unavailable, downloading, slow, or returns invalid output, the existing rules-based sticker remains the source of truth.

### 11.4 Recommended UI Labels

Use labels that are cautious and explainable:

- High Signal
- Specific
- Thoughtful
- Mixed
- Generic
- Low Signal
- Engagement Bait
- Low Effort
- Repeated
- Unclear

The MVP label system should be optimized for fast feed comprehension. Users should understand the sticker in under one second without opening the explanation popover.

Primary post labels:

- High Signal: content appears specific, original, useful, or experience-based
- Specific: content includes concrete details, examples, or personal/professional context
- Mixed: content has both useful and generic signals
- Generic: content relies on broad advice, familiar phrasing, or low-specificity claims
- Engagement Bait: content appears primarily designed to drive reactions or comments
- Low Signal: content has little useful, specific, or original information
- Unclear: content is too short, ambiguous, or unsupported for a confident label

Primary comment labels:

- Thoughtful: comment adds a specific point, question, example, or disagreement
- Specific: comment includes concrete context or relevant detail
- Question: comment asks a useful or substantive question
- Generic: comment is broad praise or low-specificity agreement
- Low Effort: comment contributes little beyond visibility or politeness
- Repeated: comment appears similar to common repeated engagement patterns
- Unclear: comment is too short or ambiguous to classify confidently

Avoid overly certain labels:

- AI-generated
- Fake
- Bot
- Fraud
- Human verified

### 11.5 Confidence Handling

For uncertain cases:

- Show "unclear" or "mixed signals."
- Explain what factors are conflicting.
- Avoid forcing a binary output.

Example:

> Mixed signals: the post includes specific work context, but the structure and phrasing are highly generic.

### 11.6 Result Contract

Each scoring result should include:

- Local item ID derived from a normalized content hash
- Item type: post or comment
- Primary label
- Color category
- Confidence level
- Dimension scores
- Top explanation reasons
- Scoring source: rules or gemini
- Timestamp

The product should store hashes and result metadata, not raw LinkedIn text, unless a user explicitly saves an insight.

## 12. User Flows

### 12.1 First-Time User Flow

1. User installs Chrome extension.
2. User opens LinkedIn.
3. Product shows a lightweight onboarding tooltip.
4. Product explains that color + label stickers will appear on posts and comments.
5. User chooses a default mode:
   - Balanced
   - Strict filtering
   - Highlight only
6. Product scans visible feed items.
7. User sees Signal Stickers on posts.
8. User clicks one sticker to understand the explanation.
9. User optionally enables hiding or dimming low-signal content.

Activation event:

> User scans at least 20 posts/comments and interacts with at least one explanation or filter.

### 12.2 Sales User Flow

1. Sales user browses prospect posts.
2. Product adds Signal Stickers to posts and comments.
3. Product dims generic thought-leadership posts.
4. User clicks "High Signal," "Specific," or "Mixed" stickers to inspect useful context.
5. User saves a high-signal post as a lead note.
6. Future version exports the note to CRM.

Activation event:

> User saves or acts on at least one high-signal prospect insight.

### 12.3 Creator User Flow

1. Creator opens comments on their own post.
2. Product adds comment-level Signal Stickers.
3. Creator filters generic praise comments.
4. Creator identifies thoughtful commenters and potential relationship opportunities.
5. Creator receives a weekly engagement authenticity report.

Activation event:

> Creator identifies at least five high-quality commenters or hides low-quality comments on one post.

## 13. Functional Requirements

### 13.1 Chrome Extension

The extension must:

- Detect LinkedIn feed posts and comments in the page DOM.
- Extract visible text needed for local scoring.
- Add non-invasive color + label Signal Stickers to supported posts and comments.
- Provide inline explanation popovers from sticker clicks.
- Provide quick controls, settings, clear-data controls, and model status in the extension popup.
- Allow users to configure filtering preferences.
- Persist user settings.
- Respect logged-out, loading, and dynamic feed states.
- Avoid breaking LinkedIn page behavior.
- Avoid auto-scroll, auto-click, auto-expand, auto-comment, auto-message, and LinkedIn private APIs.

UI injection requirements:

- The extension should use a single fixed-position overlay root appended to the document body.
- Signal Stickers should be children of the overlay root, not children injected directly into LinkedIn post or comment nodes.
- Stickers should be positioned above their corresponding LinkedIn elements.
- Sticker positioning should update without causing LinkedIn layout shifts.
- The extension should fail silently if LinkedIn changes in a way that prevents reliable sticker placement.

Signal Sticker UI requirements:

- Stickers must contain a text label.
- Stickers must use color as a secondary cue, not the only cue.
- Stickers must support at least these states: loading, labeled, unclear, and unavailable.
- Stickers must be clickable.
- Stickers must open an inline explanation popover for the specific post or comment.
- Stickers must not cover LinkedIn's native author, content, reaction, comment, share, or messaging controls.
- Stickers must remain visually consistent across feed posts, post detail pages, and comment threads.
- Users must be able to turn post stickers and comment stickers on or off separately.

### 13.2 Local Scoring Engine

The local scoring engine must:

- Accept post or comment text.
- Return a primary label, color category, dimension scores, confidence, and explanations.
- Handle short comments differently from long posts.
- Avoid storing unnecessary personal data.
- Support batching for visible feed items.
- Return results quickly enough for feed browsing.
- Produce an immediate rules-based result before any optional Gemini enhancement.
- Cache results by normalized content hash.
- Prefer conservative labels such as "Mixed" or "Unclear" when confidence is low.

Target latency:

- Rules-based single item: under 300ms
- Rules-based visible batch: under 2 seconds
- Gemini-enhanced item: asynchronous; must not block browsing or sticker display

### 13.3 Gemini Nano Enhancement

When Chrome's on-device Gemini Nano is available, the product may offer private on-device analysis enhancement.

The Gemini enhancement must:

- Be capability-detected at runtime.
- Be framed to users as "private on-device analysis."
- Require user awareness or action before triggering model download or enablement.
- Continue in rules-only mode while Gemini is downloading.
- Continue in rules-only mode when Gemini is unavailable.
- Enhance only selected items, especially low-confidence or mixed-signal items, unless future performance testing supports broader use.
- Return results through the same scoring contract as the rules engine.
- Reject or ignore invalid model output rather than showing broken labels.

### 13.4 Inline Explanation Popover

The inline explanation popover must show:

- The selected post or comment's current label and color category.
- Confidence level.
- Top 2-3 reasons.
- Optional dimension scores.
- Scoring source: rules or gemini.
- Whether a Gemini upgrade is pending, complete, unavailable, or disabled.
- Feedback actions: "Agree," "Disagree," and "Not useful."
- Relevant settings shortcuts.

The popover must:

- Open next to the clicked Signal Sticker.
- Close on outside click, escape, or opening another sticker.
- Stay within the viewport where possible.
- Avoid covering LinkedIn's primary post/comment actions where possible.
- Degrade gracefully if positioning fails.

### 13.5 User Settings

Users must be able to configure:

- Signal Sticker visibility
- Post sticker visibility
- Comment sticker visibility
- Filtering mode
- Strictness level
- Whether low-signal content is hidden, collapsed, or dimmed
- Whether weekly summaries are enabled
- Whether private on-device AI enhancement is enabled, disabled, unavailable, or downloading
- Clear cache / delete all local data

Settings should live in the extension popup for MVP. A Chrome side panel may be added later for diagnostics or deeper analysis, but it is not required for MVP.

### 13.6 Local Storage

The product must store MVP data locally:

- `chrome.storage.local` for settings, model state, and small cache entries.
- IndexedDB for larger score caches, saved insights, and weekly aggregate counters.
- Content hashes and labels by default, not raw LinkedIn text.
- Time-limited cache entries with eviction by age and size.
- User-triggered clear-data control.

### 13.7 Account and Billing

Account creation, server-backed billing, and remote entitlement checks are not required for the local-first MVP.

For paid validation, the product may use lightweight gating outside the core scoring path. Any future paid plan must preserve the local-first privacy promise unless the user explicitly opts into server-backed team features.

## 14. Non-Functional Requirements

### 14.1 Performance

- The extension should not noticeably slow LinkedIn browsing.
- DOM observation should be efficient and debounced.
- Scoring should be batched where possible.
- Cached results should be reused when the same content appears again.
- Only visible or near-visible items should be prioritized for scoring.
- Rules-based stickers should appear quickly and may be upgraded asynchronously by Gemini.
- Gemini prompts should be concurrency-limited and should not block feed scrolling.
- The overlay should use compositing-friendly positioning and avoid LinkedIn layout reflows.

### 14.2 Privacy

- Collect the minimum text required for scoring.
- Do not store full LinkedIn feed history by default.
- Do not sell personal LinkedIn browsing data.
- Provide clear privacy disclosure.
- Allow users to delete all local data.
- Process MVP scoring on-device.
- Store content hashes, labels, scores, and aggregate counters by default.
- Store raw LinkedIn text only for explicit user-saved insights, if needed.
- Do not send raw LinkedIn post or comment text to a backend for MVP scoring.

### 14.3 Reliability

- The extension should gracefully handle LinkedIn DOM changes.
- If scoring fails, LinkedIn should continue working normally.
- UI overlays should fail silently rather than blocking content.
- LinkedIn DOM knowledge should be isolated in a dedicated adapter so selector changes do not spread through the codebase.
- The product should support rules-only mode whenever Gemini is unavailable, downloading, slow, or failing.
- Invalid Gemini output should be ignored, repaired, or replaced with the existing rules-based result.

### 14.4 Security

- Do not embed external model API keys in the extension for MVP.
- Avoid remote network calls for scoring in the MVP.
- Use least-privilege extension permissions.
- Protect any future account or billing tokens using Chrome extension storage best practices.
- Ensure feedback and saved insight data remain local unless the user explicitly opts into sync or team features.

## 15. Monetization Strategy

### 15.1 Recommended Initial Pricing

Start with freemium:

Free:

- Rules-based Signal Stickers
- Basic labels
- Basic explanations
- Basic dimming controls
- Local data controls

Pro Individual: $10-$15/month

- Advanced filters
- Comment quality analysis
- Weekly signal report
- Saved high-signal posts
- Segment-specific workflows for sales, recruiting, or creators

Sales/Recruiting Pro: $25-$50/month

- Prospect activity analysis
- Saved lead/candidate insights
- Advanced explanation
- Export to CSV
- Early CRM/ATS workflow hooks

Creator Pro: $19-$49/month

- Comment authenticity report
- High-quality commenter identification
- Audience quality trends
- Post-level engagement quality

### 15.2 Future B2B Pricing

Team Plan: $30-$75/user/month

- Shared workspaces
- Team dashboards
- Admin controls
- CRM integrations
- Team-level usage analytics

Brand/Market Intelligence: $199-$999/month

- Topic dashboards
- Competitor conversation quality
- Category-level AI noise tracking
- Reports and exports

API:

- Usage-based pricing by scored item
- Volume discounts
- Enterprise contracts

Note: the local-first MVP should not depend on server-enforced usage limits. Paid packaging should initially focus on workflow value, such as advanced filtering, saved insights, reports, and segment-specific analysis. Server-backed entitlements can be introduced later if paid validation requires them.

### 15.3 Monetization Hypotheses

1. Casual users will adopt but not pay enough to sustain the company.
2. Sales and recruiting users will pay if the product helps them prioritize outreach or evaluation.
3. Creators will pay if the product provides actionable audience insight, not just vanity scoring.
4. Brand teams will pay if the product creates a new category of market intelligence.

## 16. Go-To-Market Strategy

### 16.1 Initial GTM

Launch as a Chrome extension for LinkedIn power users.

Channels:

- Founder-led LinkedIn posts
- Product Hunt
- Creator partnerships
- Sales community posts
- Recruiting community posts
- Short demo videos showing feed cleanup
- Waitlist with segment-specific landing pages

### 16.2 Landing Page Positioning Tests

Test multiple messages:

1. "Filter AI-generated LinkedIn noise."
2. "Make LinkedIn useful again."
3. "Find real human signal on LinkedIn."
4. "Prioritize authentic prospect activity."
5. "Measure the quality of your LinkedIn engagement."

Likely best B2B positioning:

> Find real buying, hiring, and relationship signals hidden inside noisy LinkedIn activity.

### 16.3 Validation Interviews

Interview:

- 10 salespeople
- 10 recruiters
- 10 creators/founders
- 5 marketing or brand leaders

Key interview questions:

- How do you use LinkedIn today?
- What content feels low-value or fake?
- Does AI-generated content create real workflow pain?
- How do you currently judge authenticity?
- What decisions would improve if you could measure authenticity?
- Would you pay for this personally or through work?
- What would make this a must-have rather than a nice-to-have?

## 17. Success Metrics

### 17.1 Activation Metrics

- Extension installed
- LinkedIn session with scoring enabled
- Number of posts/comments scanned
- User expands at least one explanation
- User changes filter settings
- User hides or dims low-signal content
- User returns for a second LinkedIn session

### 17.2 Engagement Metrics

- Weekly active users
- Scans per active user
- Filter actions per active user
- Explanation click-through rate
- Saved insights
- Weekly report open rate
- Retention after 1, 2, and 4 weeks

### 17.3 Monetization Metrics

- Free-to-paid conversion
- Trial start rate
- Trial-to-paid conversion
- Monthly churn
- Expansion to team plan
- Willingness-to-pay by segment

### 17.4 Quality Metrics

- User agreement with labels
- False-positive complaint rate
- "This helped me" feedback rate
- Manual rating of explanation usefulness
- Model latency
- Error rate by LinkedIn page type

## 18. MVP Validation Plan

### Phase 1: Demand Validation

Duration: 1-2 weeks

Activities:

- Create landing page with waitlist.
- Test 3-5 positioning variants.
- Post demos or mockups on LinkedIn.
- Conduct customer interviews.
- Ask for payment intent, not just interest.

Success criteria:

- 200+ waitlist signups or 30+ high-intent target users.
- At least 10 users agree to a paid beta or strong follow-up.
- One segment shows clearly stronger pain than the others.

### Phase 2: Concierge Prototype

Duration: 1-2 weeks

Activities:

- Manually analyze LinkedIn posts/comments for beta users.
- Send weekly signal reports.
- Test which insights users actually value.
- Ask users what they would pay for.

Success criteria:

- Users ask for repeated analysis.
- Users change behavior based on insights.
- At least 3-5 users agree to pay for continued access.

### Phase 3: Chrome Extension MVP

Duration: 4-6 weeks

Activities:

- Build local-first Manifest V3 extension.
- Add overlay-root Signal Sticker rendering.
- Add rules-based post and comment scoring.
- Add local settings and cache.
- Add filtering controls.
- Add inline explanation popover experience.
- Add Gemini Nano availability/status exploration if feasible.
- Release to small beta group.

Success criteria:

- 40%+ of beta users activate.
- 25%+ use it in week two.
- Users agree with labels at least 70% of the time.
- Rules-only mode is useful without Gemini.
- LinkedIn browsing performance remains acceptable.
- At least one segment has clear willingness to pay.

### Phase 4: Paid Beta

Duration: 4-8 weeks

Activities:

- Introduce pricing.
- Test individual and segment-specific plans.
- Add lightweight billing or paid-beta access outside the core local scoring path.
- Measure conversion and retention.

Success criteria:

- 5-10 paying users from initial cohort.
- At least one B2B team trial.
- Evidence that the product changes user workflow.

## 19. Competitive Landscape

### 19.1 Direct Competitors

Potential direct competitors:

- AI text detectors
- Browser extensions that flag AI-generated text
- Social media bot detection tools

Weakness of direct competitors:

- Binary AI detection is unreliable.
- Many products are not workflow-specific.
- Few are focused on LinkedIn-specific professional use cases.

### 19.2 Indirect Competitors

Indirect competitors:

- LinkedIn Sales Navigator
- Apollo
- Clay
- ZoomInfo
- Shield Analytics
- Taplio
- AuthoredUp
- Hypefury
- Brandwatch
- Sprout Social
- Meltwater

Differentiation:

- Existing tools help users find contacts, publish content, or monitor volume.
- This product focuses on authenticity, originality, and signal quality.

## 20. Risks and Mitigations

### 20.1 Detection Accuracy Risk

Risk:

AI detection is unreliable, and false positives can damage trust.

Mitigation:

- Avoid definitive claims.
- Use multi-dimensional signal labels.
- Provide explanations.
- Allow user feedback.
- Use confidence levels.

### 20.2 Platform Dependency Risk

Risk:

LinkedIn may change its DOM, restrict extensions, or enforce platform rules.

Mitigation:

- Keep extension resilient to layout changes.
- Use a single overlay root instead of injecting stickers into LinkedIn's component tree.
- Isolate LinkedIn-specific DOM logic in a dedicated adapter.
- Prefer accessibility attributes and defensive fallback selectors over brittle class names.
- Avoid prohibited automation.
- Analyze only content the user has already loaded.
- Minimize data collection.
- Explore standalone workflows and API-like inputs over time.

### 20.3 Willingness-to-Pay Risk

Risk:

Users may complain about AI content but not pay to filter it.

Mitigation:

- Focus on users who make money from LinkedIn.
- Test payment early.
- Build toward sales, recruiting, and creator workflows.

### 20.4 Trust and Reputation Risk

Risk:

Users may object to being labeled as AI-generated.

Mitigation:

- Keep scoring private to the viewer.
- Avoid public labels.
- Use cautious language.
- Focus on content quality, not person-level judgment.

### 20.5 Data Privacy Risk

Risk:

Users may be uncomfortable with LinkedIn content being processed.

Mitigation:

- Be transparent about what is processed.
- Avoid storing unnecessary content.
- Provide deletion controls.
- Keep MVP scoring on-device.
- Store hashes, labels, and aggregate counters by default.
- Do not send raw LinkedIn content to a backend for MVP scoring.
- Make saved insights opt-in.

### 20.6 Local AI Availability Risk

Risk:

Chrome's on-device Gemini Nano may be unavailable, downloading, slow, or unsupported on some user devices.

Mitigation:

- Make the deterministic rules engine the baseline product experience.
- Treat Gemini as enhancement, not a dependency.
- Show clear model status in the extension popup settings.
- Continue in rules-only mode when Gemini is unavailable.
- Avoid promising model-enhanced analysis in environments where Chrome does not support it.

### 20.7 Performance Risk

Risk:

Inline stickers, DOM observation, and local AI inference may slow LinkedIn browsing.

Mitigation:

- Score only visible or near-visible content.
- Batch and debounce DOM observation.
- Cap active tracked stickers.
- Use overlay positioning that avoids LinkedIn layout reflows.
- Limit concurrent Gemini prompts.
- Cache results by content hash.

## 21. Open Questions

1. Which segment feels the strongest pain: sales, recruiting, creators, or casual users?
2. Will users pay for feed cleanup alone, or only for workflow-specific insights?
3. What level of accuracy is required for users to trust the product?
4. Which extension context should host Prompt API sessions most reliably: offscreen document, popup-triggered extension document, or side panel as a technical fallback?
5. How available and fast is Gemini Nano on the target user's Chrome/device setup?
6. Should Gemini rescore every item or only rules-uncertain items?
7. How stable are LinkedIn DOM selectors across feed, detail, comment, and profile activity surfaces?
8. What labels feel useful without sounding accusatory?
9. Is the best first use case feed filtering, comment analysis, prospect analysis, or creator analytics?
10. Can the product create enough value without CRM, ATS, or analytics integrations?
11. What is the right pricing floor for individual users?
12. Would teams buy this as a standalone product or only as a feature inside an existing sales/recruiting stack?

## 22. Product Roadmap

### V0: Validation

- Landing page
- Mockups
- Customer interviews
- Concierge analysis
- Waitlist

### V1: Chrome Extension MVP

- Manifest V3 extension shell
- TypeScript, Vite, and Preact UI foundation
- Content script and LinkedIn DOM adapter
- Single overlay root for Signal Sticker rendering
- Rules-only scoring engine
- Post and comment Signal Stickers
- Inline explanation popovers
- Extension popup quick settings
- Local settings storage
- Basic filter controls

### V1.5: Paid Prosumer

- Gemini Nano availability detection and private on-device enhancement
- Model status and download progress UX
- Local score cache
- Weekly reports
- Saved insights
- Clear-data controls
- Creator comment reports
- Segment-specific onboarding

### V2: Team Workflows

- Team accounts
- Shared saved insights
- CRM export
- CSV export
- Prospect/candidate pages
- Admin controls

### V3: Intelligence Platform

- Topic-level dashboards
- Brand and competitor monitoring
- Optional API access
- Enterprise reporting
- Cross-platform support

## 23. MVP Acceptance Criteria

The MVP is ready for beta when:

- Users can install the extension and use it on LinkedIn.
- Visible feed posts receive color + label Signal Stickers.
- Supported comments receive smaller color + label Signal Stickers.
- Stickers support loading, labeled, unclear, and unavailable states.
- Stickers are rendered through a single overlay root without being injected into LinkedIn post/comment nodes.
- Rules-based scoring produces initial sticker labels without a backend.
- Users can click a sticker to open an inline popover and see the label explanation, top reasons, confidence level, and scoring source.
- Users can hide, dim, or highlight content based on settings.
- Users can separately enable or disable post stickers and comment stickers.
- Basic user settings persist across sessions.
- Local cache stores hashes and score metadata instead of raw feed history.
- Users can clear local cache/data.
- If Gemini Nano is unavailable or disabled, the product continues in rules-only mode.
- Scoring latency is acceptable for normal browsing.
- Failures do not break LinkedIn.
- Privacy policy and data handling disclosures are available.

## 24. Recommended Next Step

Do not begin with a full B2B dashboard. Start with a focused Chrome extension and a validation process that quickly answers the most important business question:

> Who will pay for LinkedIn authenticity intelligence, and what decision does it improve enough to justify recurring spend?

The first build should optimize for learning:

- Which labels users trust
- Which workflows users repeat
- Which segment retains
- Which users will pay
- Whether "AI detection" or "signal intelligence" resonates more strongly

If the product is only a curiosity tool, it will likely struggle. If it becomes a decision-support layer for sales, recruiting, creators, or brand teams, it has a much stronger chance of meaningful product-market fit.
