import 'server-only';
import { getCatalogService } from '@/lib/catalog';
import type { Playlist } from '@/lib/subsonic';
import type { PlaylistSummary } from './types';

export type { PlaylistDetail, PlaylistSummary } from './types';

/** Upper bound for the tracks sent in one request. */
export const MAX_PLAYLIST_TRACKS = 100_000;

const ORDER_KEY = 'playlistOrder';

export function toSummary(playlist: Playlist): PlaylistSummary {
  return {
    id: playlist.id,
    name: playlist.name,
    songCount: playlist.songCount,
    duration: playlist.duration,
    readonly: playlist.readonly ?? false,
    coverArt: playlist.coverArt ?? null,
  };
}

export function getPlaylistOrder(): string[] {
  return getCatalogService().appState.get<string[]>(ORDER_KEY) ?? [];
}

export function setPlaylistOrder(ids: string[]): void {
  getCatalogService().appState.set(ORDER_KEY, ids);
}

/**
 * Sorts playlists in the order chosen in the sidebar. Playlists the app has not ordered yet
 * (e.g. created in another client) follow, oldest first.
 */
export function sortPlaylists(playlists: Playlist[], order: readonly string[]): Playlist[] {
  const rank = new Map(order.map((id, i) => [id, i]));
  return playlists.toSorted((a, b) => {
    const ra = rank.get(a.id);
    const rb = rank.get(b.id);
    if (ra !== undefined || rb !== undefined) {
      if (ra === undefined) return 1;
      if (rb === undefined) return -1;
      return ra - rb;
    }
    return (a.created ?? '').localeCompare(b.created ?? '') || a.name.localeCompare(b.name);
  });
}
