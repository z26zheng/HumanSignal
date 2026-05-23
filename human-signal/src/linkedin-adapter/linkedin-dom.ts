/**
 * Single source of truth for LinkedIn DOM selectors and known strings.
 *
 * LinkedIn changes its DOM frequently. Centralize selectors here so the
 * blast radius of a DOM change is one file.
 */

export const LINKEDIN_DOM = {
  /** Selectors that identify the comments section container element. */
  COMMENTS_SECTION_COMPONENTKEY: 'commentsSectionContainer',
  /** Selectors that identify an individual comment container element. */
  REPLACEABLE_COMMENT_COMPONENTKEY: 'replaceableComment',
  /** Attribute selector for elements inside the comments section. */
  COMMENT_SECTION_SELECTOR: '[componentkey*="commentsSectionContainer"]',
  /** Attribute selector for individual comment containers. */
  REPLACEABLE_COMMENT_SELECTOR: '[componentkey*="replaceableComment"]',
  /** Top-level feed container selectors (fallback to body). */
  FEED_CONTAINER_SELECTOR: 'main, [role="main"], body',
  /** Text or aria-label indicating a "see more" expansion control. */
  SEE_MORE_TEXT: 'see more',
  /** Minimum width (px) for a real feed post container. Carousel preview cards are narrower. */
  MIN_POST_CONTAINER_WIDTH: 400,
} as const;
