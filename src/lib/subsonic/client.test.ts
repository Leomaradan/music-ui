// @vitest-environment node
import { fakeFetch, jsonResponse, navidromeFixture } from '../../../tests/helpers/fixtures';
import { SubsonicClient } from './client';
import { SubsonicError } from './errors';
import { musicFoldersSchema } from './schemas';

const options = { baseUrl: 'http://navidrome:4533', username: 'music', password: 'pw' };

function client(fetchImpl: typeof fetch, extra: Partial<typeof options> = {}) {
  return new SubsonicClient({ ...options, ...extra, fetch: fetchImpl });
}

async function captureError(promise: Promise<unknown>): Promise<SubsonicError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof SubsonicError) return error;
    throw error;
  }
  throw new Error('expected a SubsonicError');
}

describe('SubsonicClient.buildUrl', () => {
  it('adds auth and protocol parameters', () => {
    const url = client(fetch).buildUrl('ping');
    expect(url.origin + url.pathname).toBe('http://navidrome:4533/rest/ping');
    const params = Object.fromEntries(url.searchParams);
    expect(params).toMatchObject({ u: 'music', v: '1.16.1', c: 'music-ui', f: 'json' });
    expect(params.t).toMatch(/^[0-9a-f]{32}$/);
    expect(params.s).toMatch(/^[0-9a-f]{16}$/);
    expect(url.searchParams.has('p')).toBe(false);
  });

  it('keeps a base path prefix', () => {
    for (const baseUrl of ['http://nas/navidrome', 'http://nas/navidrome/']) {
      expect(client(fetch, { baseUrl }).buildUrl('ping').pathname).toBe('/navidrome/rest/ping');
    }
  });

  it('repeats array values and skips missing ones', () => {
    const url = client(fetch).buildUrl('search3', {
      query: '',
      musicFolderId: [1, 2],
      songCount: 500,
      albumCount: undefined,
      artistCount: null,
      flag: true,
    });
    expect(url.searchParams.getAll('musicFolderId')).toEqual(['1', '2']);
    expect(url.searchParams.get('query')).toBe('');
    expect(url.searchParams.get('songCount')).toBe('500');
    expect(url.searchParams.has('albumCount')).toBe(false);
    expect(url.searchParams.has('artistCount')).toBe(false);
    expect(url.searchParams.get('flag')).toBe('true');
  });
});

describe('SubsonicClient.request', () => {
  it('unwraps a successful response', async () => {
    const { fetch } = fakeFetch(() => jsonResponse(navidromeFixture('ping')));
    const envelope = await client(fetch).request('ping');
    expect(envelope).toMatchObject({ status: 'ok', version: '1.16.1', type: 'navidrome' });
  });

  it.each([
    ['error-auth', 40, 401],
    ['error-not-found', 70, 404],
  ])('maps %s to code %i / HTTP %i', async (fixture, code, httpStatus) => {
    const { fetch } = fakeFetch(() => jsonResponse(navidromeFixture(fixture)));
    const error = await captureError(client(fetch).request('getAlbum', { id: 'x' }));
    expect(error).toMatchObject({ kind: 'api', code, httpStatus });
  });

  it('reports non-2xx HTTP statuses', async () => {
    const { fetch } = fakeFetch(() => new Response('nope', { status: 500 }));
    const error = await captureError(client(fetch).request('ping'));
    expect(error).toMatchObject({ kind: 'http', httpStatus: 502 });
    expect(error.message).toContain('HTTP 500');
  });

  it('rejects bodies that are not Subsonic responses', async () => {
    const notJson = fakeFetch(() => new Response('<html>', { status: 200 }));
    expect(await captureError(client(notJson.fetch).request('ping'))).toMatchObject({
      kind: 'invalid-response',
    });
    const wrongShape = fakeFetch(() => jsonResponse({ hello: 'world' }));
    expect(await captureError(client(wrongShape.fetch).request('ping'))).toMatchObject({
      kind: 'invalid-response',
    });
  });

  it('retries once on network failure', async () => {
    const { fetch, calls } = fakeFetch((_url, call) => {
      if (call === 1) throw new TypeError('fetch failed', { cause: { code: 'ECONNRESET' } });
      return jsonResponse(navidromeFixture('ping'));
    });
    await expect(client(fetch).request('ping')).resolves.toMatchObject({ status: 'ok' });
    expect(calls).toHaveLength(2);
    // A new salt/token is generated for the retry.
    expect(calls[0]?.searchParams.get('s')).not.toBe(calls[1]?.searchParams.get('s'));
  });

  it('gives up after the retry, without leaking the token', async () => {
    const { fetch, calls } = fakeFetch(() => {
      throw new TypeError('fetch failed', { cause: { code: 'ECONNREFUSED' } });
    });
    const error = await captureError(client(fetch).request('ping'));
    expect(error).toMatchObject({ kind: 'network', httpStatus: 502 });
    expect(error.message).toBe('ping: Subsonic server unreachable (ECONNREFUSED)');
    expect(calls).toHaveLength(2);
    expect(error.message).not.toContain(calls[0]?.searchParams.get('t'));
  });

  it('times out slow servers', async () => {
    const slow = ((_input: RequestInfo | URL, init?: RequestInit) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(init.signal?.reason));
      })) as typeof fetch;
    const error = await captureError(client(slow, { timeoutMs: 20 } as never).request('ping'));
    expect(error).toMatchObject({ kind: 'network' });
    expect(error.message).toContain('timed out after 20 ms');
  });

  it('does not retry when the caller aborts', async () => {
    const controller = new AbortController();
    const { fetch, calls } = fakeFetch(() => {
      controller.abort();
      throw new DOMException('aborted', 'AbortError');
    });
    await expect(
      client(fetch).request('ping', {}, { signal: controller.signal }),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(calls).toHaveLength(1);
  });
});

describe('SubsonicError', () => {
  it('is recognized by instanceof across copies of the class (separate bundles)', () => {
    const fromOtherBundle = Object.assign(new Error('x'), {
      [Symbol.for('music-ui.SubsonicError')]: true,
    });
    expect(fromOtherBundle).toBeInstanceOf(SubsonicError);
    expect(new Error('x')).not.toBeInstanceOf(SubsonicError);
    expect(new SubsonicError('api', 'x', { code: 70 })).toBeInstanceOf(SubsonicError);
  });
});

describe('SubsonicClient.get', () => {
  it('validates the payload under the given key', async () => {
    const { fetch } = fakeFetch(() => jsonResponse(navidromeFixture('getMusicFolders')));
    const folders = await client(fetch).get('getMusicFolders', 'musicFolders', musicFoldersSchema);
    expect(folders.musicFolder).toEqual([
      { id: 1, name: 'Main' },
      { id: 2, name: 'Live' },
    ]);
  });

  it('reports a payload with the wrong shape', async () => {
    const { fetch } = fakeFetch(() =>
      jsonResponse({
        'subsonic-response': {
          status: 'ok',
          version: '1.16.1',
          musicFolders: { musicFolder: 'x' },
        },
      }),
    );
    const error = await captureError(
      client(fetch).get('getMusicFolders', 'musicFolders', musicFoldersSchema),
    );
    expect(error).toMatchObject({ kind: 'invalid-response' });
  });
});
