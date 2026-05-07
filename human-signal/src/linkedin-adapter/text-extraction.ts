const BLOCK_TAGS: ReadonlySet<string> = new Set([
  'ARTICLE',
  'BLOCKQUOTE',
  'BR',
  'DIV',
  'LI',
  'P',
  'SECTION',
]);

const REMOVED_TEXTS: ReadonlySet<string> = new Set(['see more', 'show more', '...see more']);

export function extractText(element: HTMLElement): string {
  const parts: string[] = [];
  collectText(element, parts);
  return normalizeExtractedText(parts.join(''));
}

export function normalizeExtractedText(value: string): string {
  return value
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function collectText(node: Node, parts: string[]): void {
  if (node.nodeType === 3) {
    appendTextNode(node, parts);
    return;
  }

  if (node.nodeType !== 1) {
    return;
  }

  const element: HTMLElement = node as HTMLElement;

  if (shouldSkipElement(element)) {
    return;
  }

  const tagName: string = element.tagName;

  if (tagName === 'BR') {
    parts.push('\n');
    return;
  }

  for (const childNode of Array.from(element.childNodes)) {
    collectText(childNode, parts);
  }

  if (BLOCK_TAGS.has(tagName)) {
    parts.push('\n');
  }
}

function appendTextNode(node: Node, parts: string[]): void {
  const text: string = node.textContent ?? '';
  const normalizedText: string = text.replace(/\s+/g, ' ').trim();

  if (normalizedText === '' || REMOVED_TEXTS.has(normalizedText.toLowerCase())) {
    return;
  }

  parts.push(`${normalizedText} `);
}

function shouldSkipElement(element: HTMLElement): boolean {
  const ariaLabel: string = element.getAttribute('aria-label')?.toLowerCase() ?? '';
  const text: string = element.textContent?.trim().toLowerCase() ?? '';

  return (
    element.hidden ||
    element.getAttribute('aria-hidden') === 'true' ||
    (isInteractiveElement(element) && REMOVED_TEXTS.has(text)) ||
    ariaLabel === 'see more'
  );
}

function isInteractiveElement(element: HTMLElement): boolean {
  return element.tagName === 'BUTTON' || element.tagName === 'A';
}
