import { songGenres, toCatalogTrack } from './fetch';

describe('toCatalogTrack', () => {
  it('falls back to classic Subsonic fields without OpenSubsonic data', () => {
    const track = toCatalogTrack(
      {
        id: 's1',
        title: 'Song',
        artist: 'Guest',
        albumId: 'a1',
        genre: 'Rock',
        year: 0,
        track: 0,
        duration: 61.6,
      },
      3,
      {
        id: 'a1',
        name: 'Album',
        artist: 'Band',
        artistId: 'ar1',
        songCount: 1,
        duration: 61,
        year: 1999,
      },
    );
    expect(track).toMatchObject({
      folderId: 3,
      albumArtist: 'Band',
      albumArtistId: 'ar1',
      album: 'Album',
      year: 1999,
      track: null,
      duration: 62,
      genres: ['Rock'],
    });
  });

  it('joins several album artists when there is no display string', () => {
    const track = toCatalogTrack(
      {
        id: 's1',
        title: 'Duet',
        albumArtists: [
          { id: '1', name: 'A' },
          { id: '2', name: 'B' },
        ],
      },
      1,
    );
    expect(track).toMatchObject({ albumArtist: 'A & B', albumArtistId: '1', artist: '' });
  });
});

describe('songGenres', () => {
  it('prefers genres[], trims and dedupes', () => {
    expect(
      songGenres({
        id: 's',
        title: 't',
        genre: 'Pop',
        genres: [{ name: 'Pop ' }, { name: 'Pop' }, { name: '' }],
      }),
    ).toEqual(['Pop']);
  });

  it('returns no genre rather than an empty one', () => {
    expect(songGenres({ id: 's', title: 't' })).toEqual([]);
    expect(songGenres({ id: 's', title: 't', genre: ' ' })).toEqual([]);
  });
});
