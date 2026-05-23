import { JSDOM } from 'jsdom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DebugPill } from '@/overlay/debug-pill';
import { ItemRegistry } from '@/overlay/item-registry';
import { OverlayRoot } from '@/overlay/overlay-root';
import { OverlayController } from '@/overlay/overlay-controller';
import { getLabelText, getStickerColor } from '@/overlay/score-display';
import { SignalSticker } from '@/overlay/signal-sticker';
import { StickerContextMenu } from '@/overlay/sticker-context-menu';
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
    expect(getLabelText('almost-certainly-ai')).toBe('Almost Certainly AI');
    expect(getStickerColor('almost-certainly-ai')).toBe('red');
    expect(getStickerColor('feels-human')).toBe('green');
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

describe('sticker states and dismissal', (): void => {
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

  it('transitions through ai-enhancing state with shimmer class', (): void => {
    const sticker: SignalSticker = createSticker('shimmer-item');
    sticker.update({ label: 'Feels Human', color: 'green', state: 'labeled' });

    expect(sticker.getElement().classList.contains('human-signal-sticker--labeled')).toBe(true);

    sticker.update({ state: 'ai-enhancing' });

    expect(sticker.getElement().classList.contains('human-signal-sticker--ai-enhancing')).toBe(true);
    expect(sticker.getElement().textContent).toBe('Feels Human');
  });

  it('minimizes to a dot and restores to full sticker', (): void => {
    const sticker: SignalSticker = createSticker('minimize-item');
    sticker.update({ label: 'Likely AI', color: 'orange', state: 'labeled' });

    sticker.minimize();

    expect(sticker.isMinimized()).toBe(true);
    expect(sticker.getElement().classList.contains('human-signal-sticker--minimized')).toBe(true);
    expect(sticker.getElement().textContent).toBe('');

    sticker.restore();

    expect(sticker.isMinimized()).toBe(false);
    expect(sticker.getElement().textContent).toBe('Likely AI');
    expect(sticker.getElement().classList.contains('human-signal-sticker--minimized')).toBe(false);
  });

  it('Escape key minimizes a focused sticker', (): void => {
    const sticker: SignalSticker = createSticker('escape-item');
    sticker.update({ label: 'Possibly AI', color: 'yellow', state: 'labeled' });

    sticker.getElement().dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape' }));

    expect(sticker.isMinimized()).toBe(true);
  });

  it('clicking a minimized dot restores the sticker', (): void => {
    const onClick = vi.fn();
    const sticker: SignalSticker = new SignalSticker({
      label: 'Feels Human',
      color: 'green',
      state: 'labeled',
      itemId: 'click-restore',
      onClick,
    });

    sticker.minimize();
    expect(sticker.isMinimized()).toBe(true);

    sticker.getElement().click();

    expect(sticker.isMinimized()).toBe(false);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('fires contextmenu callback on right-click', (): void => {
    const onContextMenu = vi.fn();
    const sticker: SignalSticker = new SignalSticker({
      label: 'Likely AI',
      color: 'orange',
      state: 'labeled',
      itemId: 'ctx-item',
      onClick: (): void => {},
      onContextMenu,
    });

    const event = new window.MouseEvent('contextmenu', { bubbles: true });
    sticker.getElement().dispatchEvent(event);

    expect(onContextMenu).toHaveBeenCalledTimes(1);
  });

  it('shows and hides dismiss icon based on showInfoIcon prop', (): void => {
    const sticker: SignalSticker = createSticker('info-item');
    sticker.update({ label: 'Possibly AI', color: 'yellow', state: 'labeled', showInfoIcon: true });

    const dismissIcon = sticker.getElement().querySelector('.human-signal-sticker__info-icon');
    expect(dismissIcon).not.toBeNull();
    expect(dismissIcon?.textContent).toBe('\u00d7');

    sticker.update({ showInfoIcon: false });
    expect(sticker.getElement().querySelector('.human-signal-sticker__info-icon')).toBeNull();
  });

  it('preserves minimized state when viewport visibility changes', (): void => {
    const sticker: SignalSticker = createSticker('viewport-min');
    sticker.update({ label: 'Feels Human', color: 'green', state: 'labeled' });
    sticker.minimize();

    sticker.setViewportVisible(false);
    sticker.setViewportVisible(true);

    expect(sticker.isMinimized()).toBe(true);
    expect(sticker.getElement().classList.contains('human-signal-sticker--minimized')).toBe(true);
  });

  it('sets hover tooltip based on sticker state', (): void => {
    const sticker: SignalSticker = createSticker('tooltip-item');

    expect(sticker.getElement().title).toBe('Analyzing this post...');

    sticker.update({ label: 'Feels Human', color: 'green', state: 'labeled' });
    expect(sticker.getElement().title).toBe('Signal: Feels Human');

    sticker.update({ state: 'ai-enhancing' });
    expect(sticker.getElement().title).toBe('Enhancing with on-device AI...');

    sticker.minimize();
    expect(sticker.getElement().title).toBe('');
  });

  it('dismiss icon has tooltip about dismissing', (): void => {
    const sticker: SignalSticker = createSticker('info-tooltip');
    sticker.update({ label: 'Likely AI', color: 'orange', state: 'labeled', showInfoIcon: true });

    const icon = sticker.getElement().querySelector('.human-signal-sticker__info-icon') as HTMLElement;
    expect(icon).not.toBeNull();
    expect(icon.title).toContain('Dismiss');
  });

  it('label upgrade transition: update from rules to gemini changes color and text', (): void => {
    const sticker: SignalSticker = createSticker('upgrade-item');
    sticker.update({ label: 'Possibly AI', color: 'yellow', state: 'labeled' });

    expect(sticker.getElement().textContent).toBe('Possibly AI');
    expect(sticker.getElement().classList.contains('human-signal-sticker--yellow')).toBe(true);

    sticker.update({ label: 'Feels Human', color: 'green', state: 'labeled' });

    expect(sticker.getElement().textContent).toBe('Feels Human');
    expect(sticker.getElement().classList.contains('human-signal-sticker--green')).toBe(true);
    expect(sticker.getElement().classList.contains('human-signal-sticker--yellow')).toBe(false);
  });
});

describe('DebugPill', (): void => {
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

  it('creates an element with role button and aria-label', (): void => {
    const pill: DebugPill = new DebugPill('item-1', vi.fn());
    expect(pill.getElement().getAttribute('role')).toBe('button');
    expect(pill.getElement().getAttribute('aria-label')).toBe('Debug info');
  });

  it('updates text content via updateText', (): void => {
    const pill: DebugPill = new DebugPill('item-1', vi.fn());
    pill.updateText('🔧 12ms rules');
    expect(pill.getElement().textContent).toBe('🔧 12ms rules');
  });

  it('show and hide toggle the hidden class', (): void => {
    const pill: DebugPill = new DebugPill('item-1', vi.fn());
    pill.hide();
    expect(pill.getElement().classList.contains('human-signal-debug-pill--hidden')).toBe(true);
    expect(pill.isVisible()).toBe(false);

    pill.show();
    expect(pill.getElement().classList.contains('human-signal-debug-pill--hidden')).toBe(false);
    expect(pill.isVisible()).toBe(true);
  });

  it('fires onClick callback when clicked', (): void => {
    const onClick = vi.fn();
    const pill: DebugPill = new DebugPill('item-1', onClick);
    pill.getElement().click();
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('fires onClick on Enter key', (): void => {
    const onClick = vi.fn();
    const pill: DebugPill = new DebugPill('item-1', onClick);
    pill.getElement().dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('positions to the right of the sticker', (): void => {
    const pill: DebugPill = new DebugPill('item-1', vi.fn());
    pill.setPosition(100, 50, 80);
    expect(pill.getElement().style.transform).toBe('translate(184px, 50px)');
  });

  it('removes element on destroy', (): void => {
    const pill: DebugPill = new DebugPill('item-1', vi.fn());
    document.body.append(pill.getElement());
    expect(document.body.contains(pill.getElement())).toBe(true);

    pill.destroy();
    expect(document.body.contains(pill.getElement())).toBe(false);
  });
});

describe('StickerContextMenu', (): void => {
  beforeEach((): void => {
    const dom: JSDOM = new JSDOM('<!doctype html><body><div id="root"></div></body>', {
      url: 'https://www.linkedin.com/feed/',
    });
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
  });

  afterEach((): void => {
    vi.unstubAllGlobals();
  });

  it('shows a menu with role=menu and two menuitem buttons', (): void => {
    const root: HTMLElement = document.getElementById('root')!;
    const menu: StickerContextMenu = new StickerContextMenu(root);

    menu.show(100, 50, { onHideThis: vi.fn(), onHideAllOnPost: vi.fn() });

    const menuEl = root.querySelector('[role="menu"]');
    expect(menuEl).not.toBeNull();

    const items = root.querySelectorAll('[role="menuitem"]');
    expect(items).toHaveLength(2);
    expect(items[0]?.textContent).toBe('Hide this sticker');
    expect(items[1]?.textContent).toBe('Hide all stickers on this post');

    menu.destroy();
  });

  it('has aria-label on the menu container', (): void => {
    const root: HTMLElement = document.getElementById('root')!;
    const menu: StickerContextMenu = new StickerContextMenu(root);

    menu.show(100, 50, { onHideThis: vi.fn(), onHideAllOnPost: vi.fn() });
    expect(root.querySelector('[role="menu"]')?.getAttribute('aria-label')).toBe('Sticker options');

    menu.destroy();
  });

  it('calls onHideThis when first item is clicked', (): void => {
    const root: HTMLElement = document.getElementById('root')!;
    const onHideThis = vi.fn();
    const menu: StickerContextMenu = new StickerContextMenu(root);

    menu.show(100, 50, { onHideThis, onHideAllOnPost: vi.fn() });
    const items = root.querySelectorAll<HTMLButtonElement>('[role="menuitem"]');
    items[0]?.click();

    expect(onHideThis).toHaveBeenCalledTimes(1);
    expect(root.querySelector('[role="menu"]')).toBeNull();

    menu.destroy();
  });

  it('calls onHideAllOnPost when second item is clicked', (): void => {
    const root: HTMLElement = document.getElementById('root')!;
    const onHideAllOnPost = vi.fn();
    const menu: StickerContextMenu = new StickerContextMenu(root);

    menu.show(100, 50, { onHideThis: vi.fn(), onHideAllOnPost });
    const items = root.querySelectorAll<HTMLButtonElement>('[role="menuitem"]');
    items[1]?.click();

    expect(onHideAllOnPost).toHaveBeenCalledTimes(1);

    menu.destroy();
  });

  it('hides on Escape key', (): void => {
    const root: HTMLElement = document.getElementById('root')!;
    const menu: StickerContextMenu = new StickerContextMenu(root);

    menu.show(100, 50, { onHideThis: vi.fn(), onHideAllOnPost: vi.fn() });
    expect(root.querySelector('[role="menu"]')).not.toBeNull();

    document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape' }));
    expect(root.querySelector('[role="menu"]')).toBeNull();

    menu.destroy();
  });

  it('removes menu DOM on destroy', (): void => {
    const root: HTMLElement = document.getElementById('root')!;
    const menu: StickerContextMenu = new StickerContextMenu(root);

    menu.show(100, 50, { onHideThis: vi.fn(), onHideAllOnPost: vi.fn() });
    menu.destroy();

    expect(root.querySelector('[role="menu"]')).toBeNull();
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
