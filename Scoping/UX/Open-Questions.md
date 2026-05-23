# Open UX Questions

Unresolved questions across all UX components. Update this file as decisions are made and move resolved items into the relevant component doc.

---

## Labels

1. Should "Can't Tell" stickers be shown by default, or hidden to reduce noise?

## Stickers

2. What animation or transition should stickers use when appearing or upgrading from "Scoring..." to a final label?
3. Should stickers have a subtle entrance animation (fade-in, scale-up) or appear instantly?

## Sticker Dismissal

4. Should the minimized dot pulse or glow briefly when first created, so the user knows where it went?
5. Should there be a global "show all hidden stickers" action in the popup for users who dismissed many stickers?

## Popover

6. Should the popover include a "Why this label?" link to a help page explaining the methodology?
7. Should the popover show a "Report" or "Flag" option for content the user thinks is mislabeled?

## Popup

8. Should the live summary include comments separately, or combine posts and comments into one count?
9. Should clicking a label row in the summary (e.g., "Feels Human: 4") scroll to or highlight those posts on the LinkedIn page?
10. Should the popup remember which collapsible sections were open/closed?
11. ~~Should there be an onboarding state for first-time users explaining what the stickers mean?~~ **Resolved:** Yes. The popup's Enhanced analysis section shows an onboarding guide when AI is not enabled, and sticker info icons link to it. See Popup.md "Enhanced Analysis: Onboarding Flow."
12. What icon should the master toggle use? A simple circle toggle, or a branded on/off graphic?

## General

13. Should users be able to customize which labels trigger dimming/hiding, beyond the sensitivity slider?
14. Should there be a first-run tutorial overlay on LinkedIn showing what stickers mean?
