import { JSDOM } from 'jsdom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ExplanationPopover } from '@/overlay/explanation-popover';
import { SignalSticker } from '@/overlay/signal-sticker';

import type { ItemId, ScoringResult, ScoringSource } from '@/shared/types';

function makeScore(overrides: Partial<ScoringResult> = {}): ScoringResult {
  const base: ScoringResult = {
    itemId: 'item-1' as ItemId,
    label: 'feels-human',
    confidence: 'high',
    explanation: 'Specific metric mentioned. Concrete date present.',
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

function makeSticker(itemId: string = 'item-1'): SignalSticker {
  return new SignalSticker({
    label: 'Specific',
    color: 'green',
    state: 'labeled',
    itemId,
    onClick: (): void => {},
  });
}

describe('ExplanationPopover', (): void => {
  let root: HTMLDivElement;

  beforeEach((): void => {
    const dom: JSDOM = new JSDOM('<!doctype html><body></body>', {
      url: 'https://www.linkedin.com/feed/',
    });
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('Node', dom.window.Node);
    vi.stubGlobal('KeyboardEvent', dom.window.KeyboardEvent);
    vi.stubGlobal('MouseEvent', dom.window.MouseEvent);

    root = document.createElement('div');
    document.body.append(root);
  });

  afterEach((): void => {
    vi.unstubAllGlobals();
  });

  describe('source formatting', (): void => {
    /**
     * The "Source" line tells the user which engine produced the score.
     * The mapping must be stable because users learn to recognize these labels.
     */
    const cases: ReadonlyArray<{ source: ScoringSource; expected: string }> = [
      { source: 'rules', expected: 'Source: Rules-based' },
      { source: 'tmr', expected: 'Source: TMR' },
      { source: 'gemini', expected: 'Source: AI-enhanced' },
      { source: 'combined', expected: 'Source: TMR + Rules' },
    ];

    for (const c of cases) {
      it(`shows "${c.expected}" for source "${c.source}"`, (): void => {
        const popover = new ExplanationPopover(root);
        const sticker = makeSticker();
        popover.open(sticker, makeScore({ source: c.source }));

        const sourceText: string = (root.querySelector('p')?.textContent ?? '').trim();
        expect(sourceText).toBe(c.expected);
      });
    }
  });

  describe('rendering', (): void => {
    it('renders title with label text and confidence', (): void => {
      const popover = new ExplanationPopover(root);
      popover.open(makeSticker(), makeScore({ label: 'probably-ai', confidence: 'medium' }));

      const heading: HTMLHeadingElement | null = root.querySelector('h2');
      expect(heading?.textContent).toContain('medium');
      expect(heading?.textContent).toContain('·');
    });

    it('splits explanation sentences into list items (max 3)', (): void => {
      const popover = new ExplanationPopover(root);
      popover.open(makeSticker(), makeScore({
        explanation: 'Reason one. Reason two. Reason three. Reason four. Reason five.',
      }));

      const items: NodeListOf<HTMLLIElement> = root.querySelectorAll('li');
      expect(items.length).toBe(3);
      expect(items[0]?.textContent).toBe('Reason one.');
      expect(items[2]?.textContent).toBe('Reason three.');
    });

    it('shows fallback when explanation is empty', (): void => {
      const popover = new ExplanationPopover(root);
      popover.open(makeSticker(), makeScore({ explanation: '' }));

      const item: HTMLLIElement | null = root.querySelector('li');
      expect(item?.textContent).toBe('No explanation available.');
    });

    it('renders feedback buttons (agree, disagree, Not useful)', (): void => {
      const popover = new ExplanationPopover(root);
      popover.open(makeSticker(), makeScore());

      const buttons: HTMLButtonElement[] = Array.from(root.querySelectorAll('button'));
      const labels: string[] = buttons.map((b) => b.textContent ?? '');
      expect(labels).toContain('agree');
      expect(labels).toContain('disagree');
      expect(labels).toContain('Not useful');
    });

    it('sets data-color attribute matching sticker color', (): void => {
      const popover = new ExplanationPopover(root);
      popover.open(makeSticker(), makeScore({ label: 'probably-ai' }));

      const popoverEl: HTMLDivElement | null = root.querySelector('.human-signal-popover');
      expect(popoverEl?.dataset['color']).toBeDefined();
    });
  });

  describe('lifecycle', (): void => {
    it('is closed initially', (): void => {
      const popover = new ExplanationPopover(root);
      expect(popover.isOpen()).toBe(false);
    });

    it('reports open after open() call', (): void => {
      const popover = new ExplanationPopover(root);
      popover.open(makeSticker(), makeScore());
      expect(popover.isOpen()).toBe(true);
    });

    it('reports closed after close() call', (): void => {
      const popover = new ExplanationPopover(root);
      popover.open(makeSticker(), makeScore());
      popover.close();
      expect(popover.isOpen()).toBe(false);
    });

    it('clears popover content on close', (): void => {
      const popover = new ExplanationPopover(root);
      popover.open(makeSticker(), makeScore());
      popover.close();

      const popoverEl: HTMLDivElement | null = root.querySelector('.human-signal-popover');
      expect(popoverEl?.children.length).toBe(0);
    });

    it('updateScore() is a no-op when popover is closed', (): void => {
      const popover = new ExplanationPopover(root);
      popover.updateScore(makeScore({ label: 'probably-ai' }));

      const popoverEl: HTMLDivElement | null = root.querySelector('.human-signal-popover');
      expect(popoverEl?.children.length).toBe(0);
    });

    it('updateScore() re-renders when popover is open', (): void => {
      const popover = new ExplanationPopover(root);
      popover.open(makeSticker(), makeScore({ label: 'feels-human', source: 'rules' }));
      popover.updateScore(makeScore({ label: 'probably-ai', source: 'combined' }));

      const sourceText: string = (root.querySelector('p')?.textContent ?? '').trim();
      expect(sourceText).toBe('Source: TMR + Rules');
    });

    it('destroy() removes element from DOM', (): void => {
      const popover = new ExplanationPopover(root);
      expect(root.querySelector('.human-signal-popover')).not.toBeNull();
      popover.destroy();
      expect(root.querySelector('.human-signal-popover')).toBeNull();
    });
  });
});
