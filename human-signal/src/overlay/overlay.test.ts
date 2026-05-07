import { JSDOM } from 'jsdom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ItemRegistry } from '@/overlay/item-registry';
import { OverlayRoot } from '@/overlay/overlay-root';
import { getLabelText, getStickerColor } from '@/overlay/score-display';
import { SignalSticker } from '@/overlay/signal-sticker';

describe('overlay UI primitives', (): void => {
  beforeEach((): void => {
    const dom: JSDOM = new JSDOM('<!doctype html><body></body>', {
      url: 'https://www.linkedin.com/feed/',
    });

    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
  });

  afterEach((): void => {
    vi.unstubAllGlobals();
  });

  it('creates a single fixed overlay root', (): void => {
    const overlayRoot: OverlayRoot = new OverlayRoot();
    const firstRoot: HTMLDivElement = overlayRoot.create();
    const secondRoot: HTMLDivElement = overlayRoot.create();

    expect(firstRoot).toBe(secondRoot);
    expect(firstRoot.style.position).toBe('fixed');
    expect(firstRoot.style.pointerEvents).toBe('none');
  });

  it('renders accessible stickers and handles keyboard activation', (): void => {
    const onClick = vi.fn();
    const sticker: SignalSticker = new SignalSticker({
      label: 'Specific',
      color: 'green',
      state: 'labeled',
      itemId: 'item-1',
      onClick,
    });

    sticker.getElement().dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter' }));

    expect(sticker.getElement().textContent).toBe('Specific');
    expect(sticker.getElement().getAttribute('aria-label')).toBe('Signal: Specific');
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('tracks registry entries and evicts offscreen overflow', (): void => {
    const registry: ItemRegistry = new ItemRegistry(1);
    const firstSticker: SignalSticker = createSticker('first');
    const secondSticker: SignalSticker = createSticker('second');

    registry.add(createEntry('first', firstSticker, false));
    registry.add(createEntry('second', secondSticker, true));

    expect(registry.get('first')).toBeNull();
    expect(registry.get('second')).not.toBeNull();
  });

  it('maps scoring labels to display labels and colors', (): void => {
    expect(getLabelText('engagement-bait')).toBe('Engagement Bait');
    expect(getStickerColor('engagement-bait')).toBe('red');
    expect(getStickerColor('high-signal')).toBe('green');
  });
});

function createSticker(itemId: string): SignalSticker {
  return new SignalSticker({
    label: 'Scoring...',
    color: 'gray',
    state: 'loading',
    itemId,
    onClick: (): void => {},
  });
}

function createEntry(itemId: string, sticker: SignalSticker, inViewport: boolean) {
  return {
    itemId,
    itemType: 'post' as const,
    element: document.createElement('article'),
    sticker,
    createdAt: Date.now(),
    state: 'loading' as const,
    score: null,
    inViewport,
  };
}
