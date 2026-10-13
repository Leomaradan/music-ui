// @vitest-environment node
import { sampleCatalog } from '../../../tests/helpers/catalog';

describe('decodeSnapshot', () => {
  it('rebuilds tracks with names instead of indexes', async () => {
    const catalog = await sampleCatalog();
    expect(catalog.folders).toEqual([
      { id: 1, name: 'Main' },
      { id: 2, name: 'Live' },
    ]);
    expect(catalog.tracks).toHaveLength(10);
    expect(catalog.tracks.find((t) => t.title === 'Beach Night')).toMatchObject({
      artist: 'Artist Two feat. Artist One',
      albumArtist: 'Various Artists',
      album: 'Summer Hits',
      albumId: expect.any(String),
      folderId: 1,
      folderName: 'Main',
      genres: ['Pop', 'Dance'],
      year: 2001,
      track: 2,
      duration: 8,
      suffix: 'mp3',
    });
    const pump = [...catalog.albums.values()].find((album) => album.name === 'Pump');
    expect(pump).toEqual({ name: 'Pump', albumArtist: 'Aerosmith', year: 1989 });
  });
});
