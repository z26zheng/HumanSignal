import { SignalSticker } from '@/overlay/signal-sticker';

const CONNECTION_PATTERN: RegExp = /[•·]\s*(1st|2nd|3rd\+?)/;
const TIMESTAMP_PATTERN: RegExp = /^\d+[hdwm]$/;

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
    const positions: Array<{
      readonly sticker: SignalSticker;
      readonly x: number;
      readonly y: number;
      readonly isVisible: boolean;
    }> = [];

    for (const trackedItem of this.trackedItems.values()) {
      const containerRect: DOMRect = trackedItem.element.getBoundingClientRect();

      if (containerRect.width === 0 || containerRect.height === 0 ||
          containerRect.bottom < 0 || containerRect.top > window.innerHeight) {
        positions.push({ sticker: trackedItem.sticker, x: 0, y: 0, isVisible: false });
        continue;
      }

      const anchor: HTMLElement | null = findAnchorElement(trackedItem);
      if (anchor !== null) {
        const anchorRect: DOMRect = anchor.getBoundingClientRect();
        positions.push({
          sticker: trackedItem.sticker,
          x: anchorRect.right + 6,
          y: anchorRect.top + (anchorRect.height - 24) / 2,
          isVisible: true,
        });
      } else {
        positions.push({
          sticker: trackedItem.sticker,
          ...calculateFallbackPosition(containerRect, trackedItem.itemType),
        });
      }
    }

    for (const position of positions) {
      if (!position.isVisible) {
        position.sticker.setViewportVisible(false);
        continue;
      }

      position.sticker.setPosition(position.x, position.y);
      position.sticker.setViewportVisible(true);
    }

    this.animationFrameId = requestAnimationFrame((): void => this.syncFrame());
  }
}

const ANCHOR_SEARCH_INTERVAL_MS: number = 1000;

function findAnchorElement(tracked: TrackedItem): HTMLElement | null {
  if (tracked.cachedAnchor !== null && tracked.cachedAnchor.isConnected) {
    return tracked.cachedAnchor;
  }

  tracked.cachedAnchor = null;

  const now: number = Date.now();
  if (now - tracked.lastAnchorSearch < ANCHOR_SEARCH_INTERVAL_MS) {
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

  const promotedAnchor: HTMLElement | null = findPromotedOrFollowersAnchor(container, containerRect);
  if (promotedAnchor !== null) {
    return promotedAnchor;
  }

  return findConnectionBadgeAnchor(container, containerRect, 50);
}

function findConnectionBadgeAnchor(
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

function findCommentAnchor(container: HTMLElement): HTMLElement | null {
  const containerRect: DOMRect = container.getBoundingClientRect();
  const candidates: NodeListOf<HTMLElement> = container.querySelectorAll('span, p, div');

  for (const el of candidates) {
    const rect: DOMRect = el.getBoundingClientRect();
    const relY: number = rect.y - containerRect.y;
    if (relY < 0 || relY > 40 || rect.height === 0 || rect.width === 0) continue;

    const text: string = el.textContent?.trim() ?? '';
    if (text.length > 30 || el.children.length > 2) continue;

    if (CONNECTION_PATTERN.test(text)) {
      return el;
    }
  }

  return findTimestampAnchor(container, 40);
}

function findPromotedOrFollowersAnchor(container: HTMLElement, containerRect: DOMRect): HTMLElement | null {
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

function findTimestampLineAnchor(container: HTMLElement, containerRect: DOMRect): HTMLElement | null {
  const candidates: NodeListOf<HTMLElement> = container.querySelectorAll('p, div, span');

  for (const el of candidates) {
    const rect: DOMRect = el.getBoundingClientRect();
    const relY: number = rect.y - containerRect.y;
    if (relY < 50 || relY > 110 || rect.height === 0 || rect.width === 0) continue;

    const text: string = el.textContent?.trim() ?? '';
    if (text.length > 40 || el.children.length > 5) continue;

    if (/\d+[hdwm]\s*[•·]/.test(text) || /[•·]\s*Edited/.test(text)) {
      return el;
    }
  }

  return findTimestampAnchor(container, 110);
}

function findTimestampAnchor(container: HTMLElement, maxRelY: number): HTMLElement | null {
  const containerRect: DOMRect = container.getBoundingClientRect();
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

function calculateFallbackPosition(
  rect: DOMRect,
  itemType: 'post' | 'comment',
): { readonly x: number; readonly y: number; readonly isVisible: boolean } {
  const rightOffset: number = itemType === 'post' ? 56 : 12;
  const topOffset: number = itemType === 'post' ? 8 : 4;
  const x: number = rect.right - rightOffset;
  const y: number = rect.top + topOffset;

  if (x < rect.left || x > rect.right) {
    return { x: rect.left + 8, y: rect.top + 8, isVisible: true };
  }

  return { x, y, isVisible: true };
}
