'use client';

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { browserLocalStorage } from '@/client/storage/local';
import {
  EMPTY_FILTERS,
  FILTER_LEVELS,
  type FilterLevel,
  type Filters,
} from '@/client/catalog/facets';
import { useSelectionStore } from './selectionStore';
import { useViewStore } from './viewStore';

interface FilterState {
  filters: Filters;
  /** Track ids removed from "Filter results" (hidden only). Cleared on any filter change. */
  excluded: string[];
  /** Sets one box's selection. Clears the boxes after it (PLAN.md §7.3). */
  setLevel<L extends FilterLevel>(level: L, values: Filters[L]): void;
  /** Adds or removes one value in a box (same cascade rules as setLevel). */
  toggle<L extends FilterLevel>(level: L, value: Filters[L][number]): void;
  /** Replaces all filters without side effects (used to prune stale values). */
  replaceFilters(filters: Filters): void;
  exclude(ids: Iterable<string>): void;
  restoreExcluded(): void;
}

export const useFilterStore = create<FilterState>()(
  persist(
    (set, get) => ({
      filters: EMPTY_FILTERS,
      excluded: [],

      setLevel(level, values) {
        const filters = { ...get().filters, [level]: [...values] };
        for (const child of FILTER_LEVELS.slice(FILTER_LEVELS.indexOf(level) + 1)) {
          filters[child] = [];
        }
        set({ filters, excluded: [] });
        // Changing a filter shows the filter results and drops the row selection.
        useViewStore.getState().setActiveView('filter');
        useSelectionStore.getState().clear();
      },

      toggle(level, value) {
        const current = get().filters[level] as Filters[typeof level][number][];
        const next = current.includes(value)
          ? current.filter((v) => v !== value)
          : [...current, value];
        get().setLevel(level, next as Filters[typeof level]);
      },

      replaceFilters: (filters) => set({ filters }),

      exclude(ids) {
        const excluded = new Set(get().excluded);
        for (const id of ids) excluded.add(id);
        set({ excluded: [...excluded] });
        useSelectionStore.getState().clear();
      },

      restoreExcluded: () => set({ excluded: [] }),
    }),
    {
      name: 'music-ui:filters',
      storage: createJSONStorage(browserLocalStorage),
      partialize: ({ filters, excluded }) => ({ filters, excluded }),
      skipHydration: true,
    },
  ),
);
