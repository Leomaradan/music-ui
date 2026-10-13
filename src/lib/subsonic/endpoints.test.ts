// @vitest-environment node
import { fakeFetch, jsonResponse, navidromeFixture } from '../../../tests/helpers/fixtures';
import { SubsonicClient } from './client';
import {
  getAlbumList2,
  getLastModified,
  getMusicFolders,
  getScanStatus,
  ping,
  search3,
} from './endpoints';

function clientFor(fixture: string) {
  const fake = fakeFetch(() => jsonResponse(navidromeFixture(fixture)));
  const client = new SubsonicClient({
    baseUrl: 'http://navidrome:4533',
    username: 'music',
    password: 'pw',
    fetch: fake.fetch,
  });
  return { client, calls: fake.calls };
}

describe('endpoints (Navidrome 0.64 fixtures)', () => {
  it('ping returns server info', async () => {
    const { client } = clientFor('ping');
    expect(await ping(client)).toEqual({
      apiVersion: '1.16.1',
      type: 'navidrome',
      serverVersion: '0.64.2 (10114574)',
      openSubsonic: true,
    });
  });

  it('getMusicFolders returns the libraries', async () => {
    const { client } = clientFor('getMusicFolders');
    expect(await getMusicFolders(client)).toEqual([
      { id: 1, name: 'Main' },
      { id: 2, name: 'Live' },
    ]);
  });

  it('getScanStatus', async () => {
    const { client } = clientFor('getScanStatus');
    expect(await getScanStatus(client)).toMatchObject({ scanning: false, count: 10 });
  });

  it('getLastModified', async () => {
    const { client, calls } = clientFor('getIndexes');
    expect(await getLastModified(client, 1)).toBe(1791789700000);
    expect(calls[0]?.pathname).toBe('/rest/getIndexes');
    expect(calls[0]?.searchParams.get('musicFolderId')).toBe('1');
  });

  it('search3 defaults to an empty query and scopes by folders', async () => {
    const { client, calls } = clientFor('search3');
    const result = await search3(client, {
      songCount: 500,
      albumCount: 0,
      artistCount: 0,
      musicFolderId: [1, 2],
    });
    const params = calls[0]?.searchParams;
    expect(params?.get('query')).toBe('');
    expect(params?.getAll('musicFolderId')).toEqual(['1', '2']);
    expect(result.albums).toEqual([]);
    expect(result.artists).toEqual([]);
    expect(result.songs).toHaveLength(3);
    const [song] = result.songs;
    expect(song).toMatchObject({
      id: expect.any(String),
      title: expect.any(String),
      albumId: expect.any(String),
      duration: expect.any(Number),
      genres: expect.any(Array),
      albumArtists: [{ id: expect.any(String), name: expect.any(String) }],
    });
  });

  it('getAlbumList2', async () => {
    const { client, calls } = clientFor('getAlbumList2');
    const albums = await getAlbumList2(client, {
      type: 'alphabeticalByName',
      size: 2,
      musicFolderId: 1,
    });
    expect(calls[0]?.searchParams.get('type')).toBe('alphabeticalByName');
    expect(albums.map((album) => album.name)).toEqual(['Arrival', 'Pump']);
    expect(albums[0]).toMatchObject({ artist: 'ABBA', year: 1976, songCount: 2 });
  });
});
