// @vitest-environment node
/** Catalog sync against a real Navidrome (see tests/integration/navidrome.test.ts). */
import { CatalogRepository } from '@/lib/catalog/repository';
import { CatalogSync } from '@/lib/catalog/sync';
import { openDatabase } from '@/lib/db';
import { SubsonicClient } from '@/lib/subsonic/client';

const url = process.env.SUBSONIC_TEST_URL ?? '';

describe.skipIf(!url)('catalog sync against Navidrome', () => {
  it('copies both libraries, then skips while nothing changed', async () => {
    const client = new SubsonicClient({
      baseUrl: url,
      username: process.env.SUBSONIC_TEST_USER ?? 'music',
      password: process.env.SUBSONIC_TEST_PASSWORD ?? 'music',
    });
    const repository = new CatalogRepository(openDatabase(':memory:'));
    const sync = new CatalogSync({ client, repository, pageSize: 3 });

    expect(await sync.sync()).toMatchObject({ result: 'synced', trackCount: 10 });
    const { folders, tracks } = repository.read();
    expect(folders.map((folder) => folder.name)).toEqual(['Main', 'Live']);
    const count = (name: string) =>
      tracks.filter((t) => t.folderId === folders.find((f) => f.name === name)?.id).length;
    expect([count('Main'), count('Live')]).toEqual([7, 3]);
    expect(tracks.find((t) => t.title === 'Sunny Day')).toMatchObject({
      albumArtist: 'Various Artists',
      genres: ['Pop', 'Dance'],
    });

    expect(await sync.sync()).toEqual({ result: 'unchanged' });
  });
});
