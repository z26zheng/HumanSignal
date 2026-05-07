import type { StickerColor } from '@/overlay/score-display';

export type StickerState = 'loading' | 'labeled' | 'unclear' | 'unavailable';

export interface StickerProps {
  readonly label: string;
  readonly color: StickerColor;
  readonly state: StickerState;
  readonly itemId: string;
  readonly onClick: () => void;
}

export class SignalSticker {
  private readonly element: HTMLDivElement;
  private props: StickerProps;

  public constructor(props: StickerProps) {
    this.props = props;
    this.element = document.createElement('div');
    this.element.tabIndex = 0;
    this.element.addEventListener('click', props.onClick);
    this.element.addEventListener('keydown', (event: KeyboardEvent): void => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        this.props.onClick();
      }
    });
    this.update(props);
  }

  public getElement(): HTMLDivElement {
    return this.element;
  }

  public update(props: Partial<StickerProps>): void {
    this.props = {
      ...this.props,
      ...props,
    };

    this.element.className = [
      'human-signal-sticker',
      `human-signal-sticker--${this.props.color}`,
      `human-signal-sticker--${this.props.state}`,
    ].join(' ');
    this.element.dataset.itemId = this.props.itemId;
    this.element.setAttribute('role', 'status');
    this.element.setAttribute('aria-label', `Signal: ${this.props.label}`);
    this.element.textContent = this.props.state === 'loading' ? 'Scoring...' : this.props.label;
  }

  public setPosition(x: number, y: number): void {
    this.element.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
  }

  public show(): void {
    this.element.classList.remove('human-signal-sticker--hidden');
  }

  public hide(): void {
    this.element.classList.add('human-signal-sticker--hidden');
  }

  public destroy(): void {
    this.element.remove();
  }
}
