import { pino, type Logger } from 'pino';

export type { Logger };

export function createLogger(level: string, nodeEnv: string): Logger {
  return pino({
    level: nodeEnv === 'test' ? 'silent' : level,
    redact: {
      paths: ['req.headers.authorization', 'req.headers.cookie', 'headers.authorization', 'headers.cookie', 'token'],
      censor: '[redacted]',
    },
    transport:
      nodeEnv === 'development'
        ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss' } }
        : undefined,
  });
}
