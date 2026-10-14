// @vitest-environment node
import { sampleCatalog } from '../../../tests/helpers/catalog';
import {
  dynamicPlaylistInputSchema,
  type DynamicCriterion,
  type DynamicPlaylistInput,
} from '@/lib/dynamicPlaylists/types';
import type { Catalog } from './decode';
import { fieldValues, matchTracks } from './dynamic';

let catalog: Catalog;
beforeAll(async () => {
  catalog = await sampleCatalog();
});

const titles = (match: 'all' | 'any', ...criteria: DynamicCriterion[]) =>
  matchTracks(catalog.tracks, { name: 'test', match, criteria }).map((t) => t.title);
const yearCount = (op: DynamicCriterion['op'], value: number) =>
  titles('all', { field: 'year', op, value }).length;
const parses = (criterion: unknown) =>
  dynamicPlaylistInputSchema.safeParse({ name: 'x', match: 'all', criteria: [criterion] }).success;

describe('matchTracks', () => {
  it('matches text tags without case or accents', () => {
    expect(titles('all', { field: 'artist', op: '==', value: 'abba' })).toEqual([
      'Dancing Queen',
      'Knowing Me, Knowing You',
    ]);
    expect(titles('all', { field: 'folder', op: '==', value: 'LIVE' })).toHaveLength(3);
  });

  it('matches any of several genres with ==, none of them with !=', () => {
    expect(titles('all', { field: 'genre', op: '==', value: 'Dance' })).toEqual([
      'Sunny Day',
      'Beach Night',
    ]);
    const notPop = titles('all', { field: 'genre', op: '!=', value: 'Pop' });
    expect(notPop).toHaveLength(6);
    expect(notPop).not.toContain('Sunny Day');
  });

  it('compares years with every operator', () => {
    expect(yearCount('==', 1975)).toBe(2);
    expect(yearCount('!=', 1975)).toBe(8);
    expect(yearCount('<', 1975)).toBe(2);
    expect(yearCount('<=', 1975)).toBe(4);
    expect(yearCount('>', 1989)).toBe(2);
    expect(yearCount('>=', 1989)).toBe(3);
  });

  it('combines criteria with all (and) or any (or)', () => {
    const rock = { field: 'genre', op: '==', value: 'Rock' } as const;
    const seventies = { field: 'year', op: '<', value: 1980 } as const;
    expect(titles('all', rock, seventies)).toEqual([
      'Walk This Way',
      'Sweet Emotion',
      'Back in the Saddle (Live)',
    ]);
    expect(titles('any', rock, { field: 'artist', op: '==', value: 'Miles Davis' })).toHaveLength(
      6,
    );
  });

  it('follows the catalog: tracks missing a tag or a year', () => {
    const tracks = catalog.tracks.map((t, i) => (i === 0 ? { ...t, year: null, genres: [] } : t));
    const list = (playlist: DynamicPlaylistInput) => matchTracks(tracks, playlist).length;
    const one = (criterion: DynamicCriterion) =>
      list({ name: 't', match: 'all', criteria: [criterion] });
    expect(one({ field: 'year', op: '>', value: 0 })).toBe(9);
    expect(one({ field: 'year', op: '!=', value: 1976 })).toBe(9);
    expect(one({ field: 'genre', op: '!=', value: 'Pop' })).toBe(7);
  });

  it('matches nothing without criteria', () => {
    expect(titles('all')).toEqual([]);
  });
});

describe('fieldValues', () => {
  it('lists the distinct values of a tag, sorted', () => {
    expect(fieldValues(catalog, 'genre')).toEqual(['Dance', 'Jazz', 'Pop', 'Rock']);
    expect(fieldValues(catalog, 'folder')).toEqual(['Live', 'Main']);
  });
});

describe('dynamicPlaylistInputSchema', () => {
  it('accepts ordering operators on the year only', () => {
    expect(parses({ field: 'year', op: '>=', value: 1970 })).toBe(true);
    expect(parses({ field: 'genre', op: '>=', value: 'Rock' })).toBe(false);
    expect(parses({ field: 'genre', op: '!=', value: 'Rock' })).toBe(true);
  });

  it('needs a number for the year and a text elsewhere', () => {
    expect(parses({ field: 'year', op: '==', value: '1970' })).toBe(false);
    expect(parses({ field: 'genre', op: '==', value: 3 })).toBe(false);
  });

  it('needs a name and at least one criterion', () => {
    expect(
      dynamicPlaylistInputSchema.safeParse({ name: ' ', match: 'all', criteria: [] }).success,
    ).toBe(false);
  });
});
