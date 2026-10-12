'use client';

import { create } from 'zustand';
import { EMPTY_SELECTION, type Selection } from '@/client/selection';

interface SelectionState {
  selection: Selection;
  setSelection(selection: Selection): void;
  clear(): void;
}

/** Selected rows of the track table. Not persisted. */
export const useSelectionStore = create<SelectionState>()((set) => ({
  selection: EMPTY_SELECTION,
  setSelection: (selection) => set({ selection }),
  clear: () => set({ selection: EMPTY_SELECTION }),
}));
