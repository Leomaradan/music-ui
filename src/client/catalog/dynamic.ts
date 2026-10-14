import type {
  DynamicCriterion,
  DynamicField,
  DynamicPlaylistInput,
} from '@/lib/dynamicPlaylists/types';
import type { Catalog, Track } from './decode';

const collator = new Intl.Collator(undefined, { sensitivity: 'base' });
const sameText = (a: string, b: string) => collator.compare(a, b) === 0;

/** The values a track has for a field (several genres; none when the tag is missing). */
function textValues(track: Track, field: Exclude<DynamicField, 'year'>): string[] {
  switch (field) {
    case 'genre':
      return track.genres;
    case 'artist':
      return track.albumArtist ? [track.albumArtist] : [];
    case 'trackArtist':
      return track.artist ? [track.artist] : [];
    case 'album':
      return track.album ? [track.album] : [];
    case 'folder':
      return [track.folderName];
    case 'format':
      return track.suffix ? [track.suffix] : [];
  }
}

function matchYear(year: number | null, op: DynamicCriterion['op'], value: number): boolean {
  // A track without a year only matches "is not".
  if (year === null) return op === '!=';
  switch (op) {
    case '==':
      return year === value;
    case '!=':
      return year !== value;
    case '<':
      return year < value;
    case '<=':
      return year <= value;
    case '>':
      return year > value;
    case '>=':
      return year >= value;
  }
}

/**
 * Whether a track matches one criterion. Text tags compare without case or accents; with
 * several values (genres), `==` needs one of them to match and `!=` none of them.
 */
export function matchCriterion(track: Track, criterion: DynamicCriterion): boolean {
  if (criterion.field === 'year') {
    return matchYear(track.year, criterion.op, Number(criterion.value));
  }
  const value = String(criterion.value);
  const found = textValues(track, criterion.field).some((v) => sameText(v, value));
  return criterion.op === '!=' ? !found : found;
}

/** The catalog tracks matching a dynamic playlist, in catalog order. */
export function matchTracks(tracks: readonly Track[], playlist: DynamicPlaylistInput): Track[] {
  const { criteria, match } = playlist;
  if (criteria.length === 0) return [];
  const test =
    match === 'all'
      ? (track: Track) => criteria.every((c) => matchCriterion(track, c))
      : (track: Track) => criteria.some((c) => matchCriterion(track, c));
  return tracks.filter(test);
}

/** Distinct values of a text field in the catalog, sorted (suggestions for the editor). */
export function fieldValues(catalog: Catalog, field: Exclude<DynamicField, 'year'>): string[] {
  const values = new Set<string>();
  for (const track of catalog.tracks) for (const v of textValues(track, field)) values.add(v);
  return [...values].toSorted(collator.compare);
}
