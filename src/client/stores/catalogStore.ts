'use client';

import { create } from 'zustand';
import type { CatalogSnapshot } from '@/lib/catalog/snapshot';
import { decodeSnapshot, type Catalog } from '@/client/catalog/decode';
import { idbGet, idbSet } from '@/client/storage/idb';

const CACHE_KEY = 'catalog-snapshot';
const WAIT_RETRY_MS = 5_000;

export type CatalogStatus =
  /** Nothing loaded yet. */
  | 'loading'
  /** The server has not finished its first sync. */
  | 'waiting'
  | 'ready'
  | 'error';

interface CatalogState {
  status: CatalogStatus;
  catalog: Catalog | null;
  error: string | null;
  /** Shows the cached catalog at once, then revalidates with the server. */
  load(): Promise<void>;
  /** Fetches /api/catalog, sending the current version as If-None-Match. */
  revalidate(): Promise<void>;
}

let inflight: Promise<void> | null = null;
let retryTimer: ReturnType<typeof setTimeout> | null = null;

export const useCatalogStore = create<CatalogState>()((set, get) => ({
  status: 'loading',
  catalog: null,
  error: null,

  async load() {
    if (!get().catalog) {
      const cached = await idbGet<CatalogSnapshot>(CACHE_KEY);
      if (cached && !get().catalog) {
        try {
          set({ catalog: decodeSnapshot(cached), status: 'ready' });
        } catch {
          // Corrupt or outdated cache: ignore it, the server copy replaces it.
        }
      }
    }
    await get().revalidate();
  },

  revalidate() {
    inflight ??= (async () => {
      if (retryTimer) clearTimeout(retryTimer);
      retryTimer = null;
      const current = get().catalog;
      try {
        const response = await fetch('/api/catalog', {
          cache: 'no-store',
          headers: current ? { 'if-none-match': `"${current.version}"` } : {},
        });
        if (response.status === 304) {
          set({ status: 'ready', error: null });
        } else if (response.status === 503) {
          if (!current) set({ status: 'waiting', error: null });
          retryTimer = setTimeout(() => void get().revalidate(), WAIT_RETRY_MS);
        } else if (response.ok) {
          const snapshot = (await response.json()) as CatalogSnapshot;
          set({ catalog: decodeSnapshot(snapshot), status: 'ready', error: null });
          await idbSet(CACHE_KEY, snapshot);
        } else {
          throw new Error(`The server answered HTTP ${response.status}`);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        // Keep showing a cached catalog when the server is unreachable.
        set(current ? { error: message } : { status: 'error', error: message });
      }
    })().finally(() => {
      inflight = null;
    });
    return inflight;
  },
}));
