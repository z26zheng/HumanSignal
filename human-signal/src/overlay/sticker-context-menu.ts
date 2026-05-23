export interface ContextMenuOptions {
  readonly onHideThis: () => void;
  readonly onHideAllOnPost: () => void;
}

export class StickerContextMenu {
  private readonly root: HTMLElement;
  private element: HTMLDivElement | null = null;

  private readonly handleOutsideClick = (event: MouseEvent): void => {
    if (
      this.element !== null &&
      event.target instanceof Node &&
      !this.element.contains(event.target)
    ) {
      this.hide();
    }
  };

  private readonly handleKeydown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') {
      this.hide();
      return;
    }

    if (this.element === null) {
      return;
    }

    const items: readonly HTMLButtonElement[] = Array.from(
      this.element.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'),
    );

    if (items.length === 0) {
      return;
    }

    const currentIndex: number = items.indexOf(document.activeElement as HTMLButtonElement);

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      items[(currentIndex + 1) % items.length]?.focus();
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      items[(currentIndex - 1 + items.length) % items.length]?.focus();
    }
  };

  public constructor(root: HTMLElement) {
    this.root = root;
  }

  public show(x: number, y: number, options: ContextMenuOptions): void {
    this.hide();

    const menu: HTMLDivElement = document.createElement('div');
    menu.className = 'human-signal-context-menu';
    menu.setAttribute('role', 'menu');
    menu.setAttribute('aria-label', 'Sticker options');

    const hideThisItem: HTMLButtonElement = createMenuItem('Hide this sticker', (): void => {
      options.onHideThis();
      this.hide();
    });

    const hideAllItem: HTMLButtonElement = createMenuItem('Hide all stickers on this post', (): void => {
      options.onHideAllOnPost();
      this.hide();
    });

    menu.append(hideThisItem, hideAllItem);
    menu.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;

    this.root.append(menu);
    this.element = menu;
    hideThisItem.focus();

    document.addEventListener('click', this.handleOutsideClick, true);
    document.addEventListener('keydown', this.handleKeydown);
  }

  public hide(): void {
    if (this.element === null) {
      return;
    }

    this.element.remove();
    this.element = null;
    document.removeEventListener('click', this.handleOutsideClick, true);
    document.removeEventListener('keydown', this.handleKeydown);
  }

  public destroy(): void {
    this.hide();
  }
}

function createMenuItem(label: string, onClick: () => void): HTMLButtonElement {
  const button: HTMLButtonElement = document.createElement('button');
  button.className = 'human-signal-context-menu__item';
  button.type = 'button';
  button.textContent = label;
  button.setAttribute('role', 'menuitem');
  button.addEventListener('click', onClick);
  return button;
}
