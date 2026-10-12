import type { CatalogData } from './model';

/**
 * Compact, columnar catalog sent to the browser (PLAN.md §5).
 * Repeated strings live once in dictionaries; tracks refer to them by index.
 * `-1` means "none" in index columns. Shared by the server encoder and the client decoder.
 */
export interface CatalogSnapshot {
  version: string;
  syncedAt: string;
  folders: { id: number; name: string }[];
  genres: string[];
  /** Track artists and album artists. */
  artists: string[];
  albums: {
    id: string[];
    name: string[];
    /** Album artist, index into `artists`. */
    artist: number[];
    year: (number | null)[];
    coverArt: (string | null)[];
  };
  tracks: {
    id: string[];
    title: string[];
    /** Track artist, index into `artists`. */
    artist: number[];
    /** Album artist, index into `artists`. */
    albumArtist: number[];
    /** Index into `albums`, -1 when the track has no album. */
    album: number[];
    /** Index into `folders`. */
    folder: number[];
    /** Indexes into `genres` (a track can have several, or none). */
    genres: number[][];
    year: (number | null)[];
    track: (number | null)[];
    disc: (number | null)[];
    /** Seconds. */
    duration: number[];
    bitRate: (number | null)[];
    suffix: (string | null)[];
    coverArt: (string | null)[];
  };
}

class Dictionary {
  readonly values: string[] = [];
  private readonly index = new Map<string, number>();

  add(value: string): number {
    let i = this.index.get(value);
    if (i === undefined) {
      i = this.values.length;
      this.values.push(value);
      this.index.set(value, i);
    }
    return i;
  }
}

/** Encodes a catalog read from the repository (tracks already in display order). */
export function buildSnapshot(
  data: CatalogData,
  version: string,
  syncedAt: string,
): CatalogSnapshot {
  const artists = new Dictionary();
  const genres = new Dictionary();
  const folderIndex = new Map(data.folders.map((folder, i) => [folder.id, i]));

  const albums: CatalogSnapshot['albums'] = {
    id: [],
    name: [],
    artist: [],
    year: [],
    coverArt: [],
  };
  const albumIndex = new Map<string, number>();
  for (const album of data.albums) {
    albumIndex.set(album.id, albums.id.length);
    albums.id.push(album.id);
    albums.name.push(album.name);
    albums.artist.push(artists.add(album.albumArtist));
    albums.year.push(album.year);
    albums.coverArt.push(album.coverArt);
  }

  const tracks: CatalogSnapshot['tracks'] = {
    id: [],
    title: [],
    artist: [],
    albumArtist: [],
    album: [],
    folder: [],
    genres: [],
    year: [],
    track: [],
    disc: [],
    duration: [],
    bitRate: [],
    suffix: [],
    coverArt: [],
  };
  for (const track of data.tracks) {
    tracks.id.push(track.id);
    tracks.title.push(track.title);
    tracks.artist.push(artists.add(track.artist));
    tracks.albumArtist.push(artists.add(track.albumArtist));
    tracks.album.push(track.albumId === null ? -1 : (albumIndex.get(track.albumId) ?? -1));
    tracks.folder.push(folderIndex.get(track.folderId) ?? -1);
    tracks.genres.push(track.genres.map((genre) => genres.add(genre)));
    tracks.year.push(track.year);
    tracks.track.push(track.track);
    tracks.disc.push(track.disc);
    tracks.duration.push(track.duration);
    tracks.bitRate.push(track.bitRate);
    tracks.suffix.push(track.suffix);
    tracks.coverArt.push(track.coverArt);
  }

  return {
    version,
    syncedAt,
    folders: data.folders.map(({ id, name }) => ({ id, name })),
    genres: genres.values,
    artists: artists.values,
    albums,
    tracks,
  };
}
