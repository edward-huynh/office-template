import { Readable } from 'node:stream';
import type { ReadStream } from 'node:fs';
import type { z } from 'zod';
import { errorEnvelopeSchema, successEnvelope } from '../../contracts/index.js';

/** `{ success: true, data }` JSON response definition for `createRoute`. */
export const jsonResponse = <T extends z.ZodType>(schema: T, description: string) => ({
  description,
  content: { 'application/json': { schema: successEnvelope(schema) } },
});

/** Standard error envelope response definition. */
export const errorResponse = (description: string) => ({
  description,
  content: { 'application/json': { schema: errorEnvelopeSchema } },
});

/** Wraps a Node read stream in a web `Response` so large files are never buffered in memory. */
export function streamResponse(stream: ReadStream, headers: Record<string, string>, status = 200): Response {
  return new Response(Readable.toWeb(stream) as ReadableStream, { status, headers });
}
