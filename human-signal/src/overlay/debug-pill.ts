export class DebugPill {
  private readonly element: HTMLDivElement;
  private visible: boolean = false;

  public constructor(
    private readonly itemId: string,
    private readonly onClick: () => void,
  ) {
    this.element = document.createElement('div');
    this.element.className = 'human-signal-debug-pill';
    this.element.tabIndex = 0;
    this.element.setAttribute('role', 'button');
    this.element.setAttribute('aria-label', 'Debug info');
    this.element.textContent = '🔧 …';

    this.element.addEventListener('click', (event: MouseEvent): void => {
      event.stopPropagation();
      this.onClick();
    });
    this.element.addEventListener('keydown', (event: KeyboardEvent): void => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        this.onClick();
      }
    });
  }

  public getElement(): HTMLDivElement {
    return this.element;
  }

  public updateText(text: string): void {
    this.element.textContent = text;
  }

  public setPosition(x: number, y: number, stickerWidth: number): void {
    const pillX: number = Math.round(x + stickerWidth + 4);
    const maxX: number = window.innerWidth - 220;
    this.element.style.transform = `translate(${Math.min(pillX, maxX)}px, ${Math.round(y)}px)`;
  }

  public show(): void {
    this.visible = true;
    this.element.classList.remove('human-signal-debug-pill--hidden');
  }

  public hide(): void {
    this.visible = false;
    this.element.classList.add('human-signal-debug-pill--hidden');
  }

  public isVisible(): boolean {
    return this.visible;
  }

  public destroy(): void {
    this.element.remove();
  }
}
