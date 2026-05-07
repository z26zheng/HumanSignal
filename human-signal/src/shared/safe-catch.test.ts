import { afterEach, describe, expect, it, vi } from 'vitest';

import { clearLogEntries, getLogEntries } from '@/shared/logger';
import { safeCatch, safeCatchAsync } from '@/shared/safe-catch';

describe('safeCatch', (): void => {
  afterEach((): void => {
    clearLogEntries();
    vi.restoreAllMocks();
  });

  it('returns the operation result when no error is thrown', (): void => {
    const result: string = safeCatch((): string => 'ok', 'fallback', 'test.safeCatch');

    expect(result).toBe('ok');
  });

  it('returns fallback and logs when an operation throws', (): void => {
    vi.spyOn(console, 'error').mockImplementation((): void => {});

    const result: string = safeCatch((): string => {
      throw new Error('boom');
    }, 'fallback', 'test.safeCatch');

    expect(result).toBe('fallback');
    expect(getLogEntries()[0]?.context).toBe('test.safeCatch');
  });
});

describe('safeCatchAsync', (): void => {
  afterEach((): void => {
    clearLogEntries();
    vi.restoreAllMocks();
  });

  it('returns fallback and logs when an async operation rejects', async (): Promise<void> => {
    vi.spyOn(console, 'error').mockImplementation((): void => {});

    const result: string = await safeCatchAsync(
      async (): Promise<string> => {
        throw new Error('boom');
      },
      'fallback',
      'test.safeCatchAsync',
    );

    expect(result).toBe('fallback');
    expect(getLogEntries()[0]?.context).toBe('test.safeCatchAsync');
  });
});
