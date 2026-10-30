import { createFileRoute } from '@tanstack/react-router';

/**
 * Same-origin gateway to the API server: the browser only ever talks to this origin, so the
 * httpOnly session cookie needs no CORS handling. Uploads and downloads stream straight through.
 * The target is read at runtime from API_INTERNAL_URL.
 */
const HOP_BY_HOP = ['connection', 'keep-alive', 'transfer-encoding', 'content-encoding', 'content-length'];

async function forward({ request }: { request: Request }): Promise<Response> {
  const incoming = new URL(request.url);
  const target = new URL(incoming.pathname + incoming.search, process.env.API_INTERNAL_URL ?? 'http://localhost:3001');

  const headers = new Headers(request.headers);
  headers.delete('host');
  headers.set('x-forwarded-host', incoming.host);
  headers.set('x-forwarded-proto', incoming.protocol.replace(':', ''));

  const hasBody = request.method !== 'GET' && request.method !== 'HEAD';
  let upstream: Response;
  try {
    upstream = await fetch(target, {
      method: request.method,
      headers,
      body: hasBody ? request.body : undefined,
      redirect: 'manual',
      // The cookie travels as a plain header. With credentials enabled, undici turns any upstream
      // 401 on a streamed request into a network error, which would hide the API's real answer.
      credentials: 'omit',
      ...(hasBody ? { duplex: 'half' } : {}),
    } as RequestInit);
  } catch {
    return Response.json(
      { success: false, message: 'The API service is unreachable', statusCode: 502 },
      { status: 502 },
    );
  }

  const responseHeaders = new Headers(upstream.headers);
  for (const name of HOP_BY_HOP) responseHeaders.delete(name);
  return new Response(upstream.body, { status: upstream.status, statusText: upstream.statusText, headers: responseHeaders });
}

export const Route = createFileRoute('/api/$')({
  server: {
    handlers: { GET: forward, POST: forward, PUT: forward, PATCH: forward, DELETE: forward, HEAD: forward },
  },
});
