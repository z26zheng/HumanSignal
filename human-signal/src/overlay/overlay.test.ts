import { JSDOM } from 'jsdom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ItemRegistry } from '@/overlay/item-registry';
import { OverlayRoot } from '@/overlay/overlay-root';
import { OverlayController } from '@/overlay/overlay-controller';
import { getLabelText, getStickerColor } from '@/overlay/score-display';
import { SignalSticker } from '@/overlay/signal-sticker';
import { createRulesItem } from '@/rules-engine';

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

  it('preserves explicit hidden state when sticker label updates', (): void => {
    const sticker: SignalSticker = createSticker('item-1');

    sticker.hide();
    sticker.update({
      label: 'Specific',
      color: 'green',
      state: 'labeled',
    });

    expect(sticker.getElement().classList.contains('human-signal-sticker--hidden')).toBe(true);
    expect(sticker.getElement().textContent).toBe('Specific');
  });

  it('tracks registry entries and evicts offscreen overflow', (): void => {
    const onRemove = vi.fn();
    const registry: ItemRegistry = new ItemRegistry(1, onRemove);
    const firstSticker: SignalSticker = createSticker('first');
    const secondSticker: SignalSticker = createSticker('second');

    registry.add(createEntry('first', firstSticker, false));
    registry.add(createEntry('second', secondSticker, true));

    expect(registry.get('first')).toBeNull();
    expect(registry.get('second')).not.toBeNull();
    expect(onRemove).toHaveBeenCalledWith('first');
  });

  it('maps scoring labels to display labels and colors', (): void => {
    expect(getLabelText('engagement-bait')).toBe('Engagement Bait');
    expect(getStickerColor('engagement-bait')).toBe('red');
    expect(getStickerColor('high-signal')).toBe('green');
  });
});

describe('overlay controller failure handling', (): void => {
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

  it('marks loading stickers unavailable after score request failure', (): void => {
    const controller: OverlayController = new OverlayController();
    const sticker: SignalSticker = createSticker('item-1');
    const registry = controller['registry'] as ItemRegistry;

    document.body.append(sticker.getElement());
    registry.add(createEntry('item-1', sticker, true));
    controller.handleScoreFailure(['item-1'], 'SEND_FAILED');

    expect(sticker.getElement().textContent).toBe('Unavailable');
    expect(sticker.getElement().classList.contains('human-signal-sticker--unavailable')).toBe(true);
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
    item: createRulesItem(itemId, 'post'),
    sticker,
    createdAt: Date.now(),
    state: 'loading' as const,
    score: null,
    inViewport,
  };
}
