'use client';

import { arrayMove } from '@dnd-kit/sortable';
import { create } from 'zustand';
import { api } from '@/client/api';
import type { PlaylistDetail, PlaylistSummary } from '@/lib/playlists/types';
import { notify } from './notificationStore';
import { usePlayerStore } from './playerStore';
import { useViewStore, viewOfPlaylist } from './viewStore';

interface PlaylistState {
  playlists: PlaylistSummary[];
  status: 'loading' | 'ready' | 'error';
  /** Track ids of the playlists opened so far (refreshed when opened). */
  tracks: Record<string, string[]>;
  /** Playlist whose name is being edited in the sidebar. */
  renamingId: string | null;

  load(): Promise<void>;
  loadTracks(id: string): Promise<void>;
  /** Plays the playlist in the current playback mode (it becomes "Currently playing"). */
  play(id: string): Promise<void>;
  /** Creates a playlist (a free "New playlist N" name by default) and opens its rename field. */
  create(trackIds?: string[], name?: string): Promise<PlaylistSummary | null>;
  append(id: string, trackIds: string[]): Promise<void>;
  /** Removes tracks by position. */
  removeTracks(id: string, indexes: number[]): Promise<void>;
  rename(id: string, name: string): Promise<void>;
  remove(id: string): Promise<void>;
  /** Moves a playlist in the sidebar (saved on the server). */
  move(fromIndex: number, toIndex: number): Promise<void>;
  setRenaming(id: string | null): void;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** "New playlist", or "New playlist 2", 3… when taken. */
export function freePlaylistName(taken: readonly string[], base = 'New playlist'): string {
  const names = new Set(taken.map((name) => name.toLowerCase()));
  if (!names.has(base.toLowerCase())) return base;
  for (let n = 2; ; n++) {
    const candidate = `${base} ${n}`;
    if (!names.has(candidate.toLowerCase())) return candidate;
  }
}

/** Custom playlists, stored in Navidrome (PLAN.md §7.2). */
export const usePlaylistStore = create<PlaylistState>()((set, get) => {
  /** Replaces one playlist's summary (and tracks, when known) after a server change. */
  const applyDetail = (detail: PlaylistDetail) => {
    const { trackIds, ...summary } = detail;
    set({
      playlists: get().playlists.map((p) => (p.id === detail.id ? summary : p)),
      tracks: { ...get().tracks, [detail.id]: trackIds },
    });
  };

  return {
    playlists: [],
    status: 'loading',
    tracks: {},
    renamingId: null,

    async load() {
      try {
        const { playlists } = await api<{ playlists: PlaylistSummary[] }>('/api/playlists');
        set({ playlists, status: 'ready' });
      } catch (error) {
        set({ status: 'error' });
        notify(`Could not load the playlists: ${errorMessage(error)}`, 'error');
      }
    },

    async loadTracks(id) {
      try {
        applyDetail(await api<PlaylistDetail>(`/api/playlists/${encodeURIComponent(id)}`));
      } catch (error) {
        notify(`Could not load the playlist: ${errorMessage(error)}`, 'error');
      }
    },

    async play(id) {
      if (!get().tracks[id]) await get().loadTracks(id);
      const trackIds = get().tracks[id];
      if (!trackIds) return;
      if (trackIds.length === 0) {
        const name = get().playlists.find((p) => p.id === id)?.name ?? 'This playlist';
        notify(`"${name}" is empty`, 'info');
        return;
      }
      usePlayerStore.getState().playSelection(trackIds, null);
    },

    async create(trackIds = [], name) {
      const finalName = name ?? freePlaylistName(get().playlists.map((p) => p.name));
      try {
        const created = await api<PlaylistSummary>('/api/playlists', {
          method: 'POST',
          json: { name: finalName, trackIds },
        });
        set({
          playlists: [...get().playlists, created],
          tracks: { ...get().tracks, [created.id]: trackIds },
          renamingId: created.id,
        });
        notify(
          trackIds.length
            ? `Created "${created.name}" with ${plural(trackIds.length, 'track')}`
            : `Created "${created.name}"`,
          'success',
        );
        return created;
      } catch (error) {
        notify(`Could not create the playlist: ${errorMessage(error)}`, 'error');
        return null;
      }
    },

    async append(id, trackIds) {
      const playlist = get().playlists.find((p) => p.id === id);
      if (!playlist || playlist.readonly || trackIds.length === 0) return;
      try {
        applyDetail(
          await api<PlaylistDetail>(`/api/playlists/${encodeURIComponent(id)}`, {
            method: 'PATCH',
            json: { add: trackIds },
          }),
        );
        notify(`Added ${plural(trackIds.length, 'track')} to "${playlist.name}"`, 'success');
      } catch (error) {
        notify(`Could not add the tracks: ${errorMessage(error)}`, 'error');
      }
    },

    async removeTracks(id, indexes) {
      const playlist = get().playlists.find((p) => p.id === id);
      if (!playlist || playlist.readonly || indexes.length === 0) return;
      // Optimistic: hide the rows at once.
      const removed = new Set(indexes);
      const previous = get().tracks[id];
      if (previous) {
        set({ tracks: { ...get().tracks, [id]: previous.filter((_, i) => !removed.has(i)) } });
      }
      try {
        applyDetail(
          await api<PlaylistDetail>(`/api/playlists/${encodeURIComponent(id)}`, {
            method: 'PATCH',
            json: { remove: [...removed] },
          }),
        );
      } catch (error) {
        if (previous) set({ tracks: { ...get().tracks, [id]: previous } });
        notify(`Could not remove the tracks: ${errorMessage(error)}`, 'error');
      }
    },

    async rename(id, name) {
      const playlist = get().playlists.find((p) => p.id === id);
      const trimmed = name.trim();
      set({ renamingId: null });
      if (!playlist || playlist.readonly || !trimmed || trimmed === playlist.name) return;
      const renamed = { ...playlist, name: trimmed };
      set({ playlists: get().playlists.map((p) => (p.id === id ? renamed : p)) });
      try {
        applyDetail(
          await api<PlaylistDetail>(`/api/playlists/${encodeURIComponent(id)}`, {
            method: 'PATCH',
            json: { name: trimmed },
          }),
        );
      } catch (error) {
        set({ playlists: get().playlists.map((p) => (p.id === id ? playlist : p)) });
        notify(`Could not rename the playlist: ${errorMessage(error)}`, 'error');
      }
    },

    async remove(id) {
      const playlist = get().playlists.find((p) => p.id === id);
      if (!playlist || playlist.readonly) return;
      try {
        await api(`/api/playlists/${encodeURIComponent(id)}`, { method: 'DELETE' });
        const { [id]: _, ...tracks } = get().tracks;
        set({ playlists: get().playlists.filter((p) => p.id !== id), tracks });
        const view = useViewStore.getState();
        if (view.activeView === viewOfPlaylist(id)) view.setActiveView('filter');
        notify(`Deleted "${playlist.name}"`, 'success');
      } catch (error) {
        notify(`Could not delete the playlist: ${errorMessage(error)}`, 'error');
      }
    },

    async move(fromIndex, toIndex) {
      const previous = get().playlists;
      if (fromIndex === toIndex) return;
      const playlists = arrayMove(previous, fromIndex, toIndex);
      set({ playlists });
      try {
        await api('/api/playlists/order', {
          method: 'PUT',
          json: { ids: playlists.map((p) => p.id) },
        });
      } catch (error) {
        set({ playlists: previous });
        notify(`Could not save the order: ${errorMessage(error)}`, 'error');
      }
    },

    setRenaming: (renamingId) => set({ renamingId }),
  };
});
