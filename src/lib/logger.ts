const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 } as const;
export type LogLevel = keyof typeof LEVELS;

export interface Logger {
  debug(message: string, extra?: unknown): void;
  info(message: string, extra?: unknown): void;
  warn(message: string, extra?: unknown): void;
  error(message: string, extra?: unknown): void;
}

/** Minimal leveled console logger. */
export function createLogger(scope: string, level: LogLevel = 'info'): Logger {
  const min = LEVELS[level];
  const log = (lvl: LogLevel, message: string, extra?: unknown) => {
    if (LEVELS[lvl] < min) return;
    const line = `${new Date().toISOString()} ${lvl.toUpperCase()} [${scope}] ${message}`;
    const out = lvl === 'error' ? console.error : lvl === 'warn' ? console.warn : console.log;
    if (extra === undefined) out(line);
    else out(line, extra);
  };
  return {
    debug: (m, e) => log('debug', m, e),
    info: (m, e) => log('info', m, e),
    warn: (m, e) => log('warn', m, e),
    error: (m, e) => log('error', m, e),
  };
}

export const silentLogger: Logger = { debug() {}, info() {}, warn() {}, error() {} };
