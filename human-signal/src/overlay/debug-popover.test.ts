import { JSDOM } from 'jsdom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DebugPopover } from '@/overlay/debug-popover';
import { EventTraceStore } from '@/shared/event-trace';

import type { ContentHash, ItemId, ScoringResult } from '@/shared/types';

function makeScore(overrides: Partial<ScoringResult> = {}): ScoringResult {
  const base: ScoringResult = {
    itemId: 'item-1' as ItemId,
    label: 'feels-human',
    confidence: 'high',
    explanation: 'Specific metrics noted.',
    source: 'rules',
    scoringVersion: 'rules-1',
    scoredAt: 0,
    isTextTruncated: false,
    dimensions: {
      authenticity: 0.7,
      specificity: 0.8,
      originality: 0.6,
      usefulness: 0.5,
      engagementBait: 0.1,
      templating: 0.2,
    },
  };
  return { ...base, ...overrides };
}

function makeTraceStore(): EventTraceStore {
  return new EventTraceStore(200);
}

function dlText(root: HTMLElement, key: string): string | null {
  const dts: NodeListOf<HTMLElement> = root.querySelectorAll('dt');
  for (const dt of Array.from(dts)) {
    if ((dt.textContent ?? '').trim() === key) {
      const dd: Element | null = dt.nextElementSibling;
      return (dd?.textContent ?? '').trim();
    }
  }
  return null;
}

