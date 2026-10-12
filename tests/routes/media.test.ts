// @vitest-environment node
import { fakeFetch, jsonResponse, navidromeFixture } from '../helpers/fixtures';
import { GET as getCover } from '@/app/api/cover/[id]/route';
import { GET as getHealth } from '@/app/api/health/route';
import { GET as getQueue, PUT as putQueue } from '@/app/api/queue/route';
import { GET as getStream } from '@/app/api/stream/[id]/route';
import { AppStateRepository } from '@/lib/appState';
import { createCatalogService } from '@/lib/catalog';
import { CatalogRepository } from '@/lib/catalog/repository';
import { CatalogSync } from '@/lib/catalog/sync';
import { openDatabase } from '@/lib/db';
import { SubsonicClient } from '@/lib/subsonic/client';

const CLIENT = Symbol.for('music-ui.subsonic.client');
const SERVICE = Symbol.for('music-ui.catalog.service');
const globals = globalThis as Record<symbol, unknown>;

function installUpstream(handler: Parameters<typeof fakeFetch>[0]) {
  const fake = fakeFetch(handler);
  const client = new SubsonicClient({
    baseUrl: 'http://navidrome:4533',
    username: 'music',
    password: 'pw',
    fetch: fake.fetch,
  });
  globals[CLIENT] = client;
  const db = openDatabase(':memory:');
  const repository = new CatalogRepository(db);
  globals[SERVICE] = createCatalogService(
    repository,
    new CatalogSync({ client, repository }),
    new AppStateRepository(db),
  );
  return fake;
}

afterEach(() => {
  delete globals[CLIENT];
  delete globals[SERVICE];
});

const params = (id: string) => ({ params: Promise.resolve({ id }) });
const audio = (status = 200, extra: Record<string, string> = {}) =>
  new Response(new Uint8Array([1, 2, 3, 4]), {
    status,
    headers: {
      'content-type': 'audio/mpeg',
      'content-length': '4',
      'accept-ranges': 'bytes',
      'x-internal': 'secret',
      ...extra,
    },
  });

describe('GET /api/stream/[id]', () => {
  it('streams the original file and forwards Range', async () => {
    const { calls } = installUpstream(() => audio(206, { 'content-range': 'bytes 0-3/100' }));
    const response = await getStream(
      new Request('http://app/api/stream/s1', { headers: { range: 'bytes=0-3' } }),
      params('s1'),
    );
    expect(response.status).toBe(206);
    expect(response.headers.get('content-range')).toBe('bytes 0-3/100');
    expect(response.headers.get('accept-ranges')).toBe('bytes');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('x-internal')).toBeNull();
    expect([...new Uint8Array(await response.arrayBuffer())]).toEqual([1, 2, 3, 4]);

    const upstream = calls[0]!;
    expect(upstream.pathname).toBe('/rest/stream');
    expect(upstream.searchParams.get('id')).toBe('s1');
    expect(upstream.searchParams.get('format')).toBe('raw');
  });

  it('forwards the Range header to the server', async () => {
    let range: string | null = null;
    const fake = fakeFetch(() => audio());
    const client = new SubsonicClient({
      baseUrl: 'http://navidrome:4533',
      username: 'music',
      password: 'pw',
      fetch: (async (input: RequestInfo | URL, init?: RequestInit) => {
        range = new Headers(init?.headers).get('range');
        return fake.fetch(input, init);
      }) as typeof fetch,
    });
    globals[CLIENT] = client;
    await getStream(
      new Request('http://app/api/stream/s1', { headers: { range: 'bytes=500-' } }),
      params('s1'),
    );
    expect(range).toBe('bytes=500-');
  });

  it('maps Subsonic errors (JSON with HTTP 200) to HTTP statuses', async () => {
    installUpstream(() => jsonResponse(navidromeFixture('error-not-found')));
    const response = await getStream(new Request('http://app/api/stream/x'), params('x'));
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'stream: Album not found (code 70)' });
  });

  it('rejects malformed ids without calling the server', async () => {
    const { calls } = installUpstream(() => audio());
    const response = await getStream(new Request('http://app/api/stream/x'), params('a b/../c'));
    expect(response.status).toBe(400);
    expect(calls).toHaveLength(0);
  });

  it('reports an unreachable server as 502', async () => {
    installUpstream(() => {
      throw new TypeError('fetch failed', { cause: { code: 'ECONNREFUSED' } });
    });
    const response = await getStream(new Request('http://app/api/stream/s1'), params('s1'));
    expect(response.status).toBe(502);
  });
});

