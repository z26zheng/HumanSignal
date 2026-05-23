# Explanation Popover

## Decision: Short "Why" Explanation with Feedback

Date: 2026-05-08

## What It Does

When a user clicks a Signal Sticker, a compact inline popover appears near the sticker explaining why the content received that label.

## Popover Content

1. The label with colored indicator (e.g., 🟠 "Likely AI")
2. Top 2-3 reasons explaining the assessment
3. Confidence level (low / medium / high)
4. Scoring source (rules-based or on-device AI)
5. Feedback buttons: Agree, Disagree, Not Useful

## Example Explanations

**Feels Human:**
> Includes a personal anecdote with specific company context and a concrete outcome.

**Possibly AI:**
> Contains some personal framing but relies heavily on generic advice and listicle structure.

**Likely AI:**
> Broad motivational language with no personal example or verifiable detail. Matches common AI output patterns.

**Almost Certainly AI:**
> Two-word praise comment matching common automated engagement patterns.

**Can't Tell:**
> Too short to classify confidently.

## Tone Rules

- Explanations describe the **content**, not the **author**.
- Never say "this person used AI" or "this is fake."
- Always explain what signals were detected, not who is being judged.
- Use neutral, observational language: "no personal example" rather than "the author didn't include an example."

## Behavior

- Opens next to the clicked Signal Sticker.
- Only one popover open at a time. Opening a new one closes the previous.
- Closes on outside click, Escape key, or scrolling the item out of view.
- Stays within the viewport where possible.
- Avoids covering LinkedIn's primary post/comment action controls.
- If positioning fails, the popover closes gracefully rather than covering controls unpredictably.

## Rendering

- Rendered inside the extension overlay root, not inside LinkedIn's DOM tree.
- Uses `pointer-events: auto`; the overlay root remains `pointer-events: none`.
