import type { SelectorStrategy } from '@/linkedin-adapter/types';

export const POST_CONTAINER_STRATEGIES: readonly SelectorStrategy[] = [
  {
    name: 'data-urn-article',
    selectors: ['article[data-urn*="urn:li:activity"]'],
  },
  {
    name: 'feed-update-card',
    selectors: ['.feed-shared-update-v2'],
  },
  {
    name: 'test-id-post-container',
    selectors: ['[data-test-id="post-container"]', '[data-testid="post-container"]'],
  },
];

export const POST_TEXT_STRATEGIES: readonly SelectorStrategy[] = [
  {
    name: 'commentary-region',
    selectors: [
      '[data-test-id="main-feed-activity-card__commentary"]',
      '[data-testid="main-feed-activity-card__commentary"]',
    ],
  },
  {
    name: 'feed-description',
    selectors: ['.feed-shared-update-v2__description', '.update-components-text'],
  },
  {
    name: 'visible-ltr-block',
    selectors: ['[dir="ltr"]'],
  },
];

export const COMMENT_CONTAINER_STRATEGIES: readonly SelectorStrategy[] = [
  {
    name: 'comment-id',
    selectors: ['[data-comment-id]'],
  },
  {
    name: 'comment-item',
    selectors: ['article.comments-comment-item', '.comments-comment-item'],
  },
  {
    name: 'test-id-comment',
    selectors: ['[data-test-id="comment-container"]', '[data-testid="comment-container"]'],
  },
];

export const COMMENT_TEXT_STRATEGIES: readonly SelectorStrategy[] = [
  {
    name: 'comment-text',
    selectors: ['.comments-comment-item__main-content', '[data-test-id="comment-text"]'],
  },
  {
    name: 'visible-ltr-block',
    selectors: ['[dir="ltr"]'],
  },
];

export function queryByStrategies(
  root: ParentNode,
  strategies: readonly SelectorStrategy[],
): readonly HTMLElement[] {
  const uniqueElements: Set<HTMLElement> = new Set();

  for (const strategy of strategies) {
    for (const selector of strategy.selectors) {
      for (const element of Array.from(root.querySelectorAll<HTMLElement>(selector))) {
        uniqueElements.add(element);
      }
    }
  }

  return Array.from(uniqueElements);
}

export function findFirstByStrategies(
  root: ParentNode,
  strategies: readonly SelectorStrategy[],
): HTMLElement | null {
  const elements: readonly HTMLElement[] = queryByStrategies(root, strategies);
  return elements[0] ?? null;
}

export function getFirstSuccessfulStrategyName(
  root: ParentNode,
  strategies: readonly SelectorStrategy[],
): string | null {
  for (const strategy of strategies) {
    const hasMatch: boolean = strategy.selectors.some((selector: string): boolean => {
      return root.querySelector(selector) !== null;
    });

    if (hasMatch) {
      return strategy.name;
    }
  }

  return null;
}