describe('DebugPopover', (): void => {
  let root: HTMLDivElement;
  let anchor: HTMLDivElement;

  beforeEach((): void => {
    const dom: JSDOM = new JSDOM('<!doctype html><body></body>', {
      url: 'https://www.linkedin.com/feed/',
    });
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('Node', dom.window.Node);
    vi.stubGlobal('KeyboardEvent', dom.window.KeyboardEvent);

    root = document.createElement('div');
    anchor = document.createElement('div');
    document.body.append(root);
    document.body.append(anchor);
  });

  afterEach((): void => {
    vi.unstubAllGlobals();
  });

  describe('when no trace data is available', (): void => {
    it('renders fallback "No debug data available." text', (): void => {
      const store = makeTraceStore();
      const popover = new DebugPopover(root);
      popover.open(anchor, store, 'missing-id', null, false);

      expect(root.textContent).toContain('No debug data available.');
    });
  });

  describe('detection engine status (TMR-aware)', (): void => {
    it('shows "TMR upgraded label" when TMR_COMPLETED and STICKER_UPGRADED', (): void => {
      const store = makeTraceStore();
      store.startTrace('item-1', 'post', 'hash_abc' as ContentHash as unknown as string, 100, false);
      store.addEvent('item-1', 'TMR_COMPLETED', 'AI 78%');
      store.addEvent('item-1', 'STICKER_UPGRADED', 'rules→combined');

      const popover = new DebugPopover(root);
      popover.open(anchor, store, 'item-1', makeScore({ source: 'combined' }), false);

      expect(dlText(root, 'TMR status')).toContain('upgraded');
    });

    it('shows "TMR processing..." when only TMR_STARTED', (): void => {
      const store = makeTraceStore();
      store.startTrace('item-1', 'post', 'hash' as ContentHash as unknown as string, 100, false);
      store.addEvent('item-1', 'TMR_STARTED', '');

      const popover = new DebugPopover(root);
      popover.open(anchor, store, 'item-1', null, false);

      expect(dlText(root, 'TMR status')).toContain('processing');
    });

    it('shows "TMR failed" when TMR_FAILED present', (): void => {
      const store = makeTraceStore();
      store.startTrace('item-1', 'post', 'hash' as ContentHash as unknown as string, 100, false);
      store.addEvent('item-1', 'TMR_FAILED', 'OOM');

      const popover = new DebugPopover(root);
      popover.open(anchor, store, 'item-1', null, false);

      expect(dlText(root, 'TMR status')).toContain('failed');
    });

    it('shows "TMR pending" when RULES_COMPLETED but no TMR yet', (): void => {
      const store = makeTraceStore();
      store.startTrace('item-1', 'post', 'hash' as ContentHash as unknown as string, 100, false);
      store.addEvent('item-1', 'RULES_COMPLETED', '');

      const popover = new DebugPopover(root);
      popover.open(anchor, store, 'item-1', null, false);

      expect(dlText(root, 'TMR status')).toContain('pending');
    });

    it('shows scoring source from the score when present', (): void => {
      const store = makeTraceStore();
      store.startTrace('item-1', 'post', 'hash' as ContentHash as unknown as string, 100, false);
      store.addEvent('item-1', 'RULES_COMPLETED', '');

      const popover = new DebugPopover(root);
      popover.open(anchor, store, 'item-1', makeScore({ source: 'rules' }), false);

      expect(dlText(root, 'Scoring source')).toBe('rules');
    });

    it('shows "pending" scoring source when no score is provided', (): void => {
      const store = makeTraceStore();
      store.startTrace('item-1', 'post', 'hash' as ContentHash as unknown as string, 100, false);
      store.addEvent('item-1', 'RULES_COMPLETED', '');

      const popover = new DebugPopover(root);
      popover.open(anchor, store, 'item-1', null, false);

      expect(dlText(root, 'Scoring source')).toBe('pending');
    });

    it('shows TMR result detail from TMR_COMPLETED event', (): void => {
      const store = makeTraceStore();
      store.startTrace('item-1', 'post', 'hash' as ContentHash as unknown as string, 100, false);
      store.addEvent('item-1', 'TMR_COMPLETED', 'AI=82%, human=18%');

      const popover = new DebugPopover(root);
      popover.open(anchor, store, 'item-1', makeScore({ source: 'combined' }), false);

      expect(dlText(root, 'TMR result')).toBe('AI=82%, human=18%');
    });

    it('shows "—" for TMR result when no TMR_COMPLETED event exists', (): void => {
      const store = makeTraceStore();
      store.startTrace('item-1', 'post', 'hash' as ContentHash as unknown as string, 100, false);
      store.addEvent('item-1', 'RULES_COMPLETED', '');

      const popover = new DebugPopover(root);
      popover.open(anchor, store, 'item-1', null, false);

      expect(dlText(root, 'TMR result')).toBe('—');
    });
  });

  describe('metadata', (): void => {
    it('renders item type, hash, text length, and truncated flag', (): void => {
      const store = makeTraceStore();
      store.startTrace('item-1', 'comment', 'hash_abcdefghijklmnop' as ContentHash as unknown as string, 240, true);

      const popover = new DebugPopover(root);
      popover.open(anchor, store, 'item-1', null, false);

      expect(dlText(root, 'Item type')).toBe('comment');
      expect(dlText(root, 'Content hash')).toBe('hash_abcdefg…');
      expect(dlText(root, 'Text length')).toBe('240 chars');
      expect(dlText(root, 'Truncated')).toBe('yes');
    });
  });

  describe('result section', (): void => {
    it('renders source, label, confidence, scoringVersion when score is present', (): void => {
      const store = makeTraceStore();
      store.startTrace('item-1', 'post', 'hash' as ContentHash as unknown as string, 100, false);

      const popover = new DebugPopover(root);
      popover.open(anchor, store, 'item-1', makeScore({
        source: 'tmr',
        label: 'probably-ai',
        confidence: 'medium',
        scoringVersion: 'tmr-q4-1',
      }), false);

      expect(dlText(root, 'Source')).toBe('tmr');
      expect(dlText(root, 'Final label')).toBe('probably-ai');
      expect(dlText(root, 'Confidence')).toBe('medium');
      expect(dlText(root, 'Scoring version')).toBe('tmr-q4-1');
    });

    it('omits Result section when no score is present', (): void => {
      const store = makeTraceStore();
      store.startTrace('item-1', 'post', 'hash' as ContentHash as unknown as string, 100, false);

      const popover = new DebugPopover(root);
      popover.open(anchor, store, 'item-1', null, false);

      expect(dlText(root, 'Final label')).toBeNull();
    });
  });

  describe('latency section', (): void => {
    it('shows "—" for unavailable latencies', (): void => {
      const store = makeTraceStore();
      store.startTrace('item-1', 'post', 'hash' as ContentHash as unknown as string, 100, false);
      // No RULES_STARTED/COMPLETED events, so rulesMs is null.

      const popover = new DebugPopover(root);
      popover.open(anchor, store, 'item-1', null, false);

      expect(dlText(root, 'Rules engine')).toBe('—');
      expect(dlText(root, 'AI inference')).toBe('—');
    });

    it('shows millisecond values when latencies are available', (): void => {
      const store = makeTraceStore();
      store.startTrace('item-1', 'post', 'hash' as ContentHash as unknown as string, 100, false);
      store.addEvent('item-1', 'DISCOVERED', '');
      store.addEvent('item-1', 'RULES_STARTED', '');
      store.addEvent('item-1', 'RULES_COMPLETED', '');

      const popover = new DebugPopover(root);
      popover.open(anchor, store, 'item-1', null, false);

      // We can only assert the unit suffix, not the exact value, since timestamps come from Date.now().
      expect(dlText(root, 'Rules engine')).toMatch(/^\d+ms$/);
      expect(dlText(root, 'Total')).toMatch(/^\d+ms$/);
    });

    it('shows "hit" for cacheHit when CACHE_HIT event present', (): void => {
      const store = makeTraceStore();
      store.startTrace('item-1', 'post', 'hash' as ContentHash as unknown as string, 100, false);
      store.addEvent('item-1', 'CACHE_HIT', 'rules');

      const popover = new DebugPopover(root);
      popover.open(anchor, store, 'item-1', null, false);

      expect(dlText(root, 'Cache')).toBe('hit');
    });

    it('shows "miss" for cacheHit when no CACHE_HIT event present', (): void => {
      const store = makeTraceStore();
      store.startTrace('item-1', 'post', 'hash' as ContentHash as unknown as string, 100, false);
      store.addEvent('item-1', 'RULES_STARTED', '');

      const popover = new DebugPopover(root);
      popover.open(anchor, store, 'item-1', null, false);

      expect(dlText(root, 'Cache')).toBe('miss');
    });
  });

  describe('dimensions section', (): void => {
    it('renders all 6 score dimensions formatted to 2 decimal places', (): void => {
      const store = makeTraceStore();
      store.startTrace('item-1', 'post', 'hash' as ContentHash as unknown as string, 100, false);

      const popover = new DebugPopover(root);
      popover.open(anchor, store, 'item-1', makeScore({
        dimensions: {
          authenticity: 0.123,
          specificity: 0.456,
          originality: 0.789,
          usefulness: 0.5,
          engagementBait: 0.01,
          templating: 0.99,
        },
      }), false);

      expect(dlText(root, 'Authenticity')).toBe('0.12');
      expect(dlText(root, 'Specificity')).toBe('0.46');
      expect(dlText(root, 'Originality')).toBe('0.79');
      expect(dlText(root, 'Usefulness')).toBe('0.50');
      expect(dlText(root, 'Engagement bait')).toBe('0.01');
      expect(dlText(root, 'Templating')).toBe('0.99');
    });

    it('omits dimensions section when no score', (): void => {
      const store = makeTraceStore();
      store.startTrace('item-1', 'post', 'hash' as ContentHash as unknown as string, 100, false);

      const popover = new DebugPopover(root);
      popover.open(anchor, store, 'item-1', null, false);

      expect(dlText(root, 'Authenticity')).toBeNull();
    });
  });

  describe('event trace', (): void => {
    it('renders one row per event in order with name and detail', (): void => {
      const store = makeTraceStore();
      store.startTrace('item-1', 'post', 'hash' as ContentHash as unknown as string, 100, false);
      store.addEvent('item-1', 'DISCOVERED', '');
      store.addEvent('item-1', 'RULES_STARTED', '');
      store.addEvent('item-1', 'RULES_COMPLETED', 'feels-human (high)');

      const popover = new DebugPopover(root);
      popover.open(anchor, store, 'item-1', null, false);

      const rows: NodeListOf<HTMLDivElement> = root.querySelectorAll('.debug-trace-event');
      expect(rows.length).toBe(3);
      expect(rows[0]?.textContent).toContain('DISCOVERED');
      expect(rows[2]?.textContent).toContain('RULES_COMPLETED');
      expect(rows[2]?.textContent).toContain('feels-human (high)');
    });

    it('omits the detail span when detail is empty', (): void => {
      const store = makeTraceStore();
      store.startTrace('item-1', 'post', 'hash' as ContentHash as unknown as string, 100, false);
      store.addEvent('item-1', 'DISCOVERED', '');

      const popover = new DebugPopover(root);
      popover.open(anchor, store, 'item-1', null, false);

      const row: HTMLDivElement | null = root.querySelector('.debug-trace-event');
      const detailSpan: HTMLSpanElement | null = row?.querySelector('.debug-trace-detail') ?? null;
      expect(detailSpan).toBeNull();
    });
  });

  describe('lifecycle', (): void => {
    it('isOpen() returns false initially', (): void => {
      const popover = new DebugPopover(root);
      expect(popover.isOpen()).toBe(false);
    });

    it('isOpen() returns true after open()', (): void => {
      const popover = new DebugPopover(root);
      popover.open(anchor, makeTraceStore(), 'x', null, false);
      expect(popover.isOpen()).toBe(true);
    });

    it('clears content on close()', (): void => {
      const popover = new DebugPopover(root);
      popover.open(anchor, makeTraceStore(), 'x', null, false);
      popover.close();

      const popoverEl: HTMLDivElement | null = root.querySelector('.human-signal-debug-popover');
      expect(popoverEl?.children.length).toBe(0);
    });

    it('destroy() removes element from DOM', (): void => {
      const popover = new DebugPopover(root);
      expect(root.querySelector('.human-signal-debug-popover')).not.toBeNull();
      popover.destroy();
      expect(root.querySelector('.human-signal-debug-popover')).toBeNull();
    });
  });

  describe('Copy as JSON button', (): void => {
    it('is included in the rendered output', (): void => {
      const store = makeTraceStore();
      store.startTrace('item-1', 'post', 'hash' as ContentHash as unknown as string, 100, false);

      const popover = new DebugPopover(root);
      popover.open(anchor, store, 'item-1', null, false);

      const btn: HTMLButtonElement | null = root.querySelector('.debug-copy-btn');
      expect(btn).not.toBeNull();
      expect(btn?.textContent).toBe('Copy as JSON');
    });
  });
});
