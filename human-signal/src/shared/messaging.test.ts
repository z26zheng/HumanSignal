import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  clearLogEntries,
  getLogEntries,
} from '@/shared/logger';
import {
  createErrorResponse,
  createMessage,
  createSuccessResponse,
  isHumanSignalMessage,
  sendToBackground,
} from '@/shared/messaging';

describe('messaging contracts', (): void => {
  afterEach((): void => {
    vi.unstubAllGlobals();
    clearLogEntries();
  });

  it('creates messages with request ids', (): void => {
    const message = createMessage({
      type: 'PING',
      source: 'popup',
      target: 'background',
    });

    expect(message.requestId).toEqual(expect.any(String));
    expect(message.type).toBe('PING');
  });

  it('accepts known HumanSignal messages', (): void => {
    const message = createMessage({
      type: 'GET_HEALTH',
      source: 'popup',
      target: 'background',
    });

    expect(isHumanSignalMessage(message)).toBe(true);
  });

  it('rejects unknown message types', (): void => {
    const message = {
      type: 'UNKNOWN',
      requestId: 'request-1',
      source: 'popup',
      target: 'background',
    };

    expect(isHumanSignalMessage(message)).toBe(false);
  });

  it('creates typed success and error responses', (): void => {
    const successResponse = createSuccessResponse('request-1', {
      type: 'ACK',
    });
    const errorResponse = createErrorResponse('request-1', 'FAILED', 'Something failed.');

    expect(successResponse.ok).toBe(true);
    expect(errorResponse.ok).toBe(false);
  });

  it('logs runtime send failures without throwing', async (): Promise<void> => {
    vi.stubGlobal('browser', {
      runtime: {
        sendMessage: vi.fn(async (): Promise<unknown> => {
          throw new Error('service worker unavailable');
        }),
      },
    });

    const response = await sendToBackground({
      type: 'PING',
      source: 'popup',
    });

    expect(response.ok).toBe(false);
    expect(getLogEntries()).toContainEqual(
      expect.objectContaining({
        level: 'error',
        context: 'messaging.runtime.send',
      }),
    );
  });
});
