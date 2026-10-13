import 'fake-indexeddb/auto';
import { sampleSnapshot } from '../../../tests/helpers/catalog';
import { idbGet, resetIdbConnection } from '@/client/storage/idb';
import { useCatalogStore } from './catalogStore';

const initial = useCatalogStore.getState();

function mockFetch(...responses: (() => Response)[]) {
  const calls: RequestInit[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init: RequestInit) => {
      calls.push(init);
      const next = responses.shift();
      if (!next) throw new Error('unexpected fetch');
      return next();
    }),
  );
  return calls;
}

const json = (body: unknown) => () =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });

beforeEach(async () => {
  await resetIdbConnection();
  await new Promise((resolve) => {
    indexedDB.deleteDatabase('music-ui').addEventListener('success', resolve);
  });
  useCatalogStore.setState(initial, true);
  vi.useRealTimers();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('catalogStore', () => {
  it('loads from the server and caches the snapshot', async () => {
    const snapshot = await sampleSnapshot('v1');
    const calls = mockFetch(json(snapshot));
    await useCatalogStore.getState().load();
    const state = useCatalogStore.getState();
    expect(state.status).toBe('ready');
    expect(state.catalog?.tracks).toHaveLength(10);
    expect(calls[0]?.headers).toEqual({});
    expect(await idbGet('catalog-snapshot')).toMatchObject({ version: 'v1' });
  });

  it('shows the cached catalog at once and revalidates it with its version', async () => {
    mockFetch(json(await sampleSnapshot('v1')));
    await useCatalogStore.getState().load();
    useCatalogStore.setState(initial, true);

    const calls = mockFetch(() => new Response(null, { status: 304 }));
    await useCatalogStore.getState().load();
    expect(calls[0]?.headers).toEqual({ 'if-none-match': '"v1"' });
    expect(useCatalogStore.getState()).toMatchObject({ status: 'ready', error: null });
    expect(useCatalogStore.getState().catalog?.version).toBe('v1');
  });

  it('replaces the catalog when the server has a new version', async () => {
    mockFetch(json(await sampleSnapshot('v1')), json(await sampleSnapshot('v2')));
    await useCatalogStore.getState().load();
    await useCatalogStore.getState().revalidate();
    expect(useCatalogStore.getState().catalog?.version).toBe('v2');
    expect(await idbGet('catalog-snapshot')).toMatchObject({ version: 'v2' });
  });

  it('waits for the first sync, retrying every 5 s', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const calls = mockFetch(
      () => new Response('{}', { status: 503 }),
      json(await sampleSnapshot('v1')),
    );
    await useCatalogStore.getState().load();
    expect(useCatalogStore.getState().status).toBe('waiting');
    await vi.advanceTimersByTimeAsync(5_000);
    await vi.waitFor(() => expect(useCatalogStore.getState().status).toBe('ready'));
    expect(calls).toHaveLength(2);
  });

  it('reports errors, but keeps a catalog it already has', async () => {
    mockFetch(() => new Response('', { status: 500 }));
    await useCatalogStore.getState().load();
    expect(useCatalogStore.getState()).toMatchObject({
      status: 'error',
      error: 'The server answered HTTP 500',
    });

    mockFetch(json(await sampleSnapshot('v1')), () => {
      throw new TypeError('Failed to fetch');
    });
    await useCatalogStore.getState().revalidate();
    await useCatalogStore.getState().revalidate();
    expect(useCatalogStore.getState()).toMatchObject({ status: 'ready', error: 'Failed to fetch' });
    expect(useCatalogStore.getState().catalog?.version).toBe('v1');
  });
});
