'use client';

import { useMemo } from 'react';
import type { Track } from '@/client/catalog/decode';
import { getFacets, type Facets } from '@/client/catalog/facets';
import { useCatalogStore } from '@/client/stores/catalogStore';
import { useFilterStore } from '@/client/stores/filterStore';
import { useViewStore } from '@/client/stores/viewStore';

const NO_TRACKS: Track[] = [];

/** Filter box options and the tracks matching the filters (null until the catalog loads). */
export function useFacets(): Facets | null {
  const catalog = useCatalogStore((state) => state.catalog);
  const filters = useFilterStore((state) => state.filters);
  return catalog ? getFacets(catalog, filters) : null;
}

/** Tracks listed by the table for the active sidebar entry, before sorting. */
export function useTableTracks(): Track[] {
  const facets = useFacets();
  const excluded = useFilterStore((state) => state.excluded);
  const view = useViewStore((state) => state.activeView);
  return useMemo(() => {
    // The play queue arrives with the player (M8).
    if (view === 'queue' || !facets) return NO_TRACKS;
    if (excluded.length === 0) return facets.tracks;
    const hidden = new Set(excluded);
    return facets.tracks.filter((track) => !hidden.has(track.id));
  }, [facets, excluded, view]);
}
