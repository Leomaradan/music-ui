// @vitest-environment node
import { sampleCatalog } from '../../../tests/helpers/catalog';
import type { Catalog } from './decode';
import {
  EMPTY_FILTERS,
  NONE,
  computeFacets,
  getFacets,
  pruneFilters,
  type Filters,
  tracksForValues,
} from './facets';

let catalog: Catalog;
beforeAll(async () => {
  catalog = await sampleCatalog();
});

const f = (partial: Partial<Filters>): Filters => ({ ...EMPTY_FILTERS, ...partial });
const labels = (options: { label: string; count: number }[]) =>
  options.map((option) => `${option.label} ${option.count}`);
const titles = (filters: Filters) => computeFacets(catalog, filters).tracks.map((t) => t.title);
const albumId = (name: string) =>
  [...catalog.albums].find(([, album]) => album.name === name)?.[0] ?? '';

describe('computeFacets', () => {
  it('lists everything when nothing is selected', () => {
    const facets = computeFacets(catalog, EMPTY_FILTERS);
    expect(labels(facets.folders)).toEqual(['Main 7', 'Live 3']);
    // A track with two genres counts in both.
    expect(labels(facets.genres)).toEqual(['Dance 2', 'Jazz 2', 'Pop 4', 'Rock 4']);
    expect(labels(facets.artists)).toEqual([
      'ABBA 2',
      'Aerosmith 4',
      'Miles Davis 2',
      'Various Artists 2',
    ]);
    expect(facets.albums).toHaveLength(6);
    expect(facets.tracks).toHaveLength(10);
    expect(facets.totals).toEqual({ folders: 10, genres: 10, artists: 10, albums: 10 });
  });

  it('each box only lists values of the tracks matching the previous boxes', () => {
    const live = computeFacets(catalog, f({ folders: [2] }));
    expect(labels(live.genres)).toEqual(['Jazz 2', 'Rock 1']);
    expect(labels(live.artists)).toEqual(['Aerosmith 1', 'Miles Davis 2']);
    expect(live.totals).toMatchObject({ genres: 3, artists: 3 });

    const rock = computeFacets(catalog, f({ genres: ['Rock'] }));
    expect(labels(rock.artists)).toEqual(['Aerosmith 4']);
    expect(rock.albums.map((album) => album.label)).toEqual([
      'Live! Bootleg',
      'Pump',
      'Toys in the Attic',
    ]);
    expect(rock.albums[1]).toMatchObject({ label: 'Pump', secondary: '1989' });
  });

  it('shows all tracks of an artist until an album is selected', () => {
    expect(titles(f({ artists: ['Aerosmith'] }))).toEqual([
      'Walk This Way',
      'Sweet Emotion',
      'Back in the Saddle (Live)',
      'Love in an Elevator',
    ]);
    expect(titles(f({ artists: ['Aerosmith'], albums: [albumId('Pump')] }))).toEqual([
      'Love in an Elevator',
    ]);
  });

  it('combines several values of a box with OR, and boxes with AND', () => {
    expect(titles(f({ artists: ['ABBA', 'Miles Davis'] }))).toHaveLength(4);
    expect(titles(f({ folders: [2], artists: ['ABBA', 'Miles Davis'] }))).toEqual([
      'So What (Live)',
      'Stella by Starlight (Live)',
    ]);
  });

  it('matches multi-genre tracks on any of their genres', () => {
    expect(titles(f({ genres: ['Dance'] }))).toEqual(['Sunny Day', 'Beach Night']);
    expect(titles(f({ genres: ['Pop'] }))).toHaveLength(4);
  });

  it('puts tracks without genre / album artist under a "none" entry, listed last', () => {
    const bare = {
      ...catalog,
      tracks: [
        ...catalog.tracks,
        { ...catalog.tracks[0]!, id: 'x', genres: [], albumArtist: '', albumId: null, album: '' },
      ],
    };
    const facets = computeFacets(bare, EMPTY_FILTERS);
    expect(facets.genres.at(-1)).toEqual({ value: NONE, label: '(No genre)', count: 1 });
    expect(facets.artists.at(-1)).toMatchObject({ value: NONE, label: '(Unknown artist)' });
    expect(facets.albums.at(-1)).toMatchObject({ value: NONE, label: '(No album)' });
    expect(computeFacets(bare, f({ genres: [NONE] })).tracks.map((t) => t.id)).toEqual(['x']);
  });
});

const titlesOf = (tracks: { title: string }[]) => tracks.map((t) => t.title);

describe('tracksForValues', () => {
  it('lists the tracks of the values, within the boxes before theirs', () => {
    expect(titlesOf(tracksForValues(catalog, EMPTY_FILTERS, 'artists', ['Aerosmith']))).toEqual([
      'Walk This Way',
      'Sweet Emotion',
      'Back in the Saddle (Live)',
      'Love in an Elevator',
    ]);
    expect(
      titlesOf(tracksForValues(catalog, f({ folders: [2] }), 'artists', ['Aerosmith'])),
    ).toEqual(['Back in the Saddle (Live)']);
  });

  it('ignores the boxes after theirs, and combines several values', () => {
    const filters = f({ artists: ['ABBA'], albums: [albumId('Pump')] });
    expect(tracksForValues(catalog, filters, 'genres', ['Jazz', 'Dance'])).toHaveLength(4);
    expect(tracksForValues(catalog, filters, 'genres', [])).toEqual([]);
  });
});

describe('getFacets', () => {
  it('reuses the result for the same catalog and filters objects', () => {
    const filters = f({ folders: [1] });
    expect(getFacets(catalog, filters)).toBe(getFacets(catalog, filters));
    expect(getFacets(catalog, { ...filters })).not.toBe(getFacets(catalog, filters));
  });
});

describe('pruneFilters', () => {
  it('keeps valid filters untouched', () => {
    const filters = f({ folders: [2], artists: ['Miles Davis'] });
    expect(pruneFilters(catalog, filters)).toBe(filters);
  });

  it('drops values that no longer exist, level by level', () => {
    expect(
      pruneFilters(catalog, f({ folders: [2, 99], genres: ['Pop', 'Jazz'], artists: ['Gone'] })),
    ).toEqual(f({ folders: [2], genres: ['Jazz'] }));
  });
});
