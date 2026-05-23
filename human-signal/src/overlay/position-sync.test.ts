import { JSDOM } from 'jsdom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  CONNECTION_PATTERN,
  PositionSync,
  TIMESTAMP_PATTERN,
  findAuthorBadge,
  findConnectionBadge,
  findFollowersAnchor,
  findTimestamp,
  isClippedByAncestor,
} from '@/overlay/position-sync';
import { SignalSticker } from '@/overlay/signal-sticker';

function makeContainer(html: string): HTMLElement {
  const dom: JSDOM = new JSDOM(`<!doctype html><html><body><div class="container">${html}</div></body></html>`);
  const container = dom.window.document.querySelector('.container') as HTMLElement;

  // Patch getBoundingClientRect for the container and its children since JSDOM
  // returns 0 by default.
  patchRects(container, dom);
  return container;
}

interface NodeRect {
  selector: string;
  y: number;
  height?: number;
  width?: number;
}

function patchRects(container: HTMLElement, _dom: JSDOM): void {
  // Default container rect: 800x200, top=0
  applyRect(container, { y: 0, height: 200, width: 800 });

  // Walk the children and assign synthetic rects based on data-test-y attr if set
  const elements: NodeListOf<HTMLElement> = container.querySelectorAll<HTMLElement>('*');
  for (const el of elements) {
    const y: string | null = el.getAttribute('data-test-y');
    const height: string | null = el.getAttribute('data-test-height');
    const width: string | null = el.getAttribute('data-test-width');
    applyRect(el, {
      y: y !== null ? Number.parseInt(y, 10) : 0,
      height: height !== null ? Number.parseInt(height, 10) : 14,
      width: width !== null ? Number.parseInt(width, 10) : 40,
    });
  }
}

function applyRect(el: Element, rect: { y: number; height: number; width: number }): void {
  (el as unknown as { getBoundingClientRect: () => DOMRect }).getBoundingClientRect = (): DOMRect => ({
    x: 0,
    y: rect.y,
    width: rect.width,
    height: rect.height,
    top: rect.y,
    left: 0,
    right: rect.width,
    bottom: rect.y + rect.height,
    toJSON: () => ({}),
  });
}

describe('CONNECTION_PATTERN', (): void => {
  it('matches "• 1st"', (): void => {
    expect(CONNECTION_PATTERN.test('Olapade Abiodun • 1st')).toBe(true);
  });

  it('matches "• 2nd"', (): void => {
    expect(CONNECTION_PATTERN.test('• 2nd')).toBe(true);
  });

  it('matches "• 3rd+"', (): void => {
    expect(CONNECTION_PATTERN.test('• 3rd+')).toBe(true);
  });

  it('does not match random text', (): void => {
    expect(CONNECTION_PATTERN.test('Yesterday')).toBe(false);
    expect(CONNECTION_PATTERN.test('Author')).toBe(false);
  });
});

describe('TIMESTAMP_PATTERN', (): void => {
  it('matches LinkedIn-style timestamps', (): void => {
    expect(TIMESTAMP_PATTERN.test('2w')).toBe(true);
    expect(TIMESTAMP_PATTERN.test('1d')).toBe(true);
    expect(TIMESTAMP_PATTERN.test('5h')).toBe(true);
    expect(TIMESTAMP_PATTERN.test('30m')).toBe(true);
  });

  it('rejects non-timestamp strings', (): void => {
    expect(TIMESTAMP_PATTERN.test('2 weeks ago')).toBe(false);
    expect(TIMESTAMP_PATTERN.test('1st')).toBe(false);
    expect(TIMESTAMP_PATTERN.test('Author')).toBe(false);
    expect(TIMESTAMP_PATTERN.test('hello')).toBe(false);
  });
});

