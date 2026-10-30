import type { Server } from 'node:http';
import type { Logger } from './logger.js';

/** Stops accepting connections on SIGINT/SIGTERM, runs cleanup, then exits. */
export function registerGracefulShutdown(server: Server, logger: Logger, cleanup: () => void) {
  let closing = false;
  const shutdown = (signal: string) => {
    if (closing) return;
    closing = true;
    logger.info({ signal }, 'Shutting down');
    const force = setTimeout(() => process.exit(1), 10_000);
    force.unref();
    server.close(() => {
      cleanup();
      process.exit(0);
    });
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}
