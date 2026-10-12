import type { Catalog, Track } from './decode';

/**
 * Cascading filters (PLAN.md §7.3): Music Folder → Genre → Artist (album artist) → Album.
 * Values are stable across catalog versions: folder id, genre name, album artist name, album id.
 * An empty list means "everything". `NONE` stands for a missing genre / artist / album.
 */
export interface Filters {
  folders: number[];
  genres: string[];
  artists: string[];
  albums: string[];
}

export type FilterLevel = keyof Filters;
export const FILTER_LEVELS: readonly FilterLevel[] = ['folders', 'genres', 'artists', 'albums'];
export const EMPTY_FILTERS: Filters = { folders: [], genres: [], artists: [], albums: [] };
export const NONE = '';

export interface FacetOption<V extends string | number = string | number> {
  value: V;
  label: string;
  /** Extra line, e.g. album artist and year for albums. */
  secondary?: string;
  /** Tracks with this value among the tracks matching the previous levels. */
  count: number;
}

export interface Facets {
  folders: FacetOption<number>[];
  genres: FacetOption<string>[];
  artists: FacetOption<string>[];
  albums: FacetOption<string>[];
  /** Number of tracks each box is choosing from (the tracks matching the previous levels). */
  totals: Record<FilterLevel, number>;
  /** Tracks matching all four levels, in catalog order. */
  tracks: Track[];
}

const valuesOf: { [L in FilterLevel]: (track: Track) => Filters[L] } = {
  folders: (track) => [track.folderId],
  genres: (track) => (track.genres.length ? track.genres : [NONE]),
  artists: (track) => [track.albumArtist],
  albums: (track) => [track.albumId ?? NONE],
};

const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });

function byLabel(a: FacetOption, b: FacetOption): number {
  // The "none" entry goes last.
  if ((a.value === NONE) !== (b.value === NONE)) return a.value === NONE ? 1 : -1;
  return collator.compare(a.label, b.label);
}

function countValues<L extends FilterLevel>(
  level: L,
  tracks: Track[],
): Map<Filters[L][number], number> {
  const counts = new Map<Filters[L][number], number>();
  const get = valuesOf[level];
  for (const track of tracks) {
    for (const value of get(track)) counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return counts;
}

function narrow<L extends FilterLevel>(level: L, tracks: Track[], selected: Filters[L]): Track[] {
  if (selected.length === 0) return tracks;
  const set = new Set<string | number>(selected);
  const get = valuesOf[level];
  return tracks.filter((track) => get(track).some((value) => set.has(value)));
}

export function computeFacets(catalog: Catalog, filters: Filters): Facets {
  const folderNames = new Map(catalog.folders.map((folder) => [folder.id, folder.name]));
  const folderOrder = new Map(catalog.folders.map((folder, i) => [folder.id, i]));

  const level0 = catalog.tracks;
  const folders = [...countValues('folders', level0)]
    .map(([value, count]) => ({ value, count, label: folderNames.get(value) ?? `#${value}` }))
    .toSorted((a, b) => (folderOrder.get(a.value) ?? 0) - (folderOrder.get(b.value) ?? 0));

  const level1 = narrow('folders', level0, filters.folders);
  const genres = [...countValues('genres', level1)]
    .map(([value, count]) => ({ value, count, label: value || '(No genre)' }))
    .toSorted(byLabel);

  const level2 = narrow('genres', level1, filters.genres);
  const artists = [...countValues('artists', level2)]
    .map(([value, count]) => ({ value, count, label: value || '(Unknown artist)' }))
    .toSorted(byLabel);

  const level3 = narrow('artists', level2, filters.artists);
  const albums = [...countValues('albums', level3)]
    .map(([value, count]) => {
      const info = catalog.albums.get(value);
      const secondary = [info?.albumArtist, info?.year].filter(Boolean).join(' · ');
      return { value, count, label: info?.name || '(No album)', secondary };
    })
    .toSorted(byLabel);

  const tracks = narrow('albums', level3, filters.albums);
  return {
    folders,
    genres,
    artists,
    albums,
    totals: {
      folders: level0.length,
      genres: level1.length,
      artists: level2.length,
      albums: level3.length,
    },
    tracks,
  };
}

/**
 * Drops selected values that no longer exist (e.g. after a library change), level by level.
 * Returns the same object when nothing changed.
 */
export function pruneFilters(catalog: Catalog, filters: Filters): Filters {
  const next = { ...filters };
  let changed = false;
  let tracks = catalog.tracks;
  for (const level of FILTER_LEVELS) {
    const available = countValues(level, tracks);
    const kept = (filters[level] as (string | number)[]).filter((value) =>
      available.has(value as never),
    );
    if (kept.length !== filters[level].length) {
      changed = true;
      (next as Record<FilterLevel, (string | number)[]>)[level] = kept;
    }
    tracks = narrow(level, tracks, next[level]);
  }
  return changed ? next : filters;
}

let memo: { catalog: Catalog; filters: Filters; facets: Facets } | null = null;

/** `computeFacets` with a one-entry cache, shared by the filter boxes and the track table. */
export function getFacets(catalog: Catalog, filters: Filters): Facets {
  if (memo?.catalog !== catalog || memo.filters !== filters) {
    memo = { catalog, filters, facets: computeFacets(catalog, filters) };
  }
  return memo.facets;
}
