import type { Catalog, Track } from './decode';

let cache: { catalog: Catalog; byId: Map<string, Track> } | null = null;

/** Tracks by id for a catalog (built once per catalog version). */
export function tracksById(catalog: Catalog): Map<string, Track> {
  if (cache?.catalog !== catalog) {
    cache = { catalog, byId: new Map(catalog.tracks.map((track) => [track.id, track])) };
  }
  return cache.byId;
}

/** Placeholder for a queued track missing from the catalog (removed from the library). */
export function unknownTrack(id: string): Track {
  return {
    id,
    title: '(Unavailable track)',
    artist: '',
    albumArtist: '',
    album: '',
    albumId: null,
    folderId: -1,
    folderName: '',
    genres: [],
    year: null,
    track: null,
    disc: null,
    duration: 0,
    bitRate: null,
    suffix: null,
    coverArt: null,
  };
}
