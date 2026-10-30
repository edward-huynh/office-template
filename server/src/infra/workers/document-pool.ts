import { Worker } from 'node:worker_threads';
import type { DocType } from '../../contracts/index.js';
import { getBaseHandler } from '../../doctypes/registry.js';
import { ApiError } from '../../shared/errors/api-error.js';
import type { Logger } from '../../shared/utils/logger.js';
import type { WorkerRequest, WorkerResponse } from './document-worker.js';

export interface DocumentPoolOptions {
  /** Worker threads to run. `0` runs every operation on the calling thread (used by tests and tiny deployments). */
  threads: number;
  logger?: Logger;
  /** Overrides how the worker is started, for example `['--import', 'tsx']` when the entry file is TypeScript. */
  execArgv?: string[];
}

interface Slot {
  worker: Worker;
  pending: Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>;
}

const toBuffer = (value: Uint8Array) => Buffer.from(value.buffer, value.byteOffset, value.byteLength);

/** Structured cloning turns Buffers into plain Uint8Arrays; restore them (top level and direct properties). */
function reviveBuffers(value: unknown): unknown {
  if (value instanceof Uint8Array && !Buffer.isBuffer(value)) return toBuffer(value);
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const object = value as Record<string, unknown>;
    for (const key of Object.keys(object)) {
      const entry = object[key];
      if (entry instanceof Uint8Array && !Buffer.isBuffer(entry)) object[key] = toBuffer(entry);
    }
  }
  return value;
}

/**
 * Runs document operations in worker threads. Requests go to the least busy worker; a worker that
 * dies is replaced and its in-flight requests fail with a 500, so one bad file cannot take the API down.
 */
export class DocumentPool {
  private readonly slots: Slot[] = [];
  private nextId = 1;
  private closed = false;

  constructor(private readonly options: DocumentPoolOptions) {
    for (let i = 0; i < options.threads; i += 1) this.slots.push(this.spawn());
  }

  get threads() {
    return this.slots.length;
  }

  async call<T>(type: DocType, method: string, args: unknown[]): Promise<T> {
    if (this.slots.length === 0) {
      const handler = getBaseHandler(type) as unknown as Record<string, (...a: unknown[]) => Promise<unknown>>;
      return (await handler[method]!(...args)) as T;
    }
    if (this.closed) throw ApiError.server('The document service is shutting down');

    const slot = this.slots.reduce((best, s) => (s.pending.size < best.pending.size ? s : best));
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      slot.pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
      // Arguments are copied (not transferred): callers keep using their Buffers, which may be views
      // into a shared pool. Results are transferred back by the worker.
      slot.worker.postMessage({ id, type, method, args } satisfies WorkerRequest);
    }).then((result) => reviveBuffers(result) as T);
  }

  async close(): Promise<void> {
    this.closed = true;
    await Promise.all(this.slots.map((slot) => slot.worker.terminate()));
  }

  private spawn(): Slot {
    const entry = new URL('./document-worker.ts', import.meta.url);
    const worker = new Worker(entry, { execArgv: this.options.execArgv });
    const slot: Slot = { worker, pending: new Map() };

    worker.on('message', (response: WorkerResponse) => {
      const waiter = slot.pending.get(response.id);
      if (!waiter) return;
      slot.pending.delete(response.id);
      if (response.ok) waiter.resolve(response.result);
      else if (response.error.statusCode) {
        waiter.reject(new ApiError(response.error.statusCode, response.error.message, response.error.errors));
      } else waiter.reject(new Error(response.error.message));
    });

    let dead = false;
    const fail = (error: Error) => {
      if (dead) return; // `error` and `exit` both fire for one crash
      dead = true;
      for (const waiter of slot.pending.values()) waiter.reject(ApiError.server('The document could not be processed'));
      slot.pending.clear();
      this.options.logger?.error({ err: error }, 'Document worker stopped');
      const index = this.slots.indexOf(slot);
      if (!this.closed && index >= 0) this.slots[index] = this.spawn();
    };
    worker.once('error', fail);
    worker.once('exit', (code) => {
      if (code !== 0 && !this.closed) fail(new Error(`Document worker exited with code ${code}`));
    });
    return slot;
  }
}
