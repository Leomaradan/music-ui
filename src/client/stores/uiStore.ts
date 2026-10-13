'use client';

import { create } from 'zustand';

export type SettingsTab = 'library' | 'appearance' | 'shortcuts';

interface UiState {
  /** Open tab of the settings dialog, or null when closed. */
  settings: SettingsTab | null;
  openSettings(tab?: SettingsTab): void;
  closeSettings(): void;
}

export const useUiStore = create<UiState>()((set) => ({
  settings: null,
  openSettings: (tab = 'library') => set({ settings: tab }),
  closeSettings: () => set({ settings: null }),
}));
