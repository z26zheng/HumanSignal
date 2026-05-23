# Colors

## Decision: Soft Professional Palette

Date: 2026-05-08

## Label Colors

| Label | Hex | Rationale |
|-------|-----|-----------|
| Feels Human | `#22c55e` | Warm friendly green. Not neon. Signals "good to read." |
| Possibly AI | `#eab308` | Amber/gold. Distinct from both green and orange. Signals caution without alarm. |
| Likely AI | `#f97316` | Clear orange. Signals "probably skip." |
| Almost Certainly AI | `#ef4444` | Soft red. Not aggressive. Signals "noise." |
| Can't Tell | `#9ca3af` | Neutral gray. Signals "no opinion." |

## Brand Colors

| Use | Hex | Notes |
|-----|-----|-------|
| Brand accent | `#2563eb` | Used for logo, active toggle, links |
| Background (light) | `#f8fafc` | |
| Background (dark) | `#0f172a` | |
| Card surface (light) | `#ffffff` | |
| Card surface (dark) | `#111827` | |
| Border (light) | `#e2e8f0` | |
| Border (dark) | `#334155` | |
| Muted text (light) | `#64748b` | |
| Muted text (dark) | `#94a3b8` | |

## Accessibility Rules

- Labels must never rely on color alone. Every sticker contains both a colored background and a text label.
- Text contrast must be readable against each background color.
- For colorblind users, the text label does all the work. Colors are secondary reinforcement.
- Test all label colors against WCAG AA contrast requirements for the text rendered on top of them.
