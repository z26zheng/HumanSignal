import { afterEach, describe, expect, it, vi } from 'vitest';

import { clearLogEntries, getLogEntries, logger } from '@/shared/logger';

describe('logger', (): void => {
  afterEach((): void => {
    clearLogEntries();
    vi.restoreAllMocks();
  });

  it('stores structured log entries in insertion order', (): void => {
    vi.spyOn(console, 'info').mockImplementation((): void => {});

    logger.info('test.context', 'First message', { count: 1 });
    logger.info('test.context', 'Second message', { count: 2 });

    const entries = getLogEntries();

    expect(entries).toHaveLength(2);
    expect(entries[0]?.message).toBe('First message');
    expect(entries[1]?.data).toEqual({ count: 2 });
  });

  it('caps the ring buffer at 200 entries', (): void => {
    vi.spyOn(console, 'info').mockImplementation((): void => {});

    for (let index: number = 0; index < 205; index += 1) {
      logger.info('test.context', `Message ${index}`);
    }

    const entries = getLogEntries();

    expect(entries).toHaveLength(200);
    expect(entries[0]?.message).toBe('Message 5');
  });
});
