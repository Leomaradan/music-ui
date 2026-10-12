/** Library metadata as stored by the app (PLAN.md §5). */

export interface CatalogFolder {
  id: number;
  name: string;
}

export interface CatalogAlbum {
  id: string;
  folderId: number;
  name: string;
  albumArtist: string;
  albumArtistId: string | null;
  year: number | null;
  genre: string | null;
  coverArt: string | null;
  songCount: number;
  created: string | null;
}

export interface CatalogTrack {
  id: string;
  folderId: number;
  albumId: string | null;
  title: string;
  /** Track artist (display string, e.g. "Artist Two feat. Artist One"). */
  artist: string;
  artistId: string | null;
  /** Album artist: what the Artist filter uses. */
  albumArtist: string;
  albumArtistId: string | null;
  album: string;
  year: number | null;
  track: number | null;
  disc: number | null;
  /** Seconds. */
  duration: number;
  bitRate: number | null;
  suffix: string | null;
  size: number | null;
  coverArt: string | null;
  path: string | null;
  /** A track can have several genres (OpenSubsonic `genres[]`). */
  genres: string[];
}

export interface CatalogData {
  folders: CatalogFolder[];
  albums: CatalogAlbum[];
  tracks: CatalogTrack[];
}