describe('GET /api/cover/[id]', () => {
  it('serves the cover at an allowed size, cached for a day', async () => {
    const { calls } = installUpstream(
      () => new Response(new Uint8Array([9]), { headers: { 'content-type': 'image/png' } }),
    );
    const response = await getCover(
      new Request('http://app/api/cover/mf-1?size=64'),
      params('mf-1'),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/png');
    expect(response.headers.get('cache-control')).toBe('private, max-age=86400');
    expect(calls[0]?.searchParams.get('size')).toBe('64');
  });

  it('defaults to 300 px and refuses other sizes', async () => {
    const { calls } = installUpstream(
      () => new Response(new Uint8Array([9]), { headers: { 'content-type': 'image/png' } }),
    );
    await getCover(new Request('http://app/api/cover/mf-1'), params('mf-1'));
    expect(calls[0]?.searchParams.get('size')).toBe('300');
    const refused = await getCover(
      new Request('http://app/api/cover/mf-1?size=5000'),
      params('mf-1'),
    );
    expect(refused.status).toBe(400);
    expect(calls).toHaveLength(1);
  });
});

describe('GET /api/health', () => {
  it('reports ok when the server answers', async () => {
    installUpstream(() => jsonResponse(navidromeFixture('ping')));
    const body = await (await getHealth()).json();
    expect(body).toMatchObject({
      status: 'ok',
      subsonic: { reachable: true, server: 'navidrome 0.64.2 (10114574)' },
      catalog: { state: 'idle', trackCount: 0, lastSync: null },
    });
  });

  it('stays 200 but degraded when the server is down', async () => {
    installUpstream(() => {
      throw new TypeError('fetch failed', { cause: { code: 'ECONNREFUSED' } });
    });
    const response = await getHealth();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      status: 'degraded',
      subsonic: { reachable: false, error: 'ping: Subsonic server unreachable (ECONNREFUSED)' },
    });
  });
});

describe('/api/queue', () => {
  it('reads the saved queue', async () => {
    installUpstream(() =>
      jsonResponse({
        'subsonic-response': {
          status: 'ok',
          version: '1.16.1',
          playQueue: { entry: [{ id: 'a' }, { id: 'b' }], current: 'b', position: 4500 },
        },
      }),
    );
    expect(await (await getQueue()).json()).toEqual({ ids: ['a', 'b'], index: 1, position: 4.5 });
  });

  it('reads an empty queue', async () => {
    installUpstream(() =>
      jsonResponse({ 'subsonic-response': { status: 'ok', version: '1.16.1', playQueue: {} } }),
    );
    expect(await (await getQueue()).json()).toEqual({ ids: [], index: -1, position: 0 });
  });

  it('saves the queue as a form POST', async () => {
    let body = '';
    let method = '';
    installUpstream(() => jsonResponse(navidromeFixture('ping')));
    const client = globals[CLIENT] as SubsonicClient;
    const original = (client as unknown as { fetchImpl: typeof fetch }).fetchImpl;
    (client as unknown as { fetchImpl: typeof fetch }).fetchImpl = (async (input, init) => {
      method = init?.method ?? 'GET';
      body = String(init?.body ?? '');
      return original(input, init);
    }) as typeof fetch;

    const response = await putQueue(
      new Request('http://app/api/queue', {
        method: 'PUT',
        body: JSON.stringify({ ids: ['a', 'b', 'a'], index: 2, position: 1.25 }),
      }),
    );
    expect(response.status).toBe(204);
    expect(method).toBe('POST');
    const form = new URLSearchParams(body);
    expect(form.getAll('id')).toEqual(['a', 'b', 'a']);
    expect(form.get('current')).toBe('a');
    expect(form.get('position')).toBe('1250');
    expect(form.get('t')).toMatch(/^[0-9a-f]{32}$/);
  });

  it.each([
    ['not JSON', 'nope'],
    ['index out of range', JSON.stringify({ ids: ['a'], index: 1, position: 0 })],
    ['bad id', JSON.stringify({ ids: ['a b'], index: 0, position: 0 })],
    ['negative position', JSON.stringify({ ids: ['a'], index: 0, position: -1 })],
  ])('refuses %s', async (_label, body) => {
    const { calls } = installUpstream(() => jsonResponse(navidromeFixture('ping')));
    const response = await putQueue(new Request('http://app/api/queue', { method: 'PUT', body }));
    expect(response.status).toBe(400);
    expect(calls).toHaveLength(0);
  });
});
