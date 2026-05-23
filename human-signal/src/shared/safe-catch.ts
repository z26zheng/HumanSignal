import { logger } from '@/shared/logger';

export function safeCatch<TValue>(
  operation: () => TValue,
  fallback: TValue,
  context: string,
): TValue {
  try {
    return operation();
  } catch (error: unknown) {
    logger.error(context, error);
    return fallback;
  }
}

export async function safeCatchAsync<TValue>(
  operation: () => Promise<TValue>,
  fallback: TValue,
  context: string,
): Promise<TValue> {
  try {
    return await operation();
  } catch (error: unknown) {
    logger.error(context, error);
    return fallback;
  }
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function toErrorData(error: unknown): { errorName: string; errorMessage: string } {
  return {
    errorName: error instanceof Error ? error.name : 'unknown',
    errorMessage: errorMessage(error),
  };
}
