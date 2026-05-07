import { getLabelText, getStickerColor } from '@/overlay/score-display';
import { sendToBackground } from '@/shared/messaging';

import type { SignalSticker } from '@/overlay/signal-sticker';
import type { FeedbackType, ScoringResult } from '@/shared/types';

export class ExplanationPopover {
  private readonly element: HTMLDivElement;
  private anchorSticker: SignalSticker | null = null;

  public constructor(private readonly root: HTMLElement) {
    this.element = document.createElement('div');
    this.element.className = 'human-signal-popover';
    this.element.setAttribute('role', 'dialog');
    this.root.append(this.element);

    document.addEventListener('keydown', (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        this.close();
      }
    });
  }

  public open(sticker: SignalSticker, score: ScoringResult): void {
    this.anchorSticker = sticker;
    this.render(score);
    this.position(sticker.getElement());
    this.element.focus();
  }

  public close(): void {
    this.anchorSticker = null;
    this.element.replaceChildren();
    this.element.style.transform = 'translate(-9999px, -9999px)';
  }

  public updateScore(score: ScoringResult): void {
    if (this.anchorSticker === null) {
      return;
    }

    this.render(score);
    this.position(this.anchorSticker.getElement());
  }

  public isOpen(): boolean {
    return this.anchorSticker !== null;
  }

  private render(score: ScoringResult): void {
    const title: HTMLHeadingElement = document.createElement('h2');
    title.textContent = `${getLabelText(score.label)} · ${score.confidence}`;

    const reasons: HTMLUListElement = document.createElement('ul');
    for (const reason of splitReasons(score.explanation)) {
      const item: HTMLLIElement = document.createElement('li');
      item.textContent = reason;
      reasons.append(item);
    }

    const source: HTMLParagraphElement = document.createElement('p');
    source.textContent = `Source: ${score.source === 'gemini' ? 'AI-enhanced' : 'Rules-based'}`;

    const actions: HTMLDivElement = document.createElement('div');
    for (const feedback of ['agree', 'disagree', 'notUseful'] as const) {
      actions.append(createFeedbackButton(score, feedback));
    }

    this.element.replaceChildren(title, reasons, source, actions);
    this.element.dataset.color = getStickerColor(score.label);
  }

  private position(anchorElement: HTMLElement): void {
    const rect: DOMRect = anchorElement.getBoundingClientRect();
    const x: number = Math.min(rect.left, window.innerWidth - 332);
    const y: number = Math.min(rect.bottom + 8, window.innerHeight - 220);
    this.element.style.transform = `translate(${Math.max(12, x)}px, ${Math.max(12, y)}px)`;
  }
}

function createFeedbackButton(score: ScoringResult, feedback: FeedbackType): HTMLButtonElement {
  const button: HTMLButtonElement = document.createElement('button');
  button.type = 'button';
  button.textContent = feedback === 'notUseful' ? 'Not useful' : feedback;
  button.addEventListener('click', (): void => {
    void sendToBackground({
      type: 'FEEDBACK',
      source: 'content-script',
      itemId: score.itemId,
      feedback,
      label: score.label,
      scoringSource: score.source,
    }).then((): void => {
      button.setAttribute('aria-pressed', 'true');
      button.disabled = true;
    });
  });
  return button;
}

function splitReasons(explanation: string): readonly string[] {
  const reasons: readonly string[] = explanation
    .split(/(?<=\.)\s+/)
    .map((reason: string): string => reason.trim())
    .filter((reason: string): boolean => reason.length > 0)
    .slice(0, 3);

  return reasons.length > 0 ? reasons : ['No explanation available.'];
}
