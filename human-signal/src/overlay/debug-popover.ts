import type { EventTraceStore, ItemTrace, LatencySummary, TraceEvent } from '@/shared/event-trace';
import type { ScoringResult } from '@/shared/types';

export class DebugPopover {
  private readonly element: HTMLDivElement;
  private anchorElement: HTMLElement | null = null;

  private readonly handleOutsideClick = (event: MouseEvent): void => {
    if (this.anchorElement !== null && event.target instanceof Node && !this.element.contains(event.target)) {
      this.close();
    }
  };

  private readonly handleKeydown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') {
      this.close();
    }
  };

  private readonly handleScroll = (): void => {
    if (this.anchorElement !== null) {
      this.close();
    }
  };

  public constructor(private readonly root: HTMLElement) {
    this.element = document.createElement('div');
    this.element.className = 'human-signal-debug-popover';
    this.element.setAttribute('role', 'dialog');
    this.element.setAttribute('aria-label', 'Debug info');
    this.element.tabIndex = -1;
    this.root.append(this.element);

    document.addEventListener('click', this.handleOutsideClick, true);
    document.addEventListener('keydown', this.handleKeydown);
    window.addEventListener('scroll', this.handleScroll, true);
  }

  public open(
    anchor: HTMLElement,
    traceStore: EventTraceStore,
    itemId: string,
    score: ScoringResult | null,
    geminiAvailable: boolean,
  ): void {
    this.anchorElement = anchor;
    this.render(traceStore, itemId, score, geminiAvailable);
    this.position(anchor);
    this.element.focus();
  }

  public close(): void {
    this.anchorElement = null;
    this.element.replaceChildren();
    this.element.style.transform = 'translate(-9999px, -9999px)';
  }

  public isOpen(): boolean {
    return this.anchorElement !== null;
  }

  public destroy(): void {
    this.close();
    document.removeEventListener('click', this.handleOutsideClick, true);
    document.removeEventListener('keydown', this.handleKeydown);
    window.removeEventListener('scroll', this.handleScroll, true);
    this.element.remove();
  }

  private render(traceStore: EventTraceStore, itemId: string, score: ScoringResult | null, geminiAvailable: boolean): void {
    const trace: ItemTrace | null = traceStore.getTrace(itemId);

    if (trace === null) {
      this.element.textContent = 'No debug data available.';
      return;
    }

    const heading: HTMLHeadingElement = document.createElement('h2');
    heading.textContent = `🔧 Debug: ${itemId.slice(0, 16)}`;

    const meta: HTMLDListElement = createDl([
      ['Item type', trace.itemType],
      ['Content hash', `${trace.contentHash.slice(0, 12)}…`],
      ['Text length', `${trace.textLength} chars`],
      ['Truncated', trace.isTruncated ? 'yes' : 'no'],
    ]);

    const aiStatusHeading: HTMLElement = createSectionHeading('Detection Engine');
    const itemAiStatus: string = deriveItemAiStatus(trace, geminiAvailable);
    const tmrEvent = trace.events.find((e) => e.event === 'TMR_COMPLETED');
    const tmrDetail: string = tmrEvent !== undefined ? tmrEvent.detail : '—';
    const aiStatusDl: HTMLDListElement = createDl([
      ['TMR status', itemAiStatus],
      ['TMR result', tmrDetail],
      ['Scoring source', score?.source ?? 'pending'],
    ]);

    const traceHeading: HTMLElement = createSectionHeading('Event Trace');
    const traceList: HTMLDivElement = document.createElement('div');
    traceList.className = 'debug-trace';
    for (const event of trace.events) {
      traceList.append(createTraceEventRow(event));
    }

    const children: Node[] = [heading, meta, aiStatusHeading, aiStatusDl, traceHeading, traceList];

    if (score !== null) {
      const resultHeading: HTMLElement = createSectionHeading('Result');
      const resultDl: HTMLDListElement = createDl([
        ['Source', score.source],
        ['Final label', score.label],
        ['Confidence', score.confidence],
        ['Scoring version', score.scoringVersion],
      ]);
      children.push(resultHeading, resultDl);
    }

    const latency: LatencySummary | null = traceStore.getLatencySummary(itemId);
    if (latency !== null) {
      const latencyHeading: HTMLElement = createSectionHeading('Latency Summary');
      const latencyDl: HTMLDListElement = createDl([
        ['Rules engine', latency.rulesMs !== null ? `${latency.rulesMs}ms` : '—'],
        ['AI queue wait', latency.aiQueueWaitMs !== null ? `${latency.aiQueueWaitMs}ms` : '—'],
        ['AI inference', latency.aiInferenceMs !== null ? `${latency.aiInferenceMs}ms` : '—'],
        ['Total', latency.totalMs !== null ? `${latency.totalMs}ms` : '—'],
        ['Cache', latency.cacheHit ? 'hit' : 'miss'],
      ]);
      children.push(latencyHeading, latencyDl);
    }

    if (score !== null) {
      const dimHeading: HTMLElement = createSectionHeading('Dimensions');
      const dimDl: HTMLDListElement = createDl([
        ['Authenticity', score.dimensions.authenticity.toFixed(2)],
        ['Specificity', score.dimensions.specificity.toFixed(2)],
        ['Originality', score.dimensions.originality.toFixed(2)],
        ['Usefulness', score.dimensions.usefulness.toFixed(2)],
        ['Engagement bait', score.dimensions.engagementBait.toFixed(2)],
        ['Templating', score.dimensions.templating.toFixed(2)],
      ]);
      children.push(dimHeading, dimDl);
    }

    const copyBtn: HTMLButtonElement = document.createElement('button');
    copyBtn.type = 'button';
    copyBtn.className = 'debug-copy-btn';
    copyBtn.textContent = 'Copy as JSON';
    copyBtn.addEventListener('click', (): void => {
      const json: Record<string, unknown> | null = traceStore.toJSON(itemId);
      if (json !== null) {
        void navigator.clipboard.writeText(JSON.stringify(json, null, 2)).catch((): void => {});
      }
    });
    children.push(copyBtn);

    this.element.replaceChildren(...children);
  }

  private position(anchor: HTMLElement): void {
    const rect: DOMRect = anchor.getBoundingClientRect();
    const x: number = Math.min(rect.left, window.innerWidth - 360);
    const y: number = Math.min(rect.bottom + 8, window.innerHeight - 400);
    this.element.style.transform = `translate(${Math.max(12, x)}px, ${Math.max(12, y)}px)`;
  }
}

