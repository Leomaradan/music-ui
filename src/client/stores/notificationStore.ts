'use client';

import { create } from 'zustand';

export interface Notification {
  key: number;
  message: string;
  severity: 'success' | 'info' | 'error';
}

interface NotificationState {
  current: Notification | null;
  notify(message: string, severity?: Notification['severity']): void;
  dismiss(): void;
}

let key = 0;

/** One transient message at a time (Snackbar). */
export const useNotificationStore = create<NotificationState>()((set) => ({
  current: null,
  notify: (message, severity = 'info') => set({ current: { key: ++key, message, severity } }),
  dismiss: () => set({ current: null }),
}));

export const notify = (message: string, severity?: Notification['severity']) =>
  useNotificationStore.getState().notify(message, severity);
