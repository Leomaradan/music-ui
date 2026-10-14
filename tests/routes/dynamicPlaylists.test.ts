// @vitest-environment node
import { DELETE, PUT } from '@/app/api/dynamic-playlists/[id]/route';
import { GET, POST } from '@/app/api/dynamic-playlists/route';
import { AppStateRepository } from '@/lib/appState';
import { createCatalogService } from '@/lib/catalog';
import { CatalogRepository } from '@/lib/catalog/repository';
import type { CatalogSync } from '@/lib/catalog/sync';
import { openDatabase } from '@/lib/db';

const SERVICE = Symbol.for('music-ui.catalog.service');
const globals = globalThis as Record<symbol, unknown>;

beforeEach(() => {
  const db = openDatabase(':memory:');
  globals[SERVICE] = createCatalogService(
    new CatalogRepository(db),
    {} as CatalogSync,
    new AppStateRepository(db),
  );
});
afterEach(() => {
  delete globals[SERVICE];
});

const request = (method: string, body?: unknown) =>
  new Request('http://app/api/dynamic-playlists', {
    method,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
const context = (id: string) => ({ params: Promise.resolve({ id }) });

const seventiesRock = {
  name: '70s rock',
  match: 'all',
  criteria: [
    { field: 'genre', op: '==', value: 'Rock' },
    { field: 'year', op: '>=', value: 1970 },
    { field: 'year', op: '<', value: 1980 },
  ],
};

describe('/api/dynamic-playlists', () => {
  it('creates, lists, updates and deletes', async () => {
    const created = await POST(request('POST', seventiesRock));
    expect(created.status).toBe(201);
    const playlist = (await created.json()) as { id: string };
    expect(playlist).toMatchObject({ ...seventiesRock, id: expect.stringMatching(/^d[0-9a-f]+$/) });

    expect(await (await GET()).json()).toEqual({ playlists: [playlist] });

    const renamed = { ...seventiesRock, name: 'Classic rock', match: 'any' };
    const updated = await PUT(request('PUT', renamed), context(playlist.id));
    expect(await updated.json()).toEqual({ ...renamed, id: playlist.id });

    expect((await DELETE(request('DELETE'), context(playlist.id))).status).toBe(204);
    expect(await (await GET()).json()).toEqual({ playlists: [] });
  });

  it('validates the definition and the id', async () => {
    const lessThanGenre = {
      ...seventiesRock,
      criteria: [{ field: 'genre', op: '<', value: 'Rock' }],
    };
    const refused = await POST(request('POST', lessThanGenre));
    expect(refused.status).toBe(400);
    expect(await refused.json()).toEqual({ error: 'This operator needs a numeric field (year)' });
    expect((await POST(request('POST', { ...seventiesRock, criteria: [] }))).status).toBe(400);

    expect((await PUT(request('PUT', seventiesRock), context('../x'))).status).toBe(400);
    expect((await PUT(request('PUT', seventiesRock), context('d123'))).status).toBe(404);
    expect((await DELETE(request('DELETE'), context('d123'))).status).toBe(404);
  });
});
