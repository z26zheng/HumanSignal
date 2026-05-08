import { SignalSticker } from '@/overlay/signal-sticker';

const CONNECTION_PATTERN: RegExp = /[•·]\s*(1st|2nd|3rd\+?)/;
const TIMESTAMP_PATTERN: RegExp = /^\d+[hdwm]$/;
const ANCHOR_RETRY_MS: number = 300;

interface TrackedItem {
  readonly itemType: 'post' | 'comment';
  readonly element: HTMLElement;
  readonly sticker: SignalSticker;
  cachedAnchor: HTMLElement | null;
  lastAnchorSearch: number;
}

export class PositionSync {
  private readonly trackedItems: Map<string, TrackedItem> = new Map();
  private animationFrameId: number | null = null;

  public startLoop(): void {
    if (this.animationFrameId !== null) {
      return;
    }

    this.animationFrameId = requestAnimationFrame((): void => this.syncFrame());
  }

  public stopLoop(): void {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  public addItem(
    itemId: string,
    itemType: 'post' | 'comment',
    element: HTMLElement,
    sticker: SignalSticker,
  ): void {
    this.trackedItems.set(itemId, {
      itemType,
      element,
      sticker,
      cachedAnchor: null,
      lastAnchorSearch: 0,
    });
  }

  public removeItem(itemId: string): void {
    this.trackedItems.delete(itemId);
  }

  private syncFrame(): void {
    for (const tracked of this.trackedItems.values()) {
      const containerRect: DOMRect = tracked.element.getBoundingClientRect();

      if (containerRect.width === 0 || containerRect.height === 0 ||
          containerRect.bottom < -200 || containerRect.top > window.innerHeight + 200) {
        tracked.sticker.setViewportVisible(false);
        continue;
      }

      const anchor: HTMLElement | null = getAnchor(tracked);

      if (anchor !== null) {
        const anchorRect: DOMRect = anchor.getBoundingClientRect();
        tracked.sticker.setPosition(anchorRect.right + 6, anchorRect.top + (anchorRect.height - 24) / 2);
      } else {
        const fallback = fallbackPosition(containerRect, tracked.itemType);
        tracked.sticker.setPosition(fallback.x, fallback.y);
      }

      tracked.sticker.setViewportVisible(true);
    }

    this.animationFrameId = requestAnimationFrame((): void => this.syncFrame());
  }
}

function getAnchor(tracked: TrackedItem): HTMLElement | null {
  if (tracked.cachedAnchor !== null && tracked.cachedAnchor.isConnected) {
    return tracked.cachedAnchor;
  }

  tracked.cachedAnchor = null;

  const now: number = Date.now();
  if (now - tracked.lastAnchorSearch < ANCHOR_RETRY_MS) {
    return null;
  }

  tracked.lastAnchorSearch = now;
  const anchor: HTMLElement | null = tracked.itemType === 'post'
    ? findPostAnchor(tracked.element)
    : findCommentAnchor(tracked.element);

  tracked.cachedAnchor = anchor;
  return anchor;
}

function findPostAnchor(container: HTMLElement): HTMLElement | null {
  const containerRect: DOMRect = container.getBoundingClientRect();

  const visibilityIcon: HTMLElement | null = findVisibilityIcon(container, containerRect);
  if (visibilityIcon !== null) {
    return visibilityIcon;
  }

  const followersAnchor: HTMLElement | null = findFollowersAnchor(container, containerRect);
  if (followersAnchor !== null) {
    return followersAnchor;
  }

  return findConnectionBadge(container, containerRect, 50);
}

function findCommentAnchor(container: HTMLElement): HTMLElement | null {
  const containerRect: DOMRect = container.getBoundingClientRect();
  return findConnectionBadge(container, containerRect, 40) ??
    findTimestamp(container, containerRect, 40);
}

function findVisibilityIcon(container: HTMLElement, containerRect: DOMRect): HTMLElement | null {
  const svgs: NodeListOf<SVGElement> = container.querySelectorAll('svg');

  for (const svg of svgs) {
    const rect: DOMRect = svg.getBoundingClientRect();
    const relY: number = rect.y - containerRect.y;
    if (relY < 30 || relY > 110 || rect.height === 0) continue;

    const ariaLabel: string = svg.getAttribute('aria-label') ?? '';
    if (ariaLabel.toLowerCase().startsWith('visibility:')) {
      return svg as unknown as HTMLElement;
    }
  }

  return null;
}

function findFollowersAnchor(container: HTMLElement, containerRect: DOMRect): HTMLElement | null {
  const candidates: NodeListOf<HTMLElement> = container.querySelectorAll('p, div, span');

  for (const el of candidates) {
    const rect: DOMRect = el.getBoundingClientRect();
    const relY: number = rect.y - containerRect.y;
    if (relY < 20 || relY > 120 || rect.height === 0 || rect.width === 0) continue;

    const text: string = el.textContent?.trim() ?? '';
    if (el.children.length > 1 || text.length > 30) continue;

    if (/^\d[\d,]*\s+followers$/.test(text)) {
      return el;
    }
  }

  return null;
}

function findConnectionBadge(
  container: HTMLElement,
  containerRect: DOMRect,
  maxRelY: number,
): HTMLElement | null {
  const candidates: NodeListOf<HTMLElement> = container.querySelectorAll('p, span, div');

  for (const el of candidates) {
    const rect: DOMRect = el.getBoundingClientRect();
    const relY: number = rect.y - containerRect.y;
    if (relY < 0 || relY > maxRelY || rect.height === 0 || rect.width === 0) continue;

    const text: string = el.textContent?.trim() ?? '';
    if (text.length > 30 || el.children.length > 2) continue;

    if (CONNECTION_PATTERN.test(text)) {
      return el;
    }
  }

  return null;
}

function findTimestamp(
  container: HTMLElement,
  containerRect: DOMRect,
  maxRelY: number,
): HTMLElement | null {
  const candidates: NodeListOf<HTMLElement> = container.querySelectorAll('p, span, div');

  for (const el of candidates) {
    const rect: DOMRect = el.getBoundingClientRect();
    const relY: number = rect.y - containerRect.y;
    if (relY < 0 || relY > maxRelY || rect.height === 0 || rect.width === 0) continue;

    const text: string = el.textContent?.trim() ?? '';
    if (TIMESTAMP_PATTERN.test(text)) {
      return el;
    }
  }

  return null;
}

function fallbackPosition(
  rect: DOMRect,
  itemType: 'post' | 'comment',
): { readonly x: number; readonly y: number } {
  const rightOffset: number = itemType === 'post' ? 56 : 12;
  const topOffset: number = itemType === 'post' ? 8 : 4;
  return { x: rect.right - rightOffset, y: rect.top + topOffset };
}
