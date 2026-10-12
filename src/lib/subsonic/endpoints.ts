import type { RequestOptions, SubsonicClient } from './client';
import { SubsonicError } from './errors';
import {
  albumList2Schema,
  indexesSchema,
  musicFoldersSchema,
  playQueueSchema,
  playlistsSchema,
  playlistWithSongsSchema,
  scanStatusSchema,
  searchResult3Schema,
  type Album,
  type Artist,
  type MusicFolder,
  type PlayQueue,
  type Playlist,
  type PlaylistWithSongs,
  type ScanStatus,
  type Song,
} from './schemas';

/** One folder id, several ids (repeated param), or none (= all folders). */
export type MusicFolderScope = number | readonly number[] | undefined;

export interface ServerInfo {
  apiVersion: string;
  type: string | undefined;
  serverVersion: string | undefined;
  openSubsonic: boolean;
}

export async function ping(client: SubsonicClient, options?: RequestOptions): Promise<ServerInfo> {
  const envelope = await client.request('ping', {}, options);
  return {
    apiVersion: envelope.version,
    type: envelope.type,
    serverVersion: envelope.serverVersion,
    openSubsonic: envelope.openSubsonic ?? false,
  };
}

/** Music folders the user can access (Navidrome: libraries). */
export async function getMusicFolders(
  client: SubsonicClient,
  options?: RequestOptions,
): Promise<MusicFolder[]> {
  const result = await client.get(
    'getMusicFolders',
    'musicFolders',
    musicFoldersSchema,
    {},
    options,
  );
  return result.musicFolder;
}

export function getScanStatus(
  client: SubsonicClient,
  options?: RequestOptions,
): Promise<ScanStatus> {
  return client.get('getScanStatus', 'scanStatus', scanStatusSchema, {}, options);
}

/** Epoch ms of the last library change, for cheap change detection. */
export async function getLastModified(
  client: SubsonicClient,
  musicFolderId?: number,
  options?: RequestOptions,
): Promise<number> {
  const result = await client.get(
    'getIndexes',
    'indexes',
    indexesSchema,
    { musicFolderId },
    options,
  );
  return result.lastModified;
}

export interface Search3Params {
  /** Empty string returns everything (Navidrome / OpenSubsonic). */
  query?: string;
  songCount?: number;
  songOffset?: number;
  albumCount?: number;
  albumOffset?: number;
  artistCount?: number;
  artistOffset?: number;
  musicFolderId?: MusicFolderScope;
}

export interface Search3Result {
  artists: Artist[];
  albums: Album[];
  songs: Song[];
}

export async function search3(
  client: SubsonicClient,
  { query = '', ...params }: Search3Params = {},
  options?: RequestOptions,
): Promise<Search3Result> {
  const result = await client.get(
    'search3',
    'searchResult3',
    searchResult3Schema,
    { query, ...params },
    options,
  );
  return { artists: result.artist, albums: result.album, songs: result.song };
}

export type AlbumListType =
  | 'random'
  | 'newest'
  | 'highest'
  | 'frequent'
  | 'recent'
  | 'alphabeticalByName'
  | 'alphabeticalByArtist'
  | 'starred'
  | 'byYear'
  | 'byGenre';

export interface AlbumList2Params {
  type: AlbumListType;
  /** Max 500. */
  size?: number;
  offset?: number;
  fromYear?: number;
  toYear?: number;
  genre?: string;
  musicFolderId?: MusicFolderScope;
}

export async function getAlbumList2(
  client: SubsonicClient,
  params: AlbumList2Params,
  options?: RequestOptions,
): Promise<Album[]> {
  const result = await client.get(
    'getAlbumList2',
    'albumList2',
    albumList2Schema,
    { ...params },
    options,
  );
  return result.album;
}

/** The user's saved play queue (shared by every client of the account). */
export async function getPlayQueue(
  client: SubsonicClient,
  options?: RequestOptions,
): Promise<PlayQueue> {
  const envelope = await client.request('getPlayQueue', {}, options);
  // An empty queue may come without a playQueue object.
  const result = playQueueSchema.safeParse(envelope.playQueue ?? {});
  if (!result.success) {
    throw new SubsonicError('invalid-response', 'getPlayQueue: unexpected "playQueue" payload', {
      cause: result.error,
    });
  }
  return result.data;
}

export interface SavePlayQueueParams {
  ids: readonly string[];
  current?: string;
  /** Milliseconds. */
  position?: number;
}

/** Saves the play queue. Sent as a form POST: a queue can hold thousands of ids. */
export async function savePlayQueue(
  client: SubsonicClient,
  { ids, current, position }: SavePlayQueueParams,
  options?: RequestOptions,
): Promise<void> {
  await client.request(
    'savePlayQueue',
    { id: ids, current, position: position === undefined ? undefined : Math.round(position) },
    { ...options, post: true },
  );
}

export async function getPlaylists(
  client: SubsonicClient,
  options?: RequestOptions,
): Promise<Playlist[]> {
  const result = await client.get('getPlaylists', 'playlists', playlistsSchema, {}, options);
  return result.playlist;
}

export function getPlaylist(
  client: SubsonicClient,
  id: string,
  options?: RequestOptions,
): Promise<PlaylistWithSongs> {
  return client.get('getPlaylist', 'playlist', playlistWithSongsSchema, { id }, options);
}

/**
 * Creates a playlist, or replaces the tracks of `playlistId`. Sent as a form POST: a playlist
 * can hold thousands of tracks.
 */
export function createPlaylist(
  client: SubsonicClient,
  params: { name?: string; playlistId?: string; songIds: readonly string[] },
  options?: RequestOptions,
): Promise<PlaylistWithSongs> {
  return client.get(
    'createPlaylist',
    'playlist',
    playlistWithSongsSchema,
    { name: params.name, playlistId: params.playlistId, songId: params.songIds },
    { ...options, post: true },
  );
}

export interface UpdatePlaylistParams {
  playlistId: string;
  name?: string;
  /** Appended at the end. */
  songIdToAdd?: readonly string[];
  /** Positions (0-based) in the playlist before the update. */
  songIndexToRemove?: readonly number[];
}

export async function updatePlaylist(
  client: SubsonicClient,
  params: UpdatePlaylistParams,
  options?: RequestOptions,
): Promise<void> {
  await client.request('updatePlaylist', { ...params }, { ...options, post: true });
}

export async function deletePlaylist(
  client: SubsonicClient,
  id: string,
  options?: RequestOptions,
): Promise<void> {
  await client.request('deletePlaylist', { id }, options);
}
