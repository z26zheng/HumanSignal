import type { StickerColor } from '@/overlay/score-display';

export type StickerState = 'loading' | 'labeled' | 'ai-enhancing' | 'minimized' | 'unavailable';

export interface StickerProps {
  readonly label: string;
  readonly color: StickerColor;
  readonly state: StickerState;
  readonly itemId: string;
  readonly onClick: () => void;
  readonly onContextMenu?: () => void;
  readonly showInfoIcon?: boolean;
  readonly onInfoClick?: () => void;
}

export class SignalSticker {
  private readonly element: HTMLDivElement;
  private props: StickerProps;
  private savedProps: StickerProps | null = null;
  private infoIconElement: HTMLSpanElement | null = null;
  private isAllowedVisible: boolean = true;
  private isInViewport: boolean = true;

  public constructor(props: StickerProps) {
    this.props = props;
    this.element = document.createElement('div');
    this.element.tabIndex = 0;
    this.element.addEventListener('click', (event: MouseEvent): void => {
      if (this.savedProps !== null) {
        event.stopPropagation();
        this.restore();
        return;
      }
      this.props.onClick();
    });
    this.element.addEventListener('keydown', (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault();
        this.minimize();
        return;
      }
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        if (this.savedProps !== null) {
          this.restore();
          return;
        }
        this.props.onClick();
      }
    });
    this.element.addEventListener('contextmenu', (event: MouseEvent): void => {
      event.preventDefault();
      this.props.onContextMenu?.();
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

    if (this.props.state === 'loading') {
      this.element.textContent = 'Scoring...';
      this.element.title = 'Analyzing this post...';
    } else if (this.props.state === 'minimized') {
      this.element.textContent = '';
      this.element.title = '';
    } else if (this.props.state === 'ai-enhancing') {
      this.element.textContent = this.props.label;
      this.element.title = 'Enhancing with on-device AI...';
    } else {
      this.element.textContent = this.props.label;
      this.element.title = `Signal: ${this.props.label}`;
    }

    this.syncInfoIcon();
    this.syncVisibility();
  }

  public minimize(): void {
    if (this.props.state === 'minimized') {
      return;
    }
    this.savedProps = { ...this.props };
    this.update({ state: 'minimized' });
  }

  public restore(): void {
    if (this.savedProps === null) {
      return;
    }
    const restored: StickerProps = this.savedProps;
    this.savedProps = null;
    this.update(restored);
  }

  public isMinimized(): boolean {
    return this.props.state === 'minimized';
  }

  public setPosition(x: number, y: number): void {
    this.element.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
  }

  public show(): void {
    this.setAllowedVisible(true);
  }

  public hide(): void {
    this.setAllowedVisible(false);
  }

  public setViewportVisible(isVisible: boolean): void {
    this.isInViewport = isVisible;
    this.syncVisibility();
  }

  public destroy(): void {
    this.element.remove();
  }

  private setAllowedVisible(isVisible: boolean): void {
    this.isAllowedVisible = isVisible;
    this.syncVisibility();
  }

  private syncVisibility(): void {
    this.element.classList.toggle(
      'human-signal-sticker--hidden',
      !this.isAllowedVisible || !this.isInViewport,
    );
  }

  private syncInfoIcon(): void {
    if (this.props.showInfoIcon === true && this.props.state !== 'minimized') {
      if (this.infoIconElement === null) {
        this.infoIconElement = document.createElement('span');
        this.infoIconElement.className = 'human-signal-sticker__info-icon';
        this.infoIconElement.textContent = '\u00d7';
        this.infoIconElement.title = 'Dismiss this sticker';
        this.infoIconElement.tabIndex = 0;
        this.infoIconElement.setAttribute('role', 'button');
        this.infoIconElement.setAttribute('aria-label', 'Dismiss sticker');
        this.infoIconElement.addEventListener('click', (event: MouseEvent): void => {
          event.stopPropagation();
          this.minimize();
        });
        this.infoIconElement.addEventListener('keydown', (event: KeyboardEvent): void => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            event.stopPropagation();
            this.minimize();
          }
        });
      }
      if (!this.element.contains(this.infoIconElement)) {
        this.element.append(this.infoIconElement);
      }
    } else if (this.infoIconElement !== null) {
      this.infoIconElement.remove();
      this.infoIconElement = null;
    }
  }
}
