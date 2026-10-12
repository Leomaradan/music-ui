'use client';

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { browserLocalStorage } from '@/client/storage/local';

/** Sidebar entry shown in the track table (custom playlists arrive in M9). */
export type ActiveView = 'queue' | 'filter';

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
