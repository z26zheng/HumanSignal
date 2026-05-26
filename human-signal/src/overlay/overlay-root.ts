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
      box-shadow: none;
      color: #ffffff;
      cursor: pointer;
      font: 700 9.5px/1 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      padding: 3.5px 6.5px;
      pointer-events: auto;
      transform: translate(-9999px, -9999px);
      transition: background-color 200ms ease, color 200ms ease, opacity 120ms ease;
      user-select: none;
      white-space: nowrap;
      will-change: transform;
    }
    .human-signal-sticker:focus-visible {
      outline: 3px solid #2563eb;
      outline-offset: 2px;
    }
    .human-signal-sticker--green { background: #22c55e; }
    .human-signal-sticker--yellow-green { background: #4ade80; }
    .human-signal-sticker--light-green { background: #bef264; color: #111827; }
    .human-signal-sticker--yellow { background: #eab308; color: #111827; }
    .human-signal-sticker--orange { background: #f97316; }
    .human-signal-sticker--red { background: #ef4444; }
    .human-signal-sticker--gray { background: #9ca3af; color: #111827; }

    .human-signal-sticker--loading {
      animation: human-signal-scoring-pulse 1.5s ease-in-out infinite;
      background: #94a3b8;
      color: #111827;
    }
    .human-signal-sticker--ai-enhancing {
      background-image: linear-gradient(
        90deg,
        transparent 0%,
        rgba(255, 255, 255, 0.10) 40%,
        rgba(255, 255, 255, 0.10) 60%,
        transparent 100%
      );
      background-size: 200% 100%;
      animation: human-signal-shimmer 2s linear infinite;
    }
    .human-signal-sticker--minimized {
      width: 6px;
      height: 6px;
      min-width: 6px;
      padding: 0;
      font-size: 0;
      line-height: 0;
      overflow: hidden;
      box-shadow: 0 2px 6px rgba(15, 23, 42, 0.20);
    }
    .human-signal-sticker--hidden { display: none; }

    .human-signal-sticker__info-icon {
      position: absolute;
      top: -4px;
      right: -4px;
      width: 11px;
      height: 11px;
      border-radius: 50%;
      background: rgba(15, 23, 42, 0.5);
      color: #ffffff;
      font-size: 9px;
      font-weight: 400;
      font-style: normal;
      text-align: center;
      line-height: 11px;
      cursor: pointer;
      pointer-events: auto;
    }
    .human-signal-sticker__info-icon:hover {
      background: rgba(15, 23, 42, 0.8);
    }

    .human-signal-context-menu {
      position: absolute;
      min-width: 180px;
      border: 1px solid #e2e8f0;
      border-radius: 10px;
      background: #ffffff;
      box-shadow: 0 8px 24px rgba(15, 23, 42, 0.18);
      padding: 4px 0;
      pointer-events: auto;
      z-index: 1;
    }
    .human-signal-context-menu__item {
      display: block;
      width: 100%;
      box-sizing: border-box;
      padding: 8px 14px;
      border: 0;
      background: transparent;
      color: #0f172a;
      font: 13px/1.3 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      text-align: left;
      cursor: pointer;
    }
    .human-signal-context-menu__item:hover {
      background: #f1f5f9;
    }

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
    .human-signal-popover__ai-note {
      margin: 6px 0 0;
      color: #64748b;
      font-size: 11px;
      font-style: italic;
    }

    .human-signal-debug-pill {
      position: absolute;
      border-radius: 999px;
      background: #1e293b;
      color: #e2e8f0;
      font: 700 10px/1 'SF Mono', 'Cascadia Code', 'Fira Code', monospace;
      padding: 4px 7px;
      pointer-events: auto;
      transform: translate(-9999px, -9999px);
      user-select: none;
      white-space: nowrap;
      cursor: pointer;
      box-shadow: 0 2px 8px rgba(15, 23, 42, 0.20);
    }
    .human-signal-debug-pill:focus-visible {
      outline: 2px solid #2563eb;
      outline-offset: 1px;
    }
    .human-signal-debug-pill--hidden { display: none; }

    .human-signal-debug-popover {
      position: absolute;
      width: min(360px, calc(100vw - 24px));
      max-height: 480px;
      overflow-y: auto;
      box-sizing: border-box;
      border: 1px solid #334155;
      border-radius: 12px;
      background: #0f172a;
      color: #e2e8f0;
      font: 12px/1.45 'SF Mono', 'Cascadia Code', 'Fira Code', monospace;
      padding: 14px;
      pointer-events: auto;
      transform: translate(-9999px, -9999px);
      box-shadow: 0 16px 48px rgba(0, 0, 0, 0.40);
    }
    .human-signal-debug-popover h2 {
      margin: 0 0 10px;
      font-size: 13px;
      color: #f8fafc;
    }
    .debug-section-heading {
      margin: 12px 0 4px;
      color: #64748b;
      font-size: 11px;
      letter-spacing: 0.05em;
    }
    .debug-dl {
      display: grid;
      grid-template-columns: auto 1fr;
      gap: 2px 12px;
      margin: 0;
      font-size: 11px;
    }
    .debug-dl dt { color: #94a3b8; }
    .debug-dl dd { margin: 0; color: #e2e8f0; font-weight: 600; }
    .debug-trace { display: grid; gap: 2px; }
    .debug-trace-event {
      display: grid;
      grid-template-columns: 90px auto;
      gap: 4px;
      font-size: 11px;
      line-height: 1.5;
    }
    .debug-trace-time { color: #64748b; }
    .debug-trace-name { color: #38bdf8; font-weight: 600; }
    .debug-trace-detail {
      grid-column: 1 / -1;
      color: #94a3b8;
      padding-left: 94px;
      font-size: 10px;
    }
    .debug-copy-btn {
      margin-top: 10px;
      padding: 5px 10px;
      border: 1px solid #475569;
      border-radius: 6px;
      background: #1e293b;
      color: #e2e8f0;
      font: inherit;
      font-size: 11px;
      cursor: pointer;
    }
    .debug-copy-btn:hover { border-color: #2563eb; }

    @keyframes human-signal-scoring-pulse {
      0%, 100% { opacity: 0.4; }
      50% { opacity: 0.7; }
    }
    @keyframes human-signal-shimmer {
      0% { background-position: -100% 0; }
      100% { background-position: 200% 0; }
    }
  `;
  return style;
}
