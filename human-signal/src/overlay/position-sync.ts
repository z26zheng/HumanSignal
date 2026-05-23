import type { SignalSticker } from '@/overlay/signal-sticker';

export const CONNECTION_PATTERN: RegExp = /[•·]\s*(1st|2nd|3rd\+?)/;
export const TIMESTAMP_PATTERN: RegExp = /^\d+[hdwm]$/;
const ANCHOR_RETRY_MS: number = 300;
const MIN_POST_WIDTH_PX: number = 350;

interface TrackedItem {
  readonly itemId: string;
  readonly itemType: 'post' | 'comment';
  readonly element: HTMLElement;
  readonly sticker: SignalSticker;
  cachedAnchor: HTMLElement | null;
  lastAnchorSearch: number;
}

export type PositionCallback = (itemId: string, x: number, y: number, stickerWidth: number, isVisible: boolean) => void;

export class PositionSync {
  private readonly trackedItems: Map<string, TrackedItem> = new Map();
  private animationFrameId: number | null = null;
  private onPositionCallback: PositionCallback | null = null;

  public setOnPosition(callback: PositionCallback): void {
    this.onPositionCallback = callback;
  }

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
      itemId,
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

      const isTooNarrow: boolean = tracked.itemType === 'post' && containerRect.width < MIN_POST_WIDTH_PX;
      const isOffViewport: boolean =
        containerRect.width === 0 || containerRect.height === 0 ||
        containerRect.bottom < -200 || containerRect.top > window.innerHeight + 200;

      if (isOffViewport || isTooNarrow) {
        tracked.sticker.setViewportVisible(false);
        this.onPositionCallback?.(tracked.itemId, 0, 0, 0, false);
        continue;
      }

      const anchor: HTMLElement | null = getAnchor(tracked);
      let px: number;
      let py: number;

      if (anchor !== null) {
        const anchorRect: DOMRect = anchor.getBoundingClientRect();
        px = anchorRect.right + 6;
        py = anchorRect.top + (anchorRect.height - 17) / 2 + 1;
      } else {
        const fallback = fallbackPosition(containerRect, tracked.itemType);
        px = fallback.x;
        py = fallback.y;
      }

      if (isClippedByAncestor(tracked.element, px, py)) {
        tracked.sticker.setViewportVisible(false);
        this.onPositionCallback?.(tracked.itemId, 0, 0, 0, false);
        continue;
      }

      tracked.sticker.setPosition(px, py);
      tracked.sticker.setViewportVisible(true);

      const stickerWidth: number = tracked.sticker.getElement().offsetWidth;
      this.onPositionCallback?.(tracked.itemId, px, py, stickerWidth, true);
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

  return findVisibilityIcon(container, containerRect)
    ?? findFollowersAnchor(container, containerRect)
    ?? findConnectionBadge(container, containerRect, 60)
    ?? findTimestamp(container, containerRect, 60);
}

function findCommentAnchor(container: HTMLElement): HTMLElement | null {
  const containerRect: DOMRect = container.getBoundingClientRect();
  return findConnectionBadge(container, containerRect, 40) ??
    findAuthorBadge(container, containerRect, 40) ??
    findTimestamp(container, containerRect, 40);
}

export function findAuthorBadge(
  container: HTMLElement,
  containerRect: DOMRect,
  maxRelY: number,
): HTMLElement | null {
  const candidates: NodeListOf<HTMLElement> = container.querySelectorAll('p, span');

  for (const el of candidates) {
    if (el.children.length > 0) continue;
    const text: string = el.textContent?.trim() ?? '';
    if (text !== 'Author') continue;

    const rect: DOMRect = el.getBoundingClientRect();
    const relY: number = rect.y - containerRect.y;
    if (relY < 0 || relY > maxRelY || rect.height === 0) continue;

    return el;
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

export function findFollowersAnchor(container: HTMLElement, containerRect: DOMRect): HTMLElement | null {
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

export function findConnectionBadge(
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

export function findTimestamp(
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

export function isClippedByAncestor(element: HTMLElement, stickerX: number, stickerY: number): boolean {
  let ancestor: HTMLElement | null = element.parentElement;
  for (let i: number = 0; i < 15 && ancestor !== null; i++) {
    const style: CSSStyleDeclaration = getComputedStyle(ancestor);
    const clipsX: boolean =
      style.overflowX === 'hidden' || style.overflowX === 'clip' ||
      style.overflowX === 'auto' || style.overflowX === 'scroll';
    const clipsY: boolean =
      style.overflowY === 'hidden' || style.overflowY === 'clip' ||
      style.overflowY === 'auto' || style.overflowY === 'scroll';

    if (clipsX || clipsY) {
      const clipRect: DOMRect = ancestor.getBoundingClientRect();
      if (clipsX && (stickerX < clipRect.left || stickerX > clipRect.right)) return true;
      if (clipsY && (stickerY < clipRect.top || stickerY > clipRect.bottom)) return true;
    }
    ancestor = ancestor.parentElement;
  }
  return false;
}

function fallbackPosition(
  rect: DOMRect,
  itemType: 'post' | 'comment',
): { readonly x: number; readonly y: number } {
  const rightOffset: number = itemType === 'post' ? 56 : 12;
  const topOffset: number = itemType === 'post' ? 8 : 4;
  return { x: rect.right - rightOffset, y: rect.top + topOffset };
}
