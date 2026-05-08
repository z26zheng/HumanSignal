const OVERLAY_ROOT_ID: string = 'human-signal-overlay-root';

export class OverlayRoot {
  private root: HTMLDivElement | null = null;

  public create(): HTMLDivElement {
    const existingRoot: HTMLElement | null = document.getElementById(OVERLAY_ROOT_ID);

    if (existingRoot?.tagName === 'DIV') {
      this.root = existingRoot as HTMLDivElement;
      return this.root;
    }

    const root: HTMLDivElement = document.createElement('div');
    root.id = OVERLAY_ROOT_ID;
    root.style.position = 'fixed';
    root.style.top = '0';
    root.style.left = '0';
    root.style.width = '100vw';
    root.style.height = '100vh';
    root.style.pointerEvents = 'none';
    root.style.zIndex = '2147483646';
    root.style.overflow = 'visible';
    root.append(createOverlayStyle());
    document.body.append(root);
    this.root = root;
    return root;
  }

  public getRoot(): HTMLDivElement {
    return this.root ?? this.create();
  }

  public destroy(): void {
    this.root?.remove();
    this.root = null;
  }
}

function createOverlayStyle(): HTMLStyleElement {
  const style: HTMLStyleElement = document.createElement('style');
  style.textContent = `
    .human-signal-sticker {
      position: absolute;
      border: 1px solid rgba(15, 23, 42, 0.12);
      border-radius: 999px;
      box-shadow: 0 4px 14px rgba(15, 23, 42, 0.16);
      color: #ffffff;
      cursor: pointer;
      font: 700 12px/1 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      padding: 6px 9px;
      pointer-events: auto;
      transform: translate(-9999px, -9999px);
      transition: opacity 120ms ease;
      user-select: none;
      white-space: nowrap;
      will-change: transform;
    }
    .human-signal-sticker:focus-visible {
      outline: 3px solid #2563eb;
      outline-offset: 2px;
    }
    .human-signal-sticker--green { background: #15803d; }
    .human-signal-sticker--yellow { background: #ca8a04; color: #111827; }
    .human-signal-sticker--orange { background: #c2410c; }
    .human-signal-sticker--red { background: #b91c1c; }
    .human-signal-sticker--gray { background: #64748b; }
    .human-signal-sticker--loading {
      animation: human-signal-pulse 1.2s ease-in-out infinite;
      background: #94a3b8;
      color: #111827;
    }
    .human-signal-sticker--hidden { display: none; }
    .human-signal-popover {
      position: absolute;
      width: min(320px, calc(100vw - 24px));
      box-sizing: border-box;
      border: 1px solid #e2e8f0;
      border-radius: 14px;
      background: #ffffff;
      box-shadow: 0 16px 48px rgba(15, 23, 42, 0.24);
      color: #0f172a;
      font: 13px/1.45 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      padding: 14px;
      pointer-events: auto;
      transform: translate(-9999px, -9999px);
    }
    .human-signal-popover h2 { margin: 0; font-size: 15px; }
    .human-signal-popover ul { margin: 10px 0; padding-left: 18px; }
    .human-signal-popover button { margin-right: 6px; }
    @keyframes human-signal-pulse {
      0%, 100% { opacity: 0.72; }
      50% { opacity: 1; }
    }
  `;
  return style;
}
