import 'server-only';
import { randomBytes } from 'node:crypto';
import { getCatalogService } from '@/lib/catalog';
import type { DynamicPlaylist, DynamicPlaylistInput } from './types';

export * from './types';

const KEY = 'dynamicPlaylists';

/** Dynamic playlists, kept in the app's own `app_state` table (Navidrome has no API for them). */
export function listDynamicPlaylists(): DynamicPlaylist[] {
  return getCatalogService().appState.get<DynamicPlaylist[]>(KEY) ?? [];
}

function save(playlists: DynamicPlaylist[]): void {
  getCatalogService().appState.set(KEY, playlists);
}

export function createDynamicPlaylist(input: DynamicPlaylistInput): DynamicPlaylist {
  const playlist = { id: `d${randomBytes(8).toString('hex')}`, ...input };
  save([...listDynamicPlaylists(), playlist]);
  return playlist;
}

/** Replaces a playlist's definition; null when there is no such playlist. */
export function updateDynamicPlaylist(
  id: string,
  input: DynamicPlaylistInput,
): DynamicPlaylist | null {
  const playlists = listDynamicPlaylists();
  if (!playlists.some((p) => p.id === id)) return null;
  const updated = { id, ...input };
  save(playlists.map((p) => (p.id === id ? updated : p)));
  return updated;
}

/** False when there was no such playlist. */
export function deleteDynamicPlaylist(id: string): boolean {
  const playlists = listDynamicPlaylists();
  const remaining = playlists.filter((p) => p.id !== id);
  if (remaining.length === playlists.length) return false;
  save(remaining);
  return true;
}
