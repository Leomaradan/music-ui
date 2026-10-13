// @vitest-environment node
import { FakeNavidrome } from '../../../tests/helpers/fake-navidrome';
import { openDatabase } from '@/lib/db';
import { CatalogRepository } from './repository';
import { buildSnapshot } from './snapshot';
import { CatalogSync } from './sync';

async function syncedRepository() {
  const repository = new CatalogRepository(openDatabase(':memory:'));
  await new CatalogSync({ client: new FakeNavidrome().client(), repository }).sync();
  return repository;
}

describe('buildSnapshot', () => {
  it('round-trips every track through the dictionaries', async () => {
    const data = (await syncedRepository()).read();
    const snapshot = buildSnapshot(data, 'v1', '2026-10-12T00:00:00Z');
    const { tracks, albums, artists, genres, folders } = snapshot;

    expect(tracks.id).toHaveLength(10);
    for (const [i, track] of data.tracks.entries()) {
      const album = tracks.album[i]!;
      expect({
        id: tracks.id[i],
        title: tracks.title[i],
        artist: artists[tracks.artist[i]!],
        albumArtist: artists[tracks.albumArtist[i]!],
        album: album === -1 ? null : albums.name[album],
        folderId: folders[tracks.folder[i]!]?.id,
        genres: tracks.genres[i]!.map((g) => genres[g]),
        year: tracks.year[i],
        duration: tracks.duration[i],
      }).toEqual({
        id: track.id,
        title: track.title,
        artist: track.artist,
        albumArtist: track.albumArtist,
        album: track.album,
        folderId: track.folderId,
        genres: track.genres,
        year: track.year,
        duration: track.duration,
      });
    }
  });

  it('stores each string once', async () => {
    const snapshot = buildSnapshot((await syncedRepository()).read(), 'v1', '');
    expect(snapshot.genres.toSorted()).toEqual(['Dance', 'Jazz', 'Pop', 'Rock']);
    expect(new Set(snapshot.artists).size).toBe(snapshot.artists.length);
    expect(snapshot.albums.name).toHaveLength(6);
    expect(snapshot).toMatchObject({
      version: 'v1',
      folders: [{ name: 'Main' }, { name: 'Live' }],
    });
  });
});
