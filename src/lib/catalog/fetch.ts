import type { SubsonicClient } from '@/lib/subsonic/client';
import { getAlbumList2, getMusicFolders, search3 } from '@/lib/subsonic/endpoints';
import type { Album, MusicFolder, Song } from '@/lib/subsonic/schemas';
import type { CatalogAlbum, CatalogData, CatalogTrack } from './model';

/** Max page size accepted by Subsonic servers for search3 / getAlbumList2. */
export const PAGE_SIZE = 500;

export interface FetchProgress {
  phase: 'folders' | 'albums' | 'tracks';
  folder?: string;
  foldersDone: number;
  foldersTotal: number;
  tracks: number;
}

export interface FetchOptions {
  pageSize?: number;
  signal?: AbortSignal;
  onProgress?: (progress: FetchProgress) => void;
  /** Folders already fetched by the caller (avoids a second getMusicFolders call). */
  folders?: MusicFolder[];
}

/**
 * Downloads the whole library, folder by folder (PLAN.md §5):
 * every song through `search3` with an empty query, every album through `getAlbumList2`.
 * Requests are sequential on purpose, to keep the load on the server low.
 */
export async function fetchCatalog(
  client: SubsonicClient,
  { pageSize = PAGE_SIZE, signal, onProgress, folders: knownFolders }: FetchOptions = {},
): Promise<CatalogData> {
  const requestOptions = { signal };
  const progress: FetchProgress = { phase: 'folders', foldersDone: 0, foldersTotal: 0, tracks: 0 };
  const report = () => onProgress?.({ ...progress });

  report();
  const folders = knownFolders ?? (await getMusicFolders(client, requestOptions));
  progress.foldersTotal = folders.length;

  const albums = new Map<string, CatalogAlbum>();
  const tracks = new Map<string, CatalogTrack>();

  for (const folder of folders) {
    progress.folder = folder.name;
    progress.phase = 'albums';
    report();
    const folderAlbums = new Map<string, Album>();
    for (let offset = 0; ; offset += pageSize) {
      const page = await getAlbumList2(
        client,
        { type: 'alphabeticalByName', size: pageSize, offset, musicFolderId: folder.id },
        requestOptions,
      );
      for (const album of page) {
        folderAlbums.set(album.id, album);
        albums.set(album.id, toCatalogAlbum(album, folder.id));
      }
      if (page.length < pageSize) break;
    }

    progress.phase = 'tracks';
    report();
    for (let offset = 0; ; offset += pageSize) {
      const { songs } = await search3(
        client,
        {
          query: '',
          songCount: pageSize,
          songOffset: offset,
          albumCount: 0,
          artistCount: 0,
          musicFolderId: folder.id,
        },
        requestOptions,
      );
      for (const song of songs) {
        if (song.isDir) continue;
        const album = song.albumId ? folderAlbums.get(song.albumId) : undefined;
        tracks.set(song.id, toCatalogTrack(song, folder.id, album));
      }
      progress.tracks = tracks.size;
      report();
      if (songs.length < pageSize) break;
    }

    progress.foldersDone++;
    report();
  }

  return {
    folders: folders.map(({ id, name }) => ({ id, name })),
    albums: [...albums.values()],
    tracks: [...tracks.values()],
  };
}

export function toCatalogAlbum(album: Album, folderId: number): CatalogAlbum {
  return {
    id: album.id,
    folderId,
    name: album.name,
    albumArtist: album.artist ?? '',
    albumArtistId: album.artistId ?? null,
    year: positive(album.year),
    genre: album.genre || null,
    coverArt: album.coverArt ?? null,
    songCount: album.songCount,
    created: album.created ?? null,
  };
}

export function toCatalogTrack(song: Song, folderId: number, album?: Album): CatalogTrack {
  const albumArtists = song.albumArtists ?? [];
  const albumArtist =
    song.displayAlbumArtist ||
    albumArtists.map((artist) => artist.name).join(' & ') ||
    album?.artist ||
    song.artist ||
    '';
  return {
    id: song.id,
    folderId,
    albumId: song.albumId ?? null,
    title: song.title,
    artist: song.artist ?? '',
    artistId: song.artistId ?? null,
    albumArtist,
    albumArtistId: albumArtists[0]?.id ?? album?.artistId ?? null,
    album: song.album ?? album?.name ?? '',
    year: positive(song.year) ?? positive(album?.year),
    track: positive(song.track),
    disc: positive(song.discNumber),
    duration: Math.round(song.duration ?? 0),
    bitRate: positive(song.bitRate),
    suffix: song.suffix || null,
    size: positive(song.size),
    coverArt: song.coverArt ?? null,
    path: song.path ?? null,
    genres: songGenres(song),
  };
}

/** Genres from OpenSubsonic `genres[]`, falling back to the single `genre` field. */
export function songGenres(song: Song): string[] {
  const names = song.genres?.length ? song.genres.map((genre) => genre.name) : [song.genre ?? ''];
  return [...new Set(names.map((name) => name.trim()).filter(Boolean))];
}

function positive(value: number | undefined): number | null {
  return value !== undefined && value > 0 ? value : null;
}
