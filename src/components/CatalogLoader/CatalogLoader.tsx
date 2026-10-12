'use client';

import { useEffect } from 'react';
import { pruneFilters } from '@/client/catalog/facets';
import { useCatalogStore } from '@/client/stores/catalogStore';
import { useFilterStore } from '@/client/stores/filterStore';
import { usePlaylistStore } from '@/client/stores/playlistStore';
import { useViewStore } from '@/client/stores/viewStore';

const REVALIDATE_MS = 60_000;

/**
 * Restores the persisted UI state, loads the catalog (IndexedDB cache first, then the server)
 * and the playlists, and refreshes them periodically and when the tab becomes visible again.
 * Renders nothing.
 */
export default function CatalogLoader() {
  useEffect(() => {
    void useFilterStore.persist.rehydrate();
    void useViewStore.persist.rehydrate();
    const { load, revalidate } = useCatalogStore.getState();
    void load();
    void usePlaylistStore.getState().load();

    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      void revalidate();
      // Playlists may have changed in another client of the account.
      void usePlaylistStore.getState().load();
    };
    document.addEventListener('visibilitychange', onVisible);
    const timer = setInterval(() => void revalidate(), REVALIDATE_MS);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      clearInterval(timer);
    };
  }, []);

  // A new catalog version can drop folders, genres, artists or albums still selected.
  const catalog = useCatalogStore((state) => state.catalog);
  useEffect(() => {
    if (!catalog) return;
    const { filters, replaceFilters } = useFilterStore.getState();
    const pruned = pruneFilters(catalog, filters);
    if (pruned !== filters) replaceFilters(pruned);
  }, [catalog]);

  return null;
}
