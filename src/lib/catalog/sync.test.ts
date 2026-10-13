// @vitest-environment node
import { FakeNavidrome } from '../../../tests/helpers/fake-navidrome';
import { openDatabase } from '@/lib/db';
import { CatalogRepository, MetaKey } from './repository';
import { CatalogSync } from './sync';

function setup(pageSize?: number) {
  const server = new FakeNavidrome();
  const repository = new CatalogRepository(openDatabase(':memory:'));
  const sync = new CatalogSync({ client: server.client(), repository, pageSize });
  return { server, repository, sync };
}

describe('CatalogSync', () => {
  it('copies both libraries on the first sync', async () => {
    const { repository, sync } = setup();
    const result = await sync.sync();
    expect(result).toMatchObject({ result: 'synced', trackCount: 10 });

    const { folders, albums, tracks } = repository.read();
    expect(folders).toEqual([
      { id: 1, name: 'Main' },
      { id: 2, name: 'Live' },
    ]);
    expect(albums).toHaveLength(6);
    const perFolder = Object.groupBy(tracks, (track) => track.folderId);
    expect(perFolder[1]).toHaveLength(7);
    expect(perFolder[2]).toHaveLength(3);
  });

  it('uses the album artist and every genre of a track', async () => {
    const { repository, sync } = setup();
    await sync.sync();
    const beachNight = repository.read().tracks.find((track) => track.title === 'Beach Night');
    expect(beachNight).toMatchObject({
      artist: 'Artist Two feat. Artist One',
      albumArtist: 'Various Artists',
      album: 'Summer Hits',
      year: 2001,
      track: 2,
      duration: 8,
      suffix: 'mp3',
      genres: ['Pop', 'Dance'],
    });
  });

  it('orders tracks by album artist, year, album, disc and track', async () => {
    const { repository, sync } = setup();
    await sync.sync();
    expect(
      repository.read().tracks.map((track) => `${track.albumArtist} / ${track.title}`),
    ).toEqual([
      'ABBA / Dancing Queen',
      'ABBA / Knowing Me, Knowing You',
      'Aerosmith / Walk This Way',
      'Aerosmith / Sweet Emotion',
      'Aerosmith / Back in the Saddle (Live)',
      'Aerosmith / Love in an Elevator',
      'Miles Davis / So What (Live)',
      'Miles Davis / Stella by Starlight (Live)',
      'Various Artists / Sunny Day',
      'Various Artists / Beach Night',
    ]);
  });

  it('pages through large libraries', async () => {
    const { repository, sync, server } = setup(2);
    await sync.sync();
    expect(repository.trackCount()).toBe(10);
    // Main: 4 pages of songs (2+2+2+1), Live: 2 pages (2+1).
    expect(server.calls.filter((call) => call === 'search3')).toHaveLength(6);
  });

  it('skips the copy when the server reports no change', async () => {
    const { server, repository, sync } = setup();
    await sync.sync();
    const version = repository.getMeta(MetaKey.Version);
    server.calls = [];

    expect(await sync.sync()).toEqual({ result: 'unchanged' });
    expect(server.calls.toSorted()).toEqual(['getIndexes', 'getMusicFolders', 'getScanStatus']);
    expect(repository.getMeta(MetaKey.Version)).toBe(version);
  });

  it.each([
    ['a new scan', (server: FakeNavidrome) => (server.lastScan = '2026-10-13T00:00:00Z')],
    ['a modification', (server: FakeNavidrome) => (server.lastModified += 1)],
    ['a renamed library', (server: FakeNavidrome) => (server.folders[1]!.name = 'Concerts')],
  ])('syncs again after %s', async (_label, change) => {
    const { server, repository, sync } = setup();
    await sync.sync();
    const version = repository.getMeta(MetaKey.Version);
    change(server);
    expect(await sync.sync()).toMatchObject({ result: 'synced' });
    expect(repository.getMeta(MetaKey.Version)).not.toBe(version);
  });

  it('picks up removed tracks', async () => {
    const { server, repository, sync } = setup();
    await sync.sync();
    server.songs.set(2, server.songs.get(2)!.slice(1));
    server.lastScan = '2026-10-13T00:00:00Z';
    await sync.sync();
    expect(repository.trackCount()).toBe(9);
  });

  it('waits while the server is scanning, unless forced', async () => {
    const { server, repository, sync } = setup();
    server.scanning = true;
    expect(await sync.sync()).toMatchObject({ result: 'deferred' });
    expect(repository.trackCount()).toBe(0);
    expect(await sync.sync({ force: true })).toMatchObject({ result: 'synced' });
  });

  it('forces a copy even when nothing changed', async () => {
    const { repository, sync } = setup();
    await sync.sync();
    const version = repository.getMeta(MetaKey.Version);
    expect(await sync.sync({ force: true })).toMatchObject({ result: 'synced' });
    expect(repository.getMeta(MetaKey.Version)).not.toBe(version);
  });

  it('keeps the previous catalog when a sync fails', async () => {
    const { server, repository, sync } = setup();
    await sync.sync();
    const version = repository.getMeta(MetaKey.Version);

    server.lastScan = '2026-10-13T00:00:00Z';
    server.songs.set(1, []);
    // Two failures in a row: the client retries network errors once.
    server.failures.search3 = 2;
    await expect(sync.sync()).rejects.toThrow('search3: Subsonic server unreachable (ECONNRESET)');
    expect(repository.getMeta(MetaKey.Version)).toBe(version);
    expect(sync.status()).toMatchObject({
      state: 'error',
      lastError: { message: 'search3: Subsonic server unreachable (ECONNRESET)' },
      trackCount: 10,
    });

    // The next attempt succeeds and clears the error.
    await sync.sync();
    expect(sync.status()).toMatchObject({ state: 'idle', lastError: null, trackCount: 3 });
  });

  it('runs one sync at a time', async () => {
    const { server, sync } = setup();
    const [a, b] = [sync.sync(), sync.sync({ force: true })];
    expect(sync.isRunning).toBe(true);
    expect(sync.status().state).toBe('syncing');
    expect(await a).toEqual(await b);
    expect(server.calls.filter((call) => call === 'getMusicFolders')).toHaveLength(1);
    expect(sync.isRunning).toBe(false);
  });

  it('reports status', async () => {
    const { sync } = setup();
    expect(sync.status()).toEqual({
      state: 'idle',
      progress: null,
      lastSync: null,
      lastRun: null,
      lastError: null,
      trackCount: 0,
    });
    await sync.sync();
    expect(sync.status()).toMatchObject({
      state: 'idle',
      progress: null,
      lastSync: { at: expect.any(String), version: expect.any(String) },
      lastRun: { result: 'synced', durationMs: expect.any(Number) },
      trackCount: 10,
    });
  });
});
