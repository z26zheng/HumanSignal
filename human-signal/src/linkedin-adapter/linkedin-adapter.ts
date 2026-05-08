import { resolveCommentId, resolvePostId } from '@/linkedin-adapter/ids';
import { getPageType } from '@/linkedin-adapter/page-type';
import {
  COMMENT_CONTAINER_STRATEGIES,
  COMMENT_TEXT_STRATEGIES,
  POST_CONTAINER_STRATEGIES,
  POST_TEXT_STRATEGIES,
  findFirstByStrategies,
  getFirstSuccessfulStrategyName,
  queryByStrategies,
} from '@/linkedin-adapter/strategies';
import { extractText } from '@/linkedin-adapter/text-extraction';
import { logger } from '@/shared/logger';
import { safeCatch } from '@/shared/safe-catch';

import type {
  AdapterObserverConfig,
  DetectedComment,
  DetectedPost,
  LinkedInPageType,
} from '@/linkedin-adapter/types';

export class LinkedInAdapter {
  private readonly root: Document;
  private readonly detectionHistory: boolean[] = [];

  public constructor(root: Document = document) {
    this.root = root;
  }

  public getPageType(url: string = this.root.location?.href ?? ''): LinkedInPageType {
    return getPageType(url);
  }

  public detectPosts(): readonly DetectedPost[] {
    return safeCatch((): readonly DetectedPost[] => {
      const postElements: readonly HTMLElement[] = queryByStrategies(
        this.root,
        POST_CONTAINER_STRATEGIES,
      ).filter((element: HTMLElement): boolean => !isInsideCommentSection(element));
      const posts: readonly DetectedPost[] = postElements
        .map((element: HTMLElement): DetectedPost | null => this.createDetectedPost(element))
        .filter((post: DetectedPost | null): post is DetectedPost => post !== null);

      this.recordDetection(posts.length > 0);
      this.logDetection('posts', posts.length, getFirstSuccessfulStrategyName(this.root, POST_CONTAINER_STRATEGIES));
      return posts;
    }, [], 'linkedinAdapter.detectPosts');
  }

  public detectComments(): readonly DetectedComment[] {
    return safeCatch((): readonly DetectedComment[] => {
      const rawElements: readonly HTMLElement[] = queryByStrategies(this.root, COMMENT_CONTAINER_STRATEGIES);
      const commentElements: readonly HTMLElement[] = deduplicateByComponentKey(rawElements);

      logger.info('linkedinAdapter.comments', 'Comment detection', {
        rawCount: rawElements.length,
        dedupedCount: commentElements.length,
      });

      const comments: readonly DetectedComment[] = commentElements
        .map((element: HTMLElement): DetectedComment | null => {
          try {
            return this.createDetectedComment(element);
          } catch (error: unknown) {
            logger.error('linkedinAdapter.commentCreate', error, {
              componentkey: element.getAttribute('componentkey')?.slice(0, 60) ?? 'none',
            });
            return null;
          }
        })
        .filter((comment: DetectedComment | null): comment is DetectedComment => comment !== null);

      this.logDetection(
        'comments',
        comments.length,
        getFirstSuccessfulStrategyName(this.root, COMMENT_CONTAINER_STRATEGIES),
      );
      return comments;
    }, [], 'linkedinAdapter.detectComments');
  }

  public extractText(element: HTMLElement): string {
    return safeCatch((): string => extractText(element), '', 'linkedinAdapter.extractText');
  }

  public hasElementContentChanged(element: HTMLElement, previousText: string): boolean {
    return safeCatch(
      (): boolean => this.extractText(element) !== previousText.trim(),
      false,
      'linkedinAdapter.hasElementContentChanged',
    );
  }

  public isElementConnected(element: HTMLElement): boolean {
    return element.isConnected;
  }

  public getObserverConfig(): AdapterObserverConfig {
    return {
      feedContainerSelector: 'main, [role="main"], body',
      observerOptions: {
        childList: true,
        subtree: true,
      },
    };
  }

  public isAdapterHealthy(): boolean {
    if (this.detectionHistory.length < 3) {
      return true;
    }

    return this.detectionHistory.some((hasDetectedPosts: boolean): boolean => hasDetectedPosts);
  }