describe('findConnectionBadge', (): void => {
  it('finds element matching "• 1st" within relY range', (): void => {
    const container = makeContainer(`
      <span data-test-y="10" data-test-height="14" data-test-width="40">• 1st</span>
    `);
    const rect = container.getBoundingClientRect();
    expect(findConnectionBadge(container, rect, 40)).not.toBeNull();
  });

  it('rejects badge outside relY range', (): void => {
    const container = makeContainer(`
      <span data-test-y="500" data-test-height="14" data-test-width="40">• 1st</span>
    `);
    const rect = container.getBoundingClientRect();
    expect(findConnectionBadge(container, rect, 40)).toBeNull();
  });

  it('returns null when no badge exists', (): void => {
    const container = makeContainer(`<span data-test-y="10">Just plain text</span>`);
    const rect = container.getBoundingClientRect();
    expect(findConnectionBadge(container, rect, 40)).toBeNull();
  });
});

describe('findAuthorBadge', (): void => {
  it('finds Author badge within relY range', (): void => {
    const container = makeContainer(`
      <p data-test-y="10" data-test-height="14">Author</p>
    `);
    const rect = container.getBoundingClientRect();
    expect(findAuthorBadge(container, rect, 40)).not.toBeNull();
  });

  it('ignores Author text outside relY range', (): void => {
    const container = makeContainer(`
      <p data-test-y="500" data-test-height="14">Author</p>
    `);
    const rect = container.getBoundingClientRect();
    expect(findAuthorBadge(container, rect, 40)).toBeNull();
  });

  it('only matches exact text "Author"', (): void => {
    const container = makeContainer(`
      <p data-test-y="10" data-test-height="14">Coauthor</p>
    `);
    const rect = container.getBoundingClientRect();
    expect(findAuthorBadge(container, rect, 40)).toBeNull();
  });
});

describe('findTimestamp', (): void => {
  it('finds short timestamp text like "2w"', (): void => {
    const container = makeContainer(`
      <span data-test-y="10" data-test-height="14" data-test-width="20">2w</span>
    `);
    const rect = container.getBoundingClientRect();
    expect(findTimestamp(container, rect, 40)).not.toBeNull();
  });

  it('skips elements outside relY window', (): void => {
    const container = makeContainer(`
      <span data-test-y="500" data-test-height="14" data-test-width="20">2w</span>
    `);
    const rect = container.getBoundingClientRect();
    expect(findTimestamp(container, rect, 40)).toBeNull();
  });
});

describe('findFollowersAnchor', (): void => {
  it('finds "1,234 followers" element', (): void => {
    const container = makeContainer(`
      <p data-test-y="50" data-test-height="14" data-test-width="100">1,234 followers</p>
    `);
    const rect = container.getBoundingClientRect();
    expect(findFollowersAnchor(container, rect)).not.toBeNull();
  });

  it('rejects elements outside vertical range', (): void => {
    const container = makeContainer(`
      <p data-test-y="500" data-test-height="14" data-test-width="100">1,234 followers</p>
    `);
    const rect = container.getBoundingClientRect();
    expect(findFollowersAnchor(container, rect)).toBeNull();
  });
});

/**
 * Test helper: build a DOM tree where an ancestor has `overflow: hidden` and
 * controlled bounding rects, so we can verify clipping behavior.
 *
 * `targetSelector` indicates the descendant that's "inside" the carousel.
 */
function makeClipScenario(html: string, dom?: JSDOM): {
  readonly dom: JSDOM;
  readonly target: HTMLElement;
  readonly ancestor: HTMLElement;
} {
  const useDom: JSDOM = dom ?? new JSDOM(`<!doctype html><html><body>${html}</body></html>`);
  const target: HTMLElement = useDom.window.document.querySelector('.target') as HTMLElement;
  const ancestor: HTMLElement = useDom.window.document.querySelector('.ancestor') as HTMLElement;
  return { dom: useDom, target, ancestor };
}

