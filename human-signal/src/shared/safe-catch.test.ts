import { afterEach, describe, expect, it, vi } from 'vitest';

import { clearLogEntries, getLogEntries } from '@/shared/logger';
import { errorMessage, safeCatch, safeCatchAsync, toErrorData } from '@/shared/safe-catch';

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

  it('returns operation result when no error is thrown', async (): Promise<void> => {
    const result: string = await safeCatchAsync(async (): Promise<string> => 'ok', 'fallback', 'test.success');
    expect(result).toBe('ok');
  });
});

describe('errorMessage', (): void => {
  it('returns Error.message for Error instances', (): void => {
    expect(errorMessage(new Error('boom'))).toBe('boom');
  });

  it('returns String(value) for non-Error values', (): void => {
    expect(errorMessage('plain string')).toBe('plain string');
    expect(errorMessage(42)).toBe('42');
    expect(errorMessage(null)).toBe('null');
    expect(errorMessage(undefined)).toBe('undefined');
  });

  it('returns Error.message for subclasses of Error', (): void => {
    expect(errorMessage(new TypeError('bad type'))).toBe('bad type');
  });
});

describe('toErrorData', (): void => {
  it('returns errorName and errorMessage for Error instances', (): void => {
    const data: { errorName: string; errorMessage: string } = toErrorData(new TypeError('bad type'));
    expect(data.errorName).toBe('TypeError');
    expect(data.errorMessage).toBe('bad type');
  });

  it('returns unknown errorName for non-Error values', (): void => {
    const data: { errorName: string; errorMessage: string } = toErrorData('plain string');
    expect(data.errorName).toBe('unknown');
    expect(data.errorMessage).toBe('plain string');
  });

  it('handles null and undefined', (): void => {
    expect(toErrorData(null).errorMessage).toBe('null');
    expect(toErrorData(undefined).errorMessage).toBe('undefined');
  });
});
