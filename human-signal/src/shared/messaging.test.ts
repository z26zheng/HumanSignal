import { describe, expect, it } from 'vitest';

import {
  createErrorResponse,
  createMessage,
  createSuccessResponse,
  isHumanSignalMessage,
} from '@/shared/messaging';

describe('messaging contracts', (): void => {
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
});
