/**
 * Worker-thread entry point. Runs the CPU-heavy document operations (zip, XML, HTML conversion,
 * sanitizing) so the API's main thread, which serves every other request, is never blocked by them.
 */
import { parentPort } from 'node:worker_threads';
import type { DocType } from '../../contracts/index.js';
import { getBaseHandler } from '../../doctypes/registry.js';
import { ApiError } from '../../shared/errors/api-error.js';

export interface WorkerRequest {
  id: number;
  type: DocType;
  method: string;
  args: unknown[];
}

export type WorkerResponse =
  | { id: number; ok: true; result: unknown }
  | { id: number; ok: false; error: { message: string; statusCode?: number; errors?: Record<string, string[]> } };

/** Buffers cross the thread boundary as Uint8Array; give the handlers back real Buffers. */
const revive = (value: unknown): unknown =>
  value instanceof Uint8Array && !Buffer.isBuffer(value) ? Buffer.from(value.buffer, value.byteOffset, value.byteLength) : value;

const port = parentPort;
if (!port) throw new Error('document-worker must run inside a worker thread');

port.on('message', async ({ id, type, method, args }: WorkerRequest) => {
  try {
    const handler = getBaseHandler(type) as unknown as Record<string, ((...a: unknown[]) => Promise<unknown>) | undefined>;
    const fn = handler[method];
    if (typeof fn !== 'function') throw new Error(`Unsupported operation: ${type}.${method}`);
    const result = await fn.apply(handler, args.map(revive));
    // Hand large buffers back without copying them.
    const transfer: ArrayBuffer[] = [];
    if (result instanceof Uint8Array) transfer.push(result.buffer as ArrayBuffer);
    else if (result && typeof result === 'object') {
      for (const entry of Object.values(result)) if (entry instanceof Uint8Array) transfer.push(entry.buffer as ArrayBuffer);
    }
    port.postMessage({ id, ok: true, result } satisfies WorkerResponse, transfer);
  } catch (error) {
    const api = error instanceof ApiError ? error : undefined;
    port.postMessage({
      id,
      ok: false,
      error: { message: (error as Error).message, statusCode: api?.statusCode, errors: api?.errors },
    } satisfies WorkerResponse);
  }
});