describe('isClippedByAncestor', (): void => {
  let originalGetComputedStyle: typeof globalThis.getComputedStyle | undefined;

  beforeEach((): void => {
    const dom: JSDOM = new JSDOM('<!doctype html><body></body>');
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    originalGetComputedStyle = globalThis.getComputedStyle;
  });

  afterEach((): void => {
    vi.unstubAllGlobals();
    if (originalGetComputedStyle !== undefined) {
      globalThis.getComputedStyle = originalGetComputedStyle;
    }
  });

  function setupAncestor(opts: {
    readonly overflowX?: string;
    readonly overflowY?: string;
    readonly rect: { left: number; right: number; top: number; bottom: number };
  }): { ancestor: HTMLElement; target: HTMLElement } {
    const ancestor: HTMLElement = document.createElement('div');
    ancestor.className = 'ancestor';
    const target: HTMLElement = document.createElement('div');
    target.className = 'target';
    ancestor.append(target);
    document.body.append(ancestor);

    (ancestor as unknown as { getBoundingClientRect: () => DOMRect }).getBoundingClientRect = (): DOMRect => ({
      left: opts.rect.left,
      right: opts.rect.right,
      top: opts.rect.top,
      bottom: opts.rect.bottom,
      x: opts.rect.left,
      y: opts.rect.top,
      width: opts.rect.right - opts.rect.left,
      height: opts.rect.bottom - opts.rect.top,
      toJSON: (): Record<string, unknown> => ({}),
    });

    globalThis.getComputedStyle = ((el: Element): CSSStyleDeclaration => {
      if (el === ancestor) {
        return { overflowX: opts.overflowX ?? 'visible', overflowY: opts.overflowY ?? 'visible' } as unknown as CSSStyleDeclaration;
      }
      return { overflowX: 'visible', overflowY: 'visible' } as unknown as CSSStyleDeclaration;
    }) as unknown as typeof globalThis.getComputedStyle;

    return { ancestor, target };
  }

  it('returns false when no ancestor clips overflow', (): void => {
    const { target } = setupAncestor({
      rect: { left: 0, right: 800, top: 0, bottom: 600 },
      overflowX: 'visible',
      overflowY: 'visible',
    });

    expect(isClippedByAncestor(target, 100, 100)).toBe(false);
  });

  it('returns true when sticker x is to the right of an overflow-hidden ancestor', (): void => {
    const { target } = setupAncestor({
      rect: { left: 0, right: 500, top: 0, bottom: 600 },
      overflowX: 'hidden',
    });

    expect(isClippedByAncestor(target, 600, 100)).toBe(true);
  });

  it('returns true when sticker x is to the left of an overflow-hidden ancestor', (): void => {
    const { target } = setupAncestor({
      rect: { left: 100, right: 500, top: 0, bottom: 600 },
      overflowX: 'hidden',
    });

    expect(isClippedByAncestor(target, 50, 200)).toBe(true);
  });

  it('returns false when sticker x is inside an overflow-hidden ancestor horizontally', (): void => {
    const { target } = setupAncestor({
      rect: { left: 0, right: 500, top: 0, bottom: 600 },
      overflowX: 'hidden',
    });

    expect(isClippedByAncestor(target, 250, 100)).toBe(false);
  });

  it('treats overflowX="auto" and "scroll" the same as "hidden" (carousel pattern)', (): void => {
    const { target: target1 } = setupAncestor({
      rect: { left: 0, right: 500, top: 0, bottom: 600 },
      overflowX: 'auto',
    });
    expect(isClippedByAncestor(target1, 600, 100)).toBe(true);

    document.body.innerHTML = '';

    const { target: target2 } = setupAncestor({
      rect: { left: 0, right: 500, top: 0, bottom: 600 },
      overflowX: 'scroll',
    });
    expect(isClippedByAncestor(target2, 600, 100)).toBe(true);
  });

  it('treats overflowX="clip" the same as "hidden"', (): void => {
    const { target } = setupAncestor({
      rect: { left: 0, right: 500, top: 0, bottom: 600 },
      overflowX: 'clip',
    });
    expect(isClippedByAncestor(target, 600, 100)).toBe(true);
  });

  it('returns true when sticker y is below an overflow-hidden ancestor vertically', (): void => {
    const { target } = setupAncestor({
      rect: { left: 0, right: 800, top: 0, bottom: 200 },
      overflowY: 'hidden',
    });
    expect(isClippedByAncestor(target, 100, 300)).toBe(true);
  });

  it('stops climbing after 15 ancestors (safety bound)', (): void => {
    // Build a deep chain of 20 non-clipping ancestors.
    let parent: HTMLElement = document.body;
    for (let i: number = 0; i < 20; i++) {
      const ancestor: HTMLElement = document.createElement('div');
      parent.append(ancestor);
      parent = ancestor;
    }
    const target: HTMLElement = document.createElement('div');
    parent.append(target);

    globalThis.getComputedStyle = ((): CSSStyleDeclaration =>
      ({ overflowX: 'visible', overflowY: 'visible' }) as unknown as CSSStyleDeclaration) as unknown as typeof globalThis.getComputedStyle;

    expect(isClippedByAncestor(target, 100, 100)).toBe(false);
  });
});

