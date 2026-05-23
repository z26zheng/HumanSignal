import { JSDOM } from 'jsdom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { extractText, normalizeExtractedText } from '@/linkedin-adapter/text-extraction';

let dom: JSDOM;

beforeEach((): void => {
  dom = new JSDOM('<!doctype html><body></body>');
  vi.stubGlobal('window', dom.window);
  vi.stubGlobal('document', dom.window.document);
});

afterEach((): void => {
  vi.unstubAllGlobals();
});

function makeEl(html: string): HTMLElement {
  const wrapper: HTMLDivElement = document.createElement('div');
  wrapper.innerHTML = html;
  return wrapper.firstElementChild as HTMLElement;
}

describe('extractText', (): void => {
  describe('basic extraction', (): void => {
    it('returns plain text for a simple element', (): void => {
      expect(extractText(makeEl('<p>Hello world</p>'))).toBe('Hello world');
    });

    it('returns empty string for empty element', (): void => {
      expect(extractText(makeEl('<p></p>'))).toBe('');
    });

    it('collapses repeated whitespace into a single space', (): void => {
      expect(extractText(makeEl('<p>Hello    world</p>'))).toBe('Hello world');
    });

    it('trims leading and trailing whitespace', (): void => {
      expect(extractText(makeEl('<p>   Hello world   </p>'))).toBe('Hello world');
    });
  });

  describe('block-level structure preservation', (): void => {
    it('inserts newlines between paragraphs', (): void => {
      const text: string = extractText(makeEl('<div><p>First</p><p>Second</p></div>'));
      expect(text).toContain('First');
      expect(text).toContain('Second');
      expect(text.split('\n').filter(Boolean).length).toBeGreaterThanOrEqual(2);
    });

    it('converts <br> to a newline', (): void => {
      const text: string = extractText(makeEl('<p>Line one<br>Line two</p>'));
      expect(text.includes('\n')).toBe(true);
    });

    it('preserves list items as separate lines', (): void => {
      const text: string = extractText(makeEl('<ul><li>One</li><li>Two</li></ul>'));
      expect(text).toContain('One');
      expect(text).toContain('Two');
      expect(text.split('\n').filter(Boolean).length).toBe(2);
    });

    it('collapses 3+ blank lines into a single blank line', (): void => {
      const text: string = extractText(makeEl('<div><p>a</p><br><br><br><br><p>b</p></div>'));
      // After normalization no triple newlines remain.
      expect(/\n\n\n/.test(text)).toBe(false);
    });
  });

  describe('"see more" / "show more" stripping', (): void => {
    it('removes "see more" text node', (): void => {
      const text: string = extractText(makeEl('<div>Some content. <span>see more</span></div>'));
      expect(text).not.toContain('see more');
    });

    it('removes "...see more" text node', (): void => {
      const text: string = extractText(makeEl('<div>Some content. <span>...see more</span></div>'));
      expect(text).not.toContain('see more');
    });

    it('removes "Show more" text node (case-insensitive)', (): void => {
      const text: string = extractText(makeEl('<div>Some content. <span>Show more</span></div>'));
      expect(text.toLowerCase()).not.toContain('show more');
    });

    it('skips elements where aria-label is "see more"', (): void => {
      const text: string = extractText(makeEl('<div>Some content. <span aria-label="see more">click</span></div>'));
      expect(text).toContain('Some content');
    });

    it('skips interactive (button/anchor) elements containing "see more"', (): void => {
      const text: string = extractText(makeEl('<div>Some content. <button>see more</button></div>'));
      expect(text).toContain('Some content');
      expect(text).not.toMatch(/see\s+more/i);
    });
  });

  describe('hidden element skipping', (): void => {
    it('skips elements with hidden attribute', (): void => {
      const text: string = extractText(makeEl('<div>Visible <span hidden>hidden text</span></div>'));
      expect(text).not.toContain('hidden text');
      expect(text).toContain('Visible');
    });

    it('skips elements with aria-hidden="true"', (): void => {
      const text: string = extractText(makeEl('<div>Visible <span aria-hidden="true">hidden text</span></div>'));
      expect(text).not.toContain('hidden text');
    });

    it('does NOT skip elements with aria-hidden="false"', (): void => {
      const text: string = extractText(makeEl('<div>Visible <span aria-hidden="false">also visible</span></div>'));
      expect(text).toContain('also visible');
    });
  });

  describe('non-breaking spaces', (): void => {
    it('converts U+00A0 to regular space', (): void => {
      const text: string = extractText(makeEl('<p>Hello\u00a0world</p>'));
      expect(text).toBe('Hello world');
      expect(text).not.toContain('\u00a0');
    });
  });

  describe('nested structures', (): void => {
    it('extracts text from deeply nested elements', (): void => {
      const text: string = extractText(makeEl('<div><div><div><span>Deep <strong>bold</strong> text</span></div></div></div>'));
      expect(text).toContain('Deep');
      expect(text).toContain('bold');
      expect(text).toContain('text');
    });
  });
});

describe('normalizeExtractedText', (): void => {
  it('is a no-op for already-normal text', (): void => {
    expect(normalizeExtractedText('Hello world')).toBe('Hello world');
  });

  it('collapses runs of spaces', (): void => {
    expect(normalizeExtractedText('Hello    world')).toBe('Hello world');
  });

  it('trims trailing whitespace on lines', (): void => {
    expect(normalizeExtractedText('Hello   \nworld')).toBe('Hello\nworld');
  });

  it('trims leading whitespace on lines', (): void => {
    expect(normalizeExtractedText('Hello\n   world')).toBe('Hello\nworld');
  });

  it('collapses 3+ blank lines to 2', (): void => {
    expect(normalizeExtractedText('a\n\n\n\n\nb')).toBe('a\n\nb');
  });

  it('replaces non-breaking spaces', (): void => {
    expect(normalizeExtractedText('a\u00a0b')).toBe('a b');
  });

  it('trims the result', (): void => {
    expect(normalizeExtractedText('   hello world   ')).toBe('hello world');
  });
});
