import { z } from 'zod';
import { SubsonicError } from '@/lib/subsonic/errors';

/** Subsonic ids are opaque: accept the characters servers use, reject anything else. */
export const subsonicIdSchema = z.string().regex(/^[\w.:-]{1,200}$/);

export function jsonError(status: number, message: string): Response {
  return Response.json({ error: message }, { status, headers: { 'cache-control': 'no-store' } });
}

/** Maps an error from the Subsonic client to an HTTP response for the browser. */
export function errorResponse(error: unknown): Response {
  if (error instanceof SubsonicError) return jsonError(error.httpStatus, error.message);
  if (error instanceof Error && error.name === 'AbortError')
    return new Response(null, { status: 499 });
  console.error(error);
  return jsonError(500, 'Internal error');
}

/** Copies the listed headers from an upstream response, when present. */
export function pickHeaders(source: Headers, names: readonly string[]): Headers {
  const headers = new Headers();
  for (const name of names) {
    const value = source.get(name);
    if (value !== null) headers.set(name, value);
  }
  return headers;
}