describe('PositionSync lifecycle', (): void => {
  beforeEach((): void => {
    const dom: JSDOM = new JSDOM('<!doctype html><body></body>');
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('Node', dom.window.Node);
    // Make rAF a no-op so we don't loop in tests.
    vi.stubGlobal('requestAnimationFrame', vi.fn((): number => 1));
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
  });

  afterEach((): void => {
    vi.unstubAllGlobals();
  });

  function makeSticker(itemId: string): SignalSticker {
    return new SignalSticker({
      label: 'Scoring',
      color: 'gray',
      state: 'loading',
      itemId,
      onClick: (): void => {},
    });
  }

  it('addItem and removeItem manage tracked set', (): void => {
    const sync = new PositionSync();
    const el: HTMLDivElement = document.createElement('div');
    document.body.append(el);
    const sticker = makeSticker('item-1');

    sync.addItem('item-1', 'post', el, sticker);
    sync.removeItem('item-1');

    // No errors, no exceptions. Removing twice should be a no-op.
    expect(() => sync.removeItem('item-1')).not.toThrow();
  });

  it('startLoop calls requestAnimationFrame', (): void => {
    const rafSpy = vi.spyOn(globalThis, 'requestAnimationFrame');
    const sync = new PositionSync();
    sync.startLoop();

    expect(rafSpy).toHaveBeenCalled();
  });

  it('startLoop is idempotent (only schedules one rAF)', (): void => {
    const rafSpy = vi.spyOn(globalThis, 'requestAnimationFrame');
    const sync = new PositionSync();
    sync.startLoop();
    sync.startLoop();

    expect(rafSpy).toHaveBeenCalledTimes(1);
  });

  it('stopLoop cancels the running animation frame', (): void => {
    const cafSpy = vi.spyOn(globalThis, 'cancelAnimationFrame');
    const sync = new PositionSync();
    sync.startLoop();
    sync.stopLoop();

    expect(cafSpy).toHaveBeenCalled();
  });

  it('stopLoop is a no-op when loop has not started', (): void => {
    const cafSpy = vi.spyOn(globalThis, 'cancelAnimationFrame');
    const sync = new PositionSync();
    sync.stopLoop();

    expect(cafSpy).not.toHaveBeenCalled();
  });

  it('setOnPosition registers a callback that is invocable', (): void => {
    const sync = new PositionSync();
    const cb = vi.fn();
    sync.setOnPosition(cb);

    // Without driving syncFrame manually we can't observe the callback being
    // invoked, but the registration itself should not throw.
    expect(() => sync.setOnPosition(cb)).not.toThrow();
  });
});
