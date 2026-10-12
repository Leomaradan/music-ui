// @vitest-environment node
import { gunzipSync } from 'node:zlib';
import { FakeNavidrome } from '../helpers/fake-navidrome';
import { GET as getCatalog } from '@/app/api/catalog/route';
import { POST as rescan } from '@/app/api/catalog/rescan/route';
import { GET as getStatus } from '@/app/api/catalog/status/route';
import { createCatalogService, type CatalogService } from '@/lib/catalog';
import { CatalogRepository } from '@/lib/catalog/repository';
import { CatalogSync } from '@/lib/catalog/sync';
import { openDatabase } from '@/lib/db';

const SERVICE = Symbol.for('music-ui.catalog.service');

function installService(): CatalogService {
  const repository = new CatalogRepository(openDatabase(':memory:'));
  const sync = new CatalogSync({ client: new FakeNavidrome().client(), repository });
  const service = createCatalogService(repository, sync);
  (globalThis as Record<symbol, unknown>)[SERVICE] = service;
  return service;
}

afterEach(() => {
  delete (globalThis as Record<symbol, unknown>)[SERVICE];
});

describe('GET /api/catalog', () => {
  it('answers 503 before the first sync', async () => {
    installService();
    const response = getCatalog(new Request('http://app/api/catalog'));
    expect(response.status).toBe(503);
    expect(response.headers.get('retry-after')).toBe('5');
  });

  it('serves the snapshot with an ETag, then 304 while unchanged', async () => {
    const service = installService();
    await service.sync.sync();

    const first = getCatalog(new Request('http://app/api/catalog'));
    expect(first.status).toBe(200);
    const etag = first.headers.get('etag');
    expect(etag).toMatch(/^".+"$/);
    expect(first.headers.get('cache-control')).toBe('no-cache');
    const body = await first.json();
    expect(body.tracks.id).toHaveLength(10);
    expect(`"${body.version}"`).toBe(etag);

    const cached = getCatalog(
      new Request('http://app/api/catalog', { headers: { 'if-none-match': `W/${etag}` } }),
    );
    expect(cached.status).toBe(304);
    expect(await cached.text()).toBe('');

    await service.sync.sync({ force: true });
    const changed = getCatalog(
      new Request('http://app/api/catalog', { headers: { 'if-none-match': etag! } }),
    );
    expect(changed.status).toBe(200);
    expect(changed.headers.get('etag')).not.toBe(etag);
  });

  it.each([
    ['gzip, deflate, br', true],
    ['br;q=1, gzip;q=0.5', true],
    ['*', true],
    ['gzip;q=0', false],
    ['identity', false],
    [null, false],
  ])('accept-encoding %j → gzip %s', async (acceptEncoding, gzipped) => {
    const service = installService();
    await service.sync.sync();
    const headers: Record<string, string> = acceptEncoding
      ? { 'accept-encoding': acceptEncoding }
      : {};
    const response = getCatalog(new Request('http://app/api/catalog', { headers }));
    expect(response.headers.get('content-encoding')).toBe(gzipped ? 'gzip' : null);
    expect(response.headers.get('vary')).toBe('accept-encoding');
    const bytes = Buffer.from(await response.arrayBuffer());
    const json = gzipped ? gunzipSync(bytes).toString('utf8') : bytes.toString('utf8');
    expect(JSON.parse(json).tracks.id).toHaveLength(10);
  });
});

describe('POST /api/catalog/rescan and GET /api/catalog/status', () => {
  it('starts a sync and reports it', async () => {
    const service = installService();
    const response = rescan();
    expect(response.status).toBe(202);
    expect(await response.json()).toMatchObject({ state: 'syncing' });

    await vi.waitFor(() => expect(service.sync.isRunning).toBe(false));
    const status = await getStatus().json();
    expect(status).toMatchObject({ state: 'idle', trackCount: 10, lastRun: { result: 'synced' } });
  });
});