  private createDetectedPost(element: HTMLElement): DetectedPost | null {
    const textElement: HTMLElement | null = findFirstPostText(element);

    if (textElement === null) {
      return null;
    }

    const text: string = extractText(textElement);

    if (text === '') {
      return null;
    }

    const resolvedId = resolvePostId(element, text);

    return {
      element,
      textElement,
      text,
      postId: resolvedId.postId,
      postIdMethod: resolvedId.method,
      isTruncated: hasSeeMoreControl(element),
    };
  }

  private createDetectedComment(element: HTMLElement): DetectedComment | null {
    const textElement: HTMLElement | null = findFirstByStrategies(element, COMMENT_TEXT_STRATEGIES);

    if (textElement === null) {
      logger.debug('linkedinAdapter.commentSkip', 'No text element found for comment', {
        componentkey: element.getAttribute('componentkey')?.slice(0, 60) ?? 'none',
      });
      return null;
    }

    const text: string = extractText(textElement);

    if (text === '') {
      logger.debug('linkedinAdapter.commentSkip', 'Empty text for comment', {
        componentkey: element.getAttribute('componentkey')?.slice(0, 60) ?? 'none',
      });
      return null;
    }

    const parentPost: DetectedPost | null = this.findParentPost(element);
    const parentPostId: string = parentPost?.postId ?? 'unknown-post';

    return {
      element,
      textElement,
      text,
      commentId: resolveCommentId(element, text, parentPostId),
      parentPostId,
    };
  }

  private findParentPost(element: HTMLElement): DetectedPost | null {
    try {
      const postContainer: HTMLElement | null = POST_CONTAINER_STRATEGIES.flatMap(
        (strategy) => strategy.selectors,
      ).reduce<HTMLElement | null>((foundElement: HTMLElement | null, selector: string): HTMLElement | null => {
        return foundElement ?? element.closest<HTMLElement>(selector);
      }, null);

      return postContainer === null ? null : this.createDetectedPost(postContainer);
    } catch {
      return null;
    }
  }

  private recordDetection(hasDetectedPosts: boolean): void {
    this.detectionHistory.push(hasDetectedPosts);

    if (this.detectionHistory.length > 3) {
      this.detectionHistory.shift();
    }
  }

  private logDetection(kind: 'posts' | 'comments', count: number, strategyName: string | null): void {
    logger.info('linkedinAdapter.detect', 'LinkedIn adapter detection completed', {
      kind,
      count,
      strategy: strategyName ?? 'none',
    });
  }
}

function findFirstPostText(postElement: HTMLElement): HTMLElement | null {
  const candidates: readonly HTMLElement[] = queryByStrategies(postElement, POST_TEXT_STRATEGIES);

  for (const candidate of candidates) {
    if (candidate.closest('[componentkey*="replaceableComment"]') !== null ||
        candidate.closest('[componentkey*="commentsSectionContainer"]') !== null) {
      continue;
    }

    return candidate;
  }

  return null;
}

function isInsideCommentSection(element: HTMLElement): boolean {
  return element.closest('[componentkey*="commentsSectionContainer"]') !== null ||
    element.closest('[componentkey*="replaceableComment"]') !== null;
}

function deduplicateByComponentKey(elements: readonly HTMLElement[]): readonly HTMLElement[] {
  const seen: Set<string> = new Set();
  const result: HTMLElement[] = [];

  for (const element of elements) {
    const key: string | null = element.getAttribute('componentkey');

    if (key === null || key.trim() === '') {
      result.push(element);
      continue;
    }

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(element);
  }

  return result;
}

function hasSeeMoreControl(element: HTMLElement): boolean {
  const controls: HTMLElement[] = Array.from(element.querySelectorAll<HTMLElement>('button, a'));

  return controls.some((control: HTMLElement): boolean => {
    const text: string = control.textContent?.trim().toLowerCase() ?? '';
    const ariaLabel: string = control.getAttribute('aria-label')?.trim().toLowerCase() ?? '';
    return text === 'see more' || ariaLabel === 'see more';
  });
}
