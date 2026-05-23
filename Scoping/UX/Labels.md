# Labels

## Decision: Unified "Feels Human / Likely AI" Spectrum

Date: 2026-05-08

## Context

The original label system used separate taxonomies for posts and comments (High Signal, Specific, Thoughtful, Generic, Engagement Bait, etc.). This revealed two problems:

1. Labels like "Specific," "Mixed," and "Repeated" describe analytical dimensions. They do not answer the user's actual question: **"Is this worth my attention?"**
2. Two separate vocabularies (post labels vs comment labels) double the learning curve for no user benefit.

We also considered a pure binary "AI / Human" label. This is the clearest possible framing, but binary AI detection is unreliable. False positives on genuine human posts would damage trust and invite backlash.

## Decision

Use a single unified label set for both posts and comments. Frame labels as a confidence spectrum from "Feels Human" to "Almost Certainly AI." This gives users the AI-detection answer they want while using probabilistic language that protects the product from false-positive trust damage.

## Label Definitions

| Color | Label | Internal Key | Meaning |
|-------|-------|-------------|---------|
| Green | Feels Human | `feels-human` | Contains specific personal experience, concrete details, or original thinking |
| Yellow | Possibly AI | `possibly-ai` | Some signs of templated or AI-assisted writing, but also some personal context |
| Orange | Likely AI | `likely-ai` | Generic structure, no personal detail, matches common AI output patterns |
| Red | Almost Certainly AI | `almost-certainly-ai` | Strong engagement-bait or automated pattern, no human specificity at all |
| Gray | Can't Tell | `cant-tell` | Too short, too ambiguous, or insufficient text to classify confidently |

## Why These Specific Words

- **"Feels Human"** — uses sensory language, not a definitive claim. It's a compliment to the author, not a certification. Creators will appreciate rather than resent this label.
- **"Possibly AI"** — honest about uncertainty. Users understand "possibly" means "use your own judgment here."
- **"Likely AI"** — probabilistic, not absolute. If wrong, it's defensible: "likely" is an assessment, not an accusation.
- **"Almost Certainly AI"** — strongest negative label, but still hedged. Reserved for content with zero personal context and strong automation signals.
- **"Can't Tell"** — honest about the product's limitation, not a judgment of the author's writing quality. Avoids the word "Unclear," which could sound like criticism of the writing.

## What We Avoided

- **"AI Generated" / "Human Written"** — binary labels that will produce trust-destroying false positives.
- **"High Signal" / "Low Signal"** — jargon that normal LinkedIn users do not use.
- **"Engagement Bait"** — sounds like an accusation of the author's intent.
- **"Specific" / "Thoughtful"** — describes analytical dimensions, not a user-actionable verdict.
- Separate label sets for posts vs comments — unnecessary complexity.
