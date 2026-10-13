import type { StateStorage } from 'zustand/middleware';

/**
 * localStorage for persisted stores, browser only. On the server (pre-rendering) it throws,
 * which makes zustand skip persistence there; it also avoids Node's experimental global
 * `localStorage`, which warns when touched.
 */
export function browserLocalStorage(): StateStorage {
  if (typeof window === 'undefined') throw new Error('localStorage is only used in the browser');
  return window.localStorage;
}
