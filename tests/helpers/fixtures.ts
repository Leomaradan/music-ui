import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** Real Navidrome 0.64 responses captured with scripts/generate-sample-music.sh data. */
export function navidromeFixture(name: string): unknown {
  // Relative to the project root: import.meta.url is not a file URL under jsdom.
  const path = join(process.cwd(), 'tests/fixtures/navidrome', `${name}.json`);
  return JSON.parse(readFileSync(path, 'utf8'));
}

export interface FakeFetch {
  fetch: typeof fetch;
  calls: URL[];
}

/** A fetch stub that records requested URLs and answers from `handler`. */
export function fakeFetch(
  handler: (url: URL, call: number) => Response | Promise<Response>,
): FakeFetch {
  const calls: URL[] = [];
  const impl = (async (input: RequestInfo | URL) => {
    const url = new URL(input instanceof Request ? input.url : input.toString());
    calls.push(url);
    return handler(url, calls.length);
  }) as typeof fetch;
  return { fetch: impl, calls };
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
