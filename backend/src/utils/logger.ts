type LogLevel = 'INFO' | 'WARN' | 'ERROR';

function formatMessage(level: LogLevel, message: string, meta?: unknown): string {
  const timestamp = new Date().toISOString();
  const metaStr = meta ? ` - body: ${JSON.stringify(meta)}` : '';
  return `[${timestamp}] [${level}] ${message}${metaStr}`;
}

export const logger = {
  info: (message: string, meta?: unknown) => console.log(formatMessage('INFO', message, meta)),
  warn: (message: string, meta?: unknown) => console.warn(formatMessage('WARN', message, meta)),
  error: (message: string, meta?: unknown) => console.error(formatMessage('ERROR', message, meta)),
};
