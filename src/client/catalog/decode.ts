import type { CatalogSnapshot } from '@/lib/catalog/snapshot';

/** A track as used by the UI (decoded from the columnar snapshot). */
export interface Track {
  id: string;
  title: string;
  /** Track artist. */
  artist: string;
  /** Album artist: what the Artist filter uses. Empty when unknown. */
  albumArtist: string;
  album: string;
  albumId: string | null;
  folderId: number;
  folderName: string;
  genres: string[];
  year: number | null;
  track: number | null;
  disc: number | null;
  /** Seconds. */
  duration: number;
  bitRate: number | null;
  suffix: string | null;
  coverArt: string | null;
}

export interface AlbumInfo {
  name: string;
  albumArtist: string;
  year: number | null;
}

export interface Catalog {
  version: string;
  syncedAt: string;
  folders: { id: number; name: string }[];
  albums: Map<string, AlbumInfo>;
  /** In default display order (album artist, year, album, disc, track). */
  tracks: Track[];
}

export function decodeSnapshot(snapshot: CatalogSnapshot): Catalog {
  const { artists, genres, folders, albums: a, tracks: t } = snapshot;
  const albums = new Map<string, AlbumInfo>();
  for (const [i, id] of a.id.entries()) {
    albums.set(id, {
      name: a.name[i] ?? '',
      albumArtist: artists[a.artist[i] ?? -1] ?? '',
      year: a.year[i] ?? null,
    });
  }

  const tracks: Track[] = Array.from({ length: t.id.length });
  for (let i = 0; i < t.id.length; i++) {
    const albumIndex = t.album[i] ?? -1;
    const albumId = albumIndex >= 0 ? (a.id[albumIndex] ?? null) : null;
    const folder = folders[t.folder[i] ?? -1];
    tracks[i] = {
      id: t.id[i]!,
      title: t.title[i] ?? '',
      artist: artists[t.artist[i] ?? -1] ?? '',
      albumArtist: artists[t.albumArtist[i] ?? -1] ?? '',
      album: albumId ? (albums.get(albumId)?.name ?? '') : '',
      albumId,
      folderId: folder?.id ?? -1,
      folderName: folder?.name ?? '',
      genres: (t.genres[i] ?? []).map((g) => genres[g] ?? '').filter(Boolean),
      year: t.year[i] ?? null,
      track: t.track[i] ?? null,
      disc: t.disc[i] ?? null,
      duration: t.duration[i] ?? 0,
      bitRate: t.bitRate[i] ?? null,
      suffix: t.suffix[i] ?? null,
      coverArt: t.coverArt[i] ?? null,
    };
  }

  return {
    version: snapshot.version,
    syncedAt: snapshot.syncedAt,
    folders: folders.map(({ id, name }) => ({ id, name })),
    albums,
    tracks,
  };
}
