import { createContentHash } from '@/shared/hash';

import type { ContentHash } from '@/shared/types';
import type { PostIdMethod } from '@/linkedin-adapter/types';

export interface ResolvedPostId {
  readonly postId: string;
  readonly method: PostIdMethod;
  readonly contentHash: ContentHash;
}

const ACTIVITY_URN_PATTERN: RegExp = /urn:li:activity:\d+/i;
const ACTIVITY_ID_PATTERN: RegExp = /activity[-:](\d+)/i;

export function resolvePostId(element: HTMLElement, text: string): ResolvedPostId {
  const contentHash: ContentHash = createContentHash(text);
  const dataUrn: string | null = findDataUrn(element);

  if (dataUrn !== null) {
    return {
      postId: dataUrn,
      method: 'urn',
      contentHash,
    };
  }

  const componentKey: string | null = element.getAttribute('componentkey');

  if (componentKey !== null && componentKey.trim() !== '') {
    return {
      postId: `ck_${createContentHash(componentKey)}`,
      method: 'permalink',
      contentHash,
    };
  }

  const permalink: string | null = findPermalink(element);

  if (permalink !== null) {
    return {
      postId: `permalink_${createContentHash(permalink)}`,
      method: 'permalink',
      contentHash,
    };
  }

  return {
    postId: contentHash,
    method: 'contentHash',
    contentHash,
  };
}

export function resolveCommentId(element: HTMLElement, text: string, parentPostId: string): string {
  const explicitId: string | null =
    element.getAttribute('data-comment-id') ??
    element.getAttribute('data-urn') ??
    (element.id || null);

  if (explicitId !== null && explicitId.trim() !== '') {
    return explicitId.trim();
  }

  const componentKey: string | null = element.getAttribute('componentkey');
  const commentUrnMatch: RegExpMatchArray | null = componentKey?.match(/urn:li:comment:\([^)]+\)/) ?? null;

  if (commentUrnMatch?.[0] !== undefined) {
    return commentUrnMatch[0];
  }

  return `comment_${parentPostId}_${createContentHash(text)}`;
}

function findDataUrn(element: HTMLElement): string | null {
  const directUrn: string | null = element.getAttribute('data-urn');

  if (directUrn !== null && ACTIVITY_URN_PATTERN.test(directUrn)) {
    return directUrn;
  }

  const urnElement: Element | null = element.querySelector('[data-urn*="urn:li:activity"]');
  const nestedUrn: string | null = urnElement?.getAttribute('data-urn') ?? null;

  return nestedUrn !== null && ACTIVITY_URN_PATTERN.test(nestedUrn) ? nestedUrn : null;
}

function findPermalink(element: HTMLElement): string | null {
  const links: HTMLAnchorElement[] = Array.from(element.querySelectorAll<HTMLAnchorElement>('a[href]'));

  for (const link of links) {
    const href: string = link.href;
    const urnMatch: RegExpMatchArray | null = href.match(ACTIVITY_URN_PATTERN);

    if (urnMatch?.[0] !== undefined) {
      return urnMatch[0];
    }

    const activityMatch: RegExpMatchArray | null = href.match(ACTIVITY_ID_PATTERN);

    if (activityMatch?.[1] !== undefined) {
      return `activity-${activityMatch[1]}`;
    }

    if (href.includes('/feed/update/') || href.includes('/posts/')) {
      return href;
    }
  }

  return null;
}
