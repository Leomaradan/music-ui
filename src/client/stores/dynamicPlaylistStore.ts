'use client';

import { create } from 'zustand';
import { api } from '@/client/api';
import type { DynamicPlaylist, DynamicPlaylistInput } from '@/lib/dynamicPlaylists/types';
import { notify } from './notificationStore';
import { useViewStore, viewOfDynamic } from './viewStore';

/** The editor dialog: a new playlist (`id` null) or an existing one. */
export interface DynamicEditor {
  id: string | null;
  initial: DynamicPlaylistInput;
  /** Changes on every opening, so the form starts afresh. */
  serial: number;
}

let serial = 0;

interface DynamicPlaylistState {
  playlists: DynamicPlaylist[];
  status: 'loading' | 'ready' | 'error';
  editor: DynamicEditor | null;

  load(): Promise<void>;
  /** Opens the editor on a playlist, or on a new one. */
  edit(id?: string): void;
  closeEditor(): void;
  /** Creates or updates the playlist being edited, then shows it. Resolves to success. */
  save(input: DynamicPlaylistInput): Promise<boolean>;
  remove(id: string): Promise<void>;
}

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));

export const NEW_DYNAMIC_PLAYLIST: DynamicPlaylistInput = {
  name: 'New smart playlist',
  match: 'all',
  criteria: [{ field: 'genre', op: '==', value: '' }],
};

/** Dynamic playlists (PLAN.md §7.2b), stored by the app. Their tracks are computed. */
export const useDynamicPlaylistStore = create<DynamicPlaylistState>()((set, get) => ({
  playlists: [],
  status: 'loading',
  editor: null,

  async load() {
    try {
      const { playlists } = await api<{ playlists: DynamicPlaylist[] }>('/api/dynamic-playlists');
      set({ playlists, status: 'ready' });
    } catch (error) {
      set({ status: 'error' });
      notify(`Could not load the smart playlists: ${errorMessage(error)}`, 'error');
    }
  },

  edit(id) {
    const playlist = id ? get().playlists.find((p) => p.id === id) : undefined;
    if (playlist) {
      const { id: _, ...initial } = playlist;
      set({ editor: { id: playlist.id, initial, serial: ++serial } });
    } else {
      set({ editor: { id: null, initial: NEW_DYNAMIC_PLAYLIST, serial: ++serial } });
    }
  },

  closeEditor: () => set({ editor: null }),

  async save(input) {
    const id = get().editor?.id ?? null;
    try {
      const saved = await api<DynamicPlaylist>(
        id ? `/api/dynamic-playlists/${encodeURIComponent(id)}` : '/api/dynamic-playlists',
        { method: id ? 'PUT' : 'POST', json: input },
      );
      set({
        playlists: id
          ? get().playlists.map((p) => (p.id === id ? saved : p))
          : [...get().playlists, saved],
        editor: null,
      });
      useViewStore.getState().setActiveView(viewOfDynamic(saved.id));
      notify(id ? `Saved "${saved.name}"` : `Created "${saved.name}"`, 'success');
      return true;
    } catch (error) {
      notify(`Could not save the smart playlist: ${errorMessage(error)}`, 'error');
      return false;
    }
  },

  async remove(id) {
    const playlist = get().playlists.find((p) => p.id === id);
    if (!playlist) return;
    try {
      await api(`/api/dynamic-playlists/${encodeURIComponent(id)}`, { method: 'DELETE' });
      set({ playlists: get().playlists.filter((p) => p.id !== id) });
      const view = useViewStore.getState();
      if (view.activeView === viewOfDynamic(id)) view.setActiveView('filter');
      notify(`Deleted "${playlist.name}"`, 'success');
    } catch (error) {
      notify(`Could not delete the smart playlist: ${errorMessage(error)}`, 'error');
    }
  },
}));
