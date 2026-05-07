import { SignalSticker } from '@/overlay/signal-sticker';

interface TrackedItem {
  readonly itemType: 'post' | 'comment';
  readonly element: HTMLElement;
  readonly sticker: SignalSticker;
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
    });
  }

  public removeItem(itemId: string): void {
    this.trackedItems.delete(itemId);
  }

  private syncFrame(): void {
    const positions: Array<{ readonly sticker: SignalSticker; readonly x: number; readonly y: number; readonly isVisible: boolean }> = [];

    for (const trackedItem of this.trackedItems.values()) {
      const rect: DOMRect = trackedItem.element.getBoundingClientRect();
      positions.push({
        sticker: trackedItem.sticker,
        ...calculateStickerPosition(rect, trackedItem.itemType),
      });
    }

    for (const position of positions) {
      if (!position.isVisible) {
        position.sticker.hide();
        continue;
      }

      position.sticker.setPosition(position.x, position.y);
      position.sticker.show();
    }

    this.animationFrameId = requestAnimationFrame((): void => this.syncFrame());
  }
}

function calculateStickerPosition(
  rect: DOMRect,
  itemType: 'post' | 'comment',
): { readonly x: number; readonly y: number; readonly isVisible: boolean } {
  if (rect.width === 0 || rect.height === 0 || rect.bottom < 0 || rect.top > window.innerHeight) {
    return { x: 0, y: 0, isVisible: false };
  }

  const rightOffset: number = itemType === 'post' ? 56 : 12;
  const topOffset: number = itemType === 'post' ? 8 : 4;
  const x: number = rect.right - rightOffset;
  const y: number = rect.top + topOffset;

  if (x < rect.left || x > rect.right) {
    return {
      x: rect.left + 8,
      y: rect.top + 8,
      isVisible: true,
    };
  }

  return { x, y, isVisible: true };
}
