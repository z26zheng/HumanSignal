import { JSDOM } from 'jsdom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { resolveCommentId, resolvePostId } from '@/linkedin-adapter/ids';

let dom: JSDOM;

beforeEach((): void => {
  dom = new JSDOM('<!doctype html><body></body>', { url: 'https://www.linkedin.com/feed/' });
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

describe('resolvePostId', (): void => {
  describe('URN strategy (most stable)', (): void => {
    it('uses data-urn directly when present and well-formed', (): void => {
      const el: HTMLElement = makeEl('<div data-urn="urn:li:activity:7123456789"></div>');
      const result = resolvePostId(el, 'Some text content');

      expect(result.method).toBe('urn');
      expect(result.postId).toBe('urn:li:activity:7123456789');
    });

    it('finds nested data-urn descendant', (): void => {
      const el: HTMLElement = makeEl('<div><span data-urn="urn:li:activity:999"></span></div>');
      const result = resolvePostId(el, 'Some text content');

      expect(result.method).toBe('urn');
      expect(result.postId).toBe('urn:li:activity:999');
    });

    it('ignores data-urn that does not match activity pattern', (): void => {
      const el: HTMLElement = makeEl('<div data-urn="urn:li:share:111"></div>');
      const result = resolvePostId(el, 'Some text content');

      expect(result.method).not.toBe('urn');
    });
  });

  describe('componentkey fallback (permalink)', (): void => {
    it('uses componentkey when no URN available', (): void => {
      const el: HTMLElement = makeEl('<div componentkey="urn:li:fsd_update:(urn:li:activity:7,FEED,EMPTY,DEFAULT,false)"></div>');
      const result = resolvePostId(el, 'Some text content');

      expect(result.method).toBe('permalink');
      expect(result.postId).toMatch(/^ck_/);
    });

    it('produces deterministic id for the same componentkey value', (): void => {
      const a: HTMLElement = makeEl('<div componentkey="urn:li:foo"></div>');
      const b: HTMLElement = makeEl('<div componentkey="urn:li:foo"></div>');
      expect(resolvePostId(a, 'a').postId).toBe(resolvePostId(b, 'b').postId);
    });

    it('ignores empty componentkey', (): void => {
      const el: HTMLElement = makeEl('<div componentkey="   "></div>');
      const result = resolvePostId(el, 'Some text content');
      expect(result.method).toBe('contentHash');
    });
  });

  describe('permalink discovery from anchors', (): void => {
    it('extracts URN from anchor href', (): void => {
      const el: HTMLElement = makeEl('<div><a href="https://www.linkedin.com/feed/update/urn:li:activity:42">post</a></div>');
      const result = resolvePostId(el, 'Some text content');

      // Note: anchors are scanned for URN BEFORE the componentkey path,
      // so this is a "permalink" method.
      expect(result.method).toBe('permalink');
    });

    it('extracts activity id from /posts/...-activity-NNN URLs', (): void => {
      const el: HTMLElement = makeEl('<div><a href="https://www.linkedin.com/posts/author_slug-activity-987654321">post</a></div>');
      const result = resolvePostId(el, 'Some text content');

      expect(result.method).toBe('permalink');
      expect(result.postId).toContain('permalink_');
    });

    it('falls back to href containing /feed/update/ even without URN match', (): void => {
      const el: HTMLElement = makeEl('<div><a href="/feed/update/somekey">post</a></div>');
      const result = resolvePostId(el, 'Some text content');

      expect(result.method).toBe('permalink');
    });
  });

  describe('content-hash fallback (least stable)', (): void => {
    it('uses content hash when no other id source is available', (): void => {
      const el: HTMLElement = makeEl('<div>No identifying attributes here.</div>');
      const result = resolvePostId(el, 'Some text content');

      expect(result.method).toBe('contentHash');
      expect(result.postId).toBe(result.contentHash);
    });

    it('changes when text changes (content hash is text-derived)', (): void => {
      const el: HTMLElement = makeEl('<div></div>');
      const a = resolvePostId(el, 'text A');
      const b = resolvePostId(el, 'text B');
      expect(a.contentHash).not.toBe(b.contentHash);
    });
  });

  describe('contentHash is always set', (): void => {
    it('returns a contentHash even when URN is found', (): void => {
      const el: HTMLElement = makeEl('<div data-urn="urn:li:activity:1"></div>');
      const result = resolvePostId(el, 'Some text content');
      expect(result.contentHash).toBeTruthy();
    });
  });
});

describe('resolveCommentId', (): void => {
  it('uses data-comment-id when present', (): void => {
    const el: HTMLElement = makeEl('<div data-comment-id="comment-42"></div>');
    expect(resolveCommentId(el, 'reply text', 'parent-1')).toBe('comment-42');
  });

  it('uses data-urn when no data-comment-id', (): void => {
    const el: HTMLElement = makeEl('<div data-urn="urn:li:comment:(1,2)"></div>');
    expect(resolveCommentId(el, 'reply text', 'parent-1')).toBe('urn:li:comment:(1,2)');
  });

  it('uses id attribute as third choice', (): void => {
    const el: HTMLElement = makeEl('<div id="comment-element-99"></div>');
    expect(resolveCommentId(el, 'reply text', 'parent-1')).toBe('comment-element-99');
  });

  it('extracts comment URN from componentkey when other sources are missing', (): void => {
    const el: HTMLElement = makeEl('<div componentkey="urn:li:comment:(urn:li:activity:1,123)"></div>');
    const result: string = resolveCommentId(el, 'reply text', 'parent-1');
    expect(result).toBe('urn:li:comment:(urn:li:activity:1,123)');
  });

  it('falls back to comment_<parent>_<contentHash> when no id sources match', (): void => {
    const el: HTMLElement = makeEl('<div></div>');
    const result: string = resolveCommentId(el, 'reply text', 'parent-1');
    expect(result).toMatch(/^comment_parent-1_/);
  });

  it('falls back to content-hash form for the same text deterministically', (): void => {
    const a: HTMLElement = makeEl('<div></div>');
    const b: HTMLElement = makeEl('<div></div>');
    expect(resolveCommentId(a, 'same text', 'p1')).toBe(resolveCommentId(b, 'same text', 'p1'));
  });

  it('produces different ids when parent post id differs', (): void => {
    const a: HTMLElement = makeEl('<div></div>');
    const b: HTMLElement = makeEl('<div></div>');
    expect(resolveCommentId(a, 'same text', 'p1')).not.toBe(resolveCommentId(b, 'same text', 'p2'));
  });

  it('falls through to content-hash when data-comment-id is whitespace (does NOT fall back to data-urn)', (): void => {
    // Quirk: the `??` chain only short-circuits on null/undefined, so an
    // empty-string `data-comment-id` "wins" the chain. The subsequent
    // `.trim() !== ''` check then forces a fall-through, skipping data-urn
    // and componentkey entirely. Documenting the current behavior here.
    const el: HTMLElement = makeEl('<div data-comment-id="   " data-urn="urn:li:comment:(1,2)"></div>');
    const result: string = resolveCommentId(el, 'reply text', 'p1');
    expect(result).toMatch(/^comment_p1_/);
  });

  it('uses data-urn when data-comment-id is genuinely absent (not just empty)', (): void => {
    const el: HTMLElement = makeEl('<div data-urn="urn:li:comment:(1,2)"></div>');
    expect(resolveCommentId(el, 'reply text', 'p1')).toBe('urn:li:comment:(1,2)');
  });
});
