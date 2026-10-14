'use client';

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { browserLocalStorage } from '@/client/storage/local';

/**
 * Sidebar entry shown in the track table: the queue, the filter results, a playlist or a
 * dynamic (smart) playlist.
 */
export type ActiveView = 'queue' | 'filter' | `playlist:${string}` | `dynamic:${string}`;

export const viewOfPlaylist = (id: string): ActiveView => `playlist:${id}`;

/** The playlist id of a playlist view, or null. */
export const playlistOfView = (view: ActiveView): string | null =>
  view.startsWith('playlist:') ? view.slice('playlist:'.length) : null;

export const viewOfDynamic = (id: string): ActiveView => `dynamic:${id}`;

/** The dynamic playlist id of a dynamic playlist view, or null. */
export const dynamicOfView = (view: ActiveView): string | null =>
  view.startsWith('dynamic:') ? view.slice('dynamic:'.length) : null;

export interface SortEntry {
  id: string;
  desc: boolean;
}

interface ViewState {
  activeView: ActiveView;
  sorting: SortEntry[];
  columnSizing: Record<string, number>;
  setActiveView(view: ActiveView): void;
  setSorting(sorting: SortEntry[]): void;
  setColumnSizing(sizing: Record<string, number>): void;
}

export const useViewStore = create<ViewState>()(
  persist(
    (set) => ({
      activeView: 'filter',
      sorting: [],
      columnSizing: {},
      setActiveView: (activeView) => set({ activeView }),
      setSorting: (sorting) => set({ sorting }),
      setColumnSizing: (columnSizing) => set({ columnSizing }),
    }),
    {
      name: 'music-ui:view',
      storage: createJSONStorage(browserLocalStorage),
      partialize: ({ sorting, columnSizing }) => ({ sorting, columnSizing }),
      // Rehydrated after mount (see CatalogLoader) so server and client first renders match.
      skipHydration: true,
    },
  ),
);
