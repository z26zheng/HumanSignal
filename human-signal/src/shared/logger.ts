export type LogLevel = 'error' | 'warn' | 'info' | 'debug';

export type LogDataValue =
  | string
  | number
  | boolean
  | null
  | readonly LogDataValue[]
  | { readonly [key: string]: LogDataValue };

export type LogData = Record<string, LogDataValue>;

export interface LogEntry {
  readonly level: LogLevel;
  readonly timestamp: number;
  readonly context: string;
  readonly message: string;
  readonly data: LogData | null;
}

const MAX_LOG_ENTRIES: number = 200;

const logEntries: LogEntry[] = [];

function shouldWriteLog(level: LogLevel): boolean {
  if (level === 'debug' && !import.meta.env.DEV) {
    return false;
  }

  return true;
}

function writeLog(
  level: LogLevel,
  context: string,
  message: string,
  data: LogData | null,
): void {
  if (!shouldWriteLog(level)) {
    return;
  }

  const entry: LogEntry = {
    level,
    timestamp: Date.now(),
    context,
    message,
    data,
  };

  logEntries.push(entry);

  if (logEntries.length > MAX_LOG_ENTRIES) {
    logEntries.shift();
  }

  const consoleMethod: 'error' | 'warn' | 'info' | 'debug' = level;
  console[consoleMethod](`[HumanSignal:${context}] ${message}`, data ?? undefined);
}

export interface Logger {
  readonly error: (context: string, error: unknown, data?: LogData) => void;
  readonly warn: (context: string, message: string, data?: LogData) => void;
  readonly info: (context: string, message: string, data?: LogData) => void;
  readonly debug: (context: string, message: string, data?: LogData) => void;
}

function errorToLogData(error: unknown, data: LogData | undefined): LogData {
  if (error instanceof Error) {
    const errorData: LogData = {
      name: error.name,
      message: error.message,
      ...data,
    };

    return errorData;
  }

  const fallbackData: LogData = {
    message: String(error),
    ...data,
  };

  return fallbackData;
}

export const logger: Logger = {
  error(context: string, error: unknown, data?: LogData): void {
    writeLog('error', context, 'Operation failed', errorToLogData(error, data));
  },

  warn(context: string, message: string, data?: LogData): void {
    writeLog('warn', context, message, data ?? null);
  },

  info(context: string, message: string, data?: LogData): void {
    writeLog('info', context, message, data ?? null);
  },

  debug(context: string, message: string, data?: LogData): void {
    writeLog('debug', context, message, data ?? null);
  },
};

export function getLogEntries(): readonly LogEntry[] {
  return [...logEntries];
}

export function clearLogEntries(): void {
  logEntries.length = 0;
}
