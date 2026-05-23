import { afterEach, describe, expect, it, vi } from 'vitest';

import { closeOffscreenDocument, ensureOffscreenDocument } from '@/background/offscreen-lifecycle';
import { clearLogEntries } from '@/shared/logger';

interface OffscreenStub {
  hasDocument?: ReturnType<typeof vi.fn>;
  createDocument?: ReturnType<typeof vi.fn>;
  closeDocument?: ReturnType<typeof vi.fn>;
  readonly Reason: { LOCAL_STORAGE: string; WORKERS: string };
}

function stubBrowser(offscreen: OffscreenStub): void {
  vi.stubGlobal('browser', {
    offscreen,
    runtime: {
      getURL: (path: string): string => `chrome-extension://test${path}`,
    },
  });
}

describe('ensureOffscreenDocument', (): void => {
  afterEach((): void => {
    vi.unstubAllGlobals();
    clearLogEntries();
  });

  it('returns true without creating when document already exists', async (): Promise<void> => {
    const createDocument = vi.fn();
    stubBrowser({
      hasDocument: vi.fn(async (): Promise<boolean> => true),
      createDocument,
      Reason: { LOCAL_STORAGE: 'LOCAL_STORAGE', WORKERS: 'WORKERS' },
    });

    const ok: boolean = await ensureOffscreenDocument();
    expect(ok).toBe(true);
    expect(createDocument).not.toHaveBeenCalled();
  });

  it('creates document when one does not exist', async (): Promise<void> => {
    const createDocument = vi.fn(async (): Promise<void> => undefined);
    stubBrowser({
      hasDocument: vi.fn(async (): Promise<boolean> => false),
      createDocument,
      Reason: { LOCAL_STORAGE: 'LOCAL_STORAGE', WORKERS: 'WORKERS' },
    });

    const ok: boolean = await ensureOffscreenDocument();
    expect(ok).toBe(true);
    expect(createDocument).toHaveBeenCalledOnce();
    const args: { url: string; reasons: readonly string[] } =
      (createDocument.mock.calls[0] as unknown as readonly [{ url: string; reasons: readonly string[] }])[0];
    expect(args.url).toContain('/offscreen.html');
    expect(args.reasons).toContain('LOCAL_STORAGE');
    expect(args.reasons).toContain('WORKERS');
  });

  it('returns false when createDocument throws', async (): Promise<void> => {
    vi.spyOn(console, 'error').mockImplementation((): void => {});
    stubBrowser({
      hasDocument: vi.fn(async (): Promise<boolean> => false),
      createDocument: vi.fn(async (): Promise<never> => {
        throw new Error('offscreen unavailable');
      }),
      Reason: { LOCAL_STORAGE: 'LOCAL_STORAGE', WORKERS: 'WORKERS' },
    });

    const ok: boolean = await ensureOffscreenDocument();
    expect(ok).toBe(false);
  });

  it('treats hasDocument throwing as "no document" and tries to create', async (): Promise<void> => {
    vi.spyOn(console, 'warn').mockImplementation((): void => {});
    const createDocument = vi.fn(async (): Promise<void> => undefined);
    stubBrowser({
      hasDocument: vi.fn(async (): Promise<never> => {
        throw new Error('not supported');
      }),
      createDocument,
      Reason: { LOCAL_STORAGE: 'LOCAL_STORAGE', WORKERS: 'WORKERS' },
    });

    const ok: boolean = await ensureOffscreenDocument();
    expect(ok).toBe(true);
    expect(createDocument).toHaveBeenCalledOnce();
  });
});

describe('closeOffscreenDocument', (): void => {
  afterEach((): void => {
    vi.unstubAllGlobals();
    clearLogEntries();
  });

  it('returns true and is a no-op when no document is present', async (): Promise<void> => {
    const closeDocument = vi.fn();
    stubBrowser({
      hasDocument: vi.fn(async (): Promise<boolean> => false),
      closeDocument,
      Reason: { LOCAL_STORAGE: 'LOCAL_STORAGE', WORKERS: 'WORKERS' },
    });

    const ok: boolean = await closeOffscreenDocument();
    expect(ok).toBe(true);
    expect(closeDocument).not.toHaveBeenCalled();
  });

  it('closes document and returns true when present', async (): Promise<void> => {
    const closeDocument = vi.fn(async (): Promise<void> => undefined);
    stubBrowser({
      hasDocument: vi.fn(async (): Promise<boolean> => true),
      closeDocument,
      Reason: { LOCAL_STORAGE: 'LOCAL_STORAGE', WORKERS: 'WORKERS' },
    });

    const ok: boolean = await closeOffscreenDocument();
    expect(ok).toBe(true);
    expect(closeDocument).toHaveBeenCalledOnce();
  });

  it('returns false when close throws and document is still present', async (): Promise<void> => {
    vi.spyOn(console, 'error').mockImplementation((): void => {});
    let hasCallCount: number = 0;
    stubBrowser({
      // First call: present (we should attempt to close).
      // Second call (after failure): still present (close did nothing).
      hasDocument: vi.fn(async (): Promise<boolean> => {
        hasCallCount++;
        return true;
      }),
      closeDocument: vi.fn(async (): Promise<never> => {
        throw new Error('close failed');
      }),
      Reason: { LOCAL_STORAGE: 'LOCAL_STORAGE', WORKERS: 'WORKERS' },
    });

    const ok: boolean = await closeOffscreenDocument();
    expect(ok).toBe(false);
    expect(hasCallCount).toBeGreaterThanOrEqual(2);
  });

  it('returns true when close throws but document is actually closed afterwards', async (): Promise<void> => {
    vi.spyOn(console, 'error').mockImplementation((): void => {});
    let hasCallCount: number = 0;
    stubBrowser({
      hasDocument: vi.fn(async (): Promise<boolean> => {
        hasCallCount++;
        return hasCallCount === 1; // present first, gone after
      }),
      closeDocument: vi.fn(async (): Promise<never> => {
        throw new Error('close raced and document was closed elsewhere');
      }),
      Reason: { LOCAL_STORAGE: 'LOCAL_STORAGE', WORKERS: 'WORKERS' },
    });

    const ok: boolean = await closeOffscreenDocument();
    expect(ok).toBe(true);
  });
});