function createSectionHeading(text: string): HTMLElement {
  const el: HTMLParagraphElement = document.createElement('p');
  el.className = 'debug-section-heading';
  el.textContent = `── ${text} ──`;
  return el;
}

function createDl(pairs: readonly (readonly [string, string])[]): HTMLDListElement {
  const dl: HTMLDListElement = document.createElement('dl');
  dl.className = 'debug-dl';
  for (const [key, value] of pairs) {
    const dt: HTMLElement = document.createElement('dt');
    dt.textContent = key;
    const dd: HTMLElement = document.createElement('dd');
    dd.textContent = value;
    dl.append(dt, dd);
  }
  return dl;
}

function createTraceEventRow(event: TraceEvent): HTMLDivElement {
  const row: HTMLDivElement = document.createElement('div');
  row.className = 'debug-trace-event';

  const time: HTMLSpanElement = document.createElement('span');
  time.className = 'debug-trace-time';
  const d: Date = new Date(event.timestamp);
  time.textContent = `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}.${pad3(d.getMilliseconds())}`;

  const name: HTMLSpanElement = document.createElement('span');
  name.className = 'debug-trace-name';
  name.textContent = event.event;

  row.append(time, name);

  if (event.detail !== '') {
    const detail: HTMLSpanElement = document.createElement('span');
    detail.className = 'debug-trace-detail';
    detail.textContent = event.detail;
    row.append(detail);
  }

  return row;
}

function pad2(n: number): string {
  return n.toString().padStart(2, '0');
}

function pad3(n: number): string {
  return n.toString().padStart(3, '0');
}

function deriveItemAiStatus(trace: ItemTrace, _geminiAvailable: boolean): string {
  const eventNames: readonly string[] = trace.events.map((e) => e.event);

  if (eventNames.includes('TMR_COMPLETED')) {
    if (eventNames.includes('STICKER_UPGRADED')) return '✅ TMR upgraded label';
    if (eventNames.includes('STICKER_UNCHANGED')) return '✅ TMR confirmed rules result';
    return '✅ TMR completed';
  }
  if (eventNames.includes('TMR_STARTED')) return '⏳ TMR processing...';
  if (eventNames.includes('TMR_FAILED')) return '❌ TMR failed, using rules';
  if (eventNames.includes('AI_COMPLETED')) return '✅ AI completed';
  if (eventNames.includes('STICKER_UNCHANGED')) return '✅ AI confirmed rules result';
  if (eventNames.includes('STICKER_UPGRADED')) return '✅ AI upgraded label';
  if (eventNames.includes('AI_FAILED')) return '❌ AI failed, using rules fallback';
  if (eventNames.includes('CACHE_HIT')) return '📦 Cache hit';
  if (eventNames.includes('RULES_COMPLETED')) return '⏳ TMR pending...';
  return '… Scoring in progress';
}
